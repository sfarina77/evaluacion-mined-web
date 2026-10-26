/**
 * Port 1:1 de apps/detector/gestor_alertas.py: debounce y línea de tiempo de
 * las detecciones crudas de cámara (no confundir con MotorAlertas, que es el
 * contador de las 10 alertas que sí definen la anulación).
 */

/** Severidad estática por tipo de detección (igual que SEVERIDAD en el .py). */
export const SEVERIDAD = Object.freeze({
  candidato_ausente: "alta",
  persona_adicional: "alta",
  dispositivo_adicional: "alta",
  rostro_no_visible: "media",
  encuadre_incorrecto: "media",
  distraccion_facial: "baja",
});

export class GestorAlertas {
  constructor({
    // Una condición debe sostenerse este tiempo (seg) antes de emitir alerta.
    debounceSeg = 1.5,
    // Un episodio tolera micro-cortes de detección (parpadeos frame a frame).
    gapToleranciaSeg = 0.7,
    // Ausencia: gap más largo para no partir una sola salida en muchos episodios
    // (ver motor_alertas_spec.md / gestor_alertas.py, prueba en vivo 2026-07-27).
    gapAusenciaSeg = 7.0,
  } = {}) {
    this.debounceSeg = debounceSeg;
    this.gapToleranciaSeg = gapToleranciaSeg;
    this.gapPorTipo = { candidato_ausente: gapAusenciaSeg };

    this.candidatas = new Map(); // tipo -> t_inicio_condicion
    this.activas = new Map(); // tipo -> segmento abierto
    this.ultimoVisto = new Map(); // tipo -> último t visto
    this.timeline = [];
  }

  _toleranciaDe(tipo) {
    return this.gapPorTipo[tipo] ?? this.gapToleranciaSeg;
  }

  /** Segmentos aún abiertos -- lo consulta el detector para saber qué
   * alimentar al motor y (si aplica) a qué sacarle una foto de evidencia. */
  get activasTipos() {
    return new Set(this.activas.keys());
  }

  actualizar(tiposPresentes, t) {
    const presentes = tiposPresentes instanceof Set ? tiposPresentes : new Set(tiposPresentes);

    // abrir/confirmar
    for (const tipo of presentes) {
      this.ultimoVisto.set(tipo, t);
      if (!this.candidatas.has(tipo)) this.candidatas.set(tipo, t);
      if (!this.activas.has(tipo) && t - this.candidatas.get(tipo) >= this.debounceSeg) {
        this.activas.set(tipo, {
          tipo,
          severidad: SEVERIDAD[tipo] ?? "media",
          t_inicio: round2(this.candidatas.get(tipo)),
        });
      }
    }

    // cerrar las que ya no están (tolerando micro-cortes de detección)
    for (const tipo of Array.from(this.candidatas.keys())) {
      if (!presentes.has(tipo)) {
        const visto = this.ultimoVisto.has(tipo) ? this.ultimoVisto.get(tipo) : t;
        if (t - visto <= this._toleranciaDe(tipo)) {
          continue; // parpadeo: el episodio sigue vivo
        }
        if (this.activas.has(tipo)) {
          const seg = this.activas.get(tipo);
          this.activas.delete(tipo);
          seg.t_fin = round2(this.ultimoVisto.get(tipo));
          seg.duracion_seg = round2(seg.t_fin - seg.t_inicio);
          this.timeline.push(seg);
        }
        this.candidatas.delete(tipo);
      }
    }
  }

  /** Cierra los segmentos que quedaron abiertos al terminar la sesión. */
  cerrar(t) {
    for (const seg of this.activas.values()) {
      seg.t_fin = round2(t);
      seg.duracion_seg = round2(seg.t_fin - seg.t_inicio);
      this.timeline.push(seg);
    }
    this.activas.clear();
    return [...this.timeline].sort((a, b) => a.t_inicio - b.t_inicio);
  }
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Agrega fecha y hora absolutas (UTC, ISO 8601) a cada segmento. El gestor
 * trabaja en segundos relativos al arranque de la sesión (determinista);
 * esto los convierte a instantes reales, igual que espera el backend.
 */
export function conFechas(timeline, inicioEpochSeg) {
  const inicioMs = inicioEpochSeg * 1000;
  return timeline.map((seg) => ({
    ...seg,
    ts_inicio: new Date(inicioMs + seg.t_inicio * 1000).toISOString(),
    ts_fin: seg.t_fin != null ? new Date(inicioMs + seg.t_fin * 1000).toISOString() : null,
  }));
}
