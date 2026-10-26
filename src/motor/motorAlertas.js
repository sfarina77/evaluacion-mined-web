/**
 * Port 1:1 de apps/detector/motor_alertas.py (docs/motor_alertas_spec.md, 2026-07-23).
 * Mismo port que ya se hizo a Kotlin en apps/cliente-android -- las TRES
 * plataformas (Windows, Android, web) tienen que decidir exactamente igual
 * ante los mismos eventos. Si cambia una regla acá, cambia en las otras dos
 * y en el .py, no solo en la que se esté editando.
 *
 * Reglas generales del spec:
 * - Cada alerta pesa igual; a las 10 el examen se ANULA automáticamente.
 * - Un evento continuo cuenta 1 sola vez mientras dure.
 * - En la alerta 7 se emite un AVISO al estudiante (no detiene el examen).
 * - Cada alerta que cuenta se etiqueta "conductual" o "técnica no confirmada".
 * - Falla técnica CONFIRMADA por señales del dispositivo/red (situación 7) se
 *   registra pero NO suma al contador.
 * - Apelación: >60% técnicas no confirmadas -> nuevo intento automático;
 *   >=60% conductuales -> rechazo automático; si no se alcanza ninguna de las
 *   dos mayorías (posible con 10 alertas: 5 o 6 técnicas) -> revisión manual.
 */

/** Las 8 situaciones del spec, en su numeración original. */
export const Situacion = Object.freeze({
  FUERA_DE_ENCUADRE: "fuera_de_encuadre", // 1: tolera 10s
  SEGUNDA_PERSONA: "segunda_persona", // 2: 2+ rostros -> inmediata
  MIRADA_FUERA: "mirada_fuera", // 3: 5 veces seguidas
  OBJETO_NO_PERMITIDO: "objeto_no_permitido", // 4: celular/libro/smartwatch
  AUSENCIA_PROLONGADA: "ausencia_prolongada", // 5: timer propio + bloqueo
  CORTE_ABRUPTO: "corte_abrupto", // 6: cierre laptop / corte total
  FALLA_TECNICA: "falla_tecnica", // 7: confirmada -> NO cuenta
  EVASION_KIOSCO: "evasion_kiosco", // 8: solo si evade el bloqueo
});

export const Etiqueta = Object.freeze({
  CONDUCTUAL: "conductual",
  TECNICA_NO_CONFIRMADA: "tecnica_no_confirmada",
});

/**
 * Acciones que la interfaz del examen debe ejecutar. Los valores son los
 * NOMBRES DEL CONTRATO (ver docs/integracion_cliente.md / senal_motor.json).
 */
export const Accion = Object.freeze({
  ALERTA: "alerta",
  AVISO_ESTUDIANTE: "aviso_estudiante",
  BLOQUEAR_EXAMEN: "bloquear_examen",
  REACTIVAR_EXAMEN: "reactivar_examen",
  ANULAR_EXAMEN: "anular_examen",
  REGISTRO_SIN_ALERTA: "registro_sin_alerta",
});

export const EstadoExamen = Object.freeze({
  ACTIVO: "activo",
  BLOQUEADO: "bloqueado",
  ANULADO: "anulado",
});

export const Apelacion = Object.freeze({
  NUEVO_INTENTO: "nuevo_intento",
  RECHAZO: "rechazo",
  REVISION_MANUAL: "revision_manual",
});

/** Etiqueta por defecto de cada situación (ver motor_alertas.py para el porqué
 * de CORTE_ABRUPTO -> técnica no confirmada). */
const ETIQUETA_DEFAULT = {
  [Situacion.FUERA_DE_ENCUADRE]: Etiqueta.CONDUCTUAL,
  [Situacion.SEGUNDA_PERSONA]: Etiqueta.CONDUCTUAL,
  [Situacion.MIRADA_FUERA]: Etiqueta.CONDUCTUAL,
  [Situacion.OBJETO_NO_PERMITIDO]: Etiqueta.CONDUCTUAL,
  [Situacion.AUSENCIA_PROLONGADA]: Etiqueta.CONDUCTUAL,
  [Situacion.CORTE_ABRUPTO]: Etiqueta.TECNICA_NO_CONFIRMADA,
  [Situacion.EVASION_KIOSCO]: Etiqueta.CONDUCTUAL,
};

const GRAVES = new Set([Situacion.CORTE_ABRUPTO, Situacion.EVASION_KIOSCO]);

/**
 * Máquina de estados del contador de alertas del examen. Los tiempos se pasan
 * como segundos monotónicos del examen (no reloj de pared -- usar
 * `performance.now() / 1000` en el navegador), lo que hace el motor
 * determinista y testeable, igual que en Python/Kotlin.
 */
export class MotorAlertas {
  constructor({
    toleranciaEncuadreSeg = 10.0,
    miradasParaAlerta = 5,
    umbralAusenciaSeg = 60.0, // PENDIENTE stakeholder (valor en minutos)
    pausaMaximaSeg = 300.0, // PENDIENTE stakeholder: anula si se excede
    maxAlertas = 10,
    alertaDeAviso = 7,
  } = {}) {
    this.toleranciaEncuadreSeg = toleranciaEncuadreSeg;
    this.miradasParaAlerta = miradasParaAlerta;
    this.umbralAusenciaSeg = umbralAusenciaSeg;
    this.pausaMaximaSeg = pausaMaximaSeg;
    this.maxAlertas = maxAlertas;
    this.alertaDeAviso = alertaDeAviso;

    this.estado = EstadoExamen.ACTIVO;
    this.alertas = [];
    this.registros = []; // fallas técnicas confirmadas (no suman)
    this.bloqueosEmitidos = 0;

    this._fueraDesde = null;
    this._fueraAlertado = false; // el episodio actual ya generó su única alerta
    this._ausenciaAlertada = false;
    this._bloqueadoDesde = null;
    this._miradasSeguidas = 0;
    this._episodiosAbiertos = new Set(); // dedup de eventos continuos
  }

  get contador() {
    return this.alertas.filter((a) => a.cuenta).length;
  }

  _sumar(situacion, t, etiqueta = null) {
    if (this.estado === EstadoExamen.ANULADO) return [];
    const alerta = {
      situacion,
      etiqueta: etiqueta ?? ETIQUETA_DEFAULT[situacion],
      t,
      grave: GRAVES.has(situacion),
      cuenta: true,
    };
    this.alertas.push(alerta);
    const acciones = [Accion.ALERTA];
    if (this.contador === this.alertaDeAviso) acciones.push(Accion.AVISO_ESTUDIANTE);
    if (this.contador >= this.maxAlertas) {
      this.estado = EstadoExamen.ANULADO;
      acciones.push(Accion.ANULAR_EXAMEN);
    }
    return acciones;
  }

  // ------------------------------------------------- situaciones 1 y 5 (encuadre)

  /** Llamar en cada tick mientras el candidato NO está en cámara. */
  sinCandidato(t) {
    if (this.estado === EstadoExamen.ANULADO) return [];
    let acciones = [];
    if (this._fueraDesde === null) {
      this._fueraDesde = t;
      this._fueraAlertado = false;
      this._ausenciaAlertada = false;
    }
    const fuera = t - this._fueraDesde;
    // Situación 1: tolera 10s; pasado eso, 1 alerta por episodio
    if (fuera > this.toleranciaEncuadreSeg && !this._fueraAlertado) {
      this._fueraAlertado = true;
      acciones = acciones.concat(this._sumar(Situacion.FUERA_DE_ENCUADRE, t));
    }
    // Situación 5: ausencia prolongada -> alerta propia + bloquear pantalla
    if (fuera > this.umbralAusenciaSeg && !this._ausenciaAlertada) {
      this._ausenciaAlertada = true;
      acciones = acciones.concat(this._sumar(Situacion.AUSENCIA_PROLONGADA, t));
      if (this.estado !== EstadoExamen.ANULADO) {
        this.estado = EstadoExamen.BLOQUEADO;
        this._bloqueadoDesde = t;
        this.bloqueosEmitidos += 1;
        acciones.push(Accion.BLOQUEAR_EXAMEN);
      }
    }
    // Pausa máxima excedida -> anulación directa
    if (this.estado === EstadoExamen.BLOQUEADO && t - this._bloqueadoDesde > this.pausaMaximaSeg) {
      this.estado = EstadoExamen.ANULADO;
      acciones.push(Accion.ANULAR_EXAMEN);
    }
    return acciones;
  }

  /** Llamar en cada tick mientras el candidato SÍ está en cámara. */
  candidatoPresente(t) {
    const acciones = [];
    if (this.estado === EstadoExamen.BLOQUEADO) {
      // reactivación automática al volver a cámara
      this.estado = EstadoExamen.ACTIVO;
      this._bloqueadoDesde = null;
      acciones.push(Accion.REACTIVAR_EXAMEN);
    }
    this._fueraDesde = null;
    this._fueraAlertado = false;
    this._ausenciaAlertada = false;
    return acciones;
  }

  // --------------------------------------------------------- situación 2 (rostros)

  /** 2+ rostros simultáneos -> alerta inmediata (1 por episodio continuo). */
  rostrosDetectados(nRostros, t) {
    if (nRostros >= 2) {
      if (!this._episodiosAbiertos.has(Situacion.SEGUNDA_PERSONA)) {
        this._episodiosAbiertos.add(Situacion.SEGUNDA_PERSONA);
        return this._sumar(Situacion.SEGUNDA_PERSONA, t);
      }
    } else {
      this._episodiosAbiertos.delete(Situacion.SEGUNDA_PERSONA);
    }
    return [];
  }

  // ---------------------------------------------------------- situación 3 (mirada)

  /** Cada episodio de mirada fuera de pantalla; alerta a las 5 seguidas. */
  miradaFuera(t) {
    this._miradasSeguidas += 1;
    if (this._miradasSeguidas >= this.miradasParaAlerta) {
      this._miradasSeguidas = 0;
      return this._sumar(Situacion.MIRADA_FUERA, t);
    }
    return [];
  }

  /** Rompe la racha: "seguidas" significa consecutivas. */
  miradaNormal() {
    this._miradasSeguidas = 0;
  }

  // ---------------------------------------------------------- situación 4 (objetos)

  /** Detección directa por cámara; 1 alerta por episodio continuo del objeto. */
  objetoNoPermitido(objeto, t) {
    const clave = `objeto:${objeto}`;
    if (!this._episodiosAbiertos.has(clave)) {
      this._episodiosAbiertos.add(clave);
      return this._sumar(Situacion.OBJETO_NO_PERMITIDO, t);
    }
    return [];
  }

  objetoRetirado(objeto) {
    this._episodiosAbiertos.delete(`objeto:${objeto}`);
  }

  // ------------------------------------------------------ situaciones 6, 7 y 8

  /** Cierre del equipo / corte total e inmediato de señal (grave). */
  corteAbrupto(t, etiqueta = null) {
    return this._sumar(Situacion.CORTE_ABRUPTO, t, etiqueta);
  }

  /** Confirmada por señales del dispositivo/red: se registra, NO suma. */
  fallaTecnicaConfirmada(_detalle, t) {
    this.registros.push({
      situacion: Situacion.FALLA_TECNICA,
      etiqueta: Etiqueta.TECNICA_NO_CONFIRMADA,
      t,
      grave: false,
      cuenta: false,
    });
    return [Accion.REGISTRO_SIN_ALERTA];
  }

  /** El bloqueo preventivo es del cliente; si lo evade, alerta grave. En el
   * cliente web esto es la defensa PRINCIPAL, no un caso degradado -- ver
   * README de este módulo. */
  evasionKiosco(t) {
    return this._sumar(Situacion.EVASION_KIOSCO, t);
  }

  // ---------------------------------------------------------------- apelación

  resolverApelacion() {
    const contadas = this.alertas.filter((a) => a.cuenta);
    if (contadas.length === 0) return Apelacion.REVISION_MANUAL;
    const tecnicas = contadas.filter((a) => a.etiqueta === Etiqueta.TECNICA_NO_CONFIRMADA).length;
    const conductuales = contadas.length - tecnicas;
    if (tecnicas / contadas.length > 0.6) return Apelacion.NUEVO_INTENTO;
    if (conductuales / contadas.length >= 0.6) return Apelacion.RECHAZO;
    return Apelacion.REVISION_MANUAL;
  }

  // ------------------------------------------------------------------ reporte

  resumen() {
    return {
      estado: this.estado,
      contador: this.contador,
      alertas: this.alertas.map((a) => ({
        situacion: a.situacion,
        etiqueta: a.etiqueta,
        t: a.t,
        grave: a.grave,
      })),
      fallasTecnicasRegistradas: this.registros.length,
    };
  }
}
