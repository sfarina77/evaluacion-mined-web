import { MotorAlertas, Accion, EstadoExamen } from "../motor/motorAlertas.js";
import { GestorAlertas } from "../motor/gestorAlertas.js";
import { alimentar, crearEstadoAlimentador } from "../motor/alimentarMotor.js";
import { crearDetector } from "../deteccion/proctorDetector.js";
import { guardarYEncolar } from "../sesion/colaSubida.js";
import { pantallaExtendida } from "./entorno.js";
import { crearReporteEnVivo } from "../sesion/reporteEnVivo.js";

/**
 * Controlador de la pantalla de examen: iframe + bloqueo a nivel de
 * navegador + supervisión por cámara, todo en la misma página -- mismo
 * esquema conceptual que ExamenActivity.kt en Android y
 * examen_unificado.py en Windows.
 *
 * ADVERTENCIA DE NIVEL DE SEGURIDAD (leer antes de asumir que esto bloquea
 * igual que Android): un navegador NUNCA puede atrapar al usuario de verdad.
 * `requestFullscreen()` se puede salir con Escape -- el navegador lo permite
 * A PROPÓSITO, por seguridad del usuario, y ninguna API web puede evitarlo
 * (a diferencia de `Lock Task Mode` en Android, que si está autorizado por
 * un MDM sí deshabilita esa salida). Por eso acá la detección de evasión NO
 * es un caso degradado como en Android/Windows -- es la defensa PRINCIPAL:
 * cualquier salida de pantalla completa, cambio de pestaña o segundo monitor
 * queda registrada; las primeras son advertencias, y cada bloqueo que exige
 * la clave del docente es una alerta grave en el contador de 10. Ver
 * docs/chromebooks_spike.md.
 */
export function iniciarExamen({ examenId, nie, info }) {
  const vista = document.getElementById("vista-examen");
  const marco = document.getElementById("marco-examen");
  const bannerAviso = document.getElementById("banner-aviso");
  const overlayBloqueo = document.getElementById("overlay-bloqueo");
  const gatilloSalida = document.getElementById("gatillo-salida-pin");
  const dialogoPin = document.getElementById("dialogo-pin");
  const campoPin = document.getElementById("campo-pin");
  const mensajePinError = document.getElementById("mensaje-pin-error");
  const botonPinConfirmar = document.getElementById("boton-pin-confirmar");
  const botonPinCancelar = document.getElementById("boton-pin-cancelar");
  const overlayInicio = document.getElementById("overlay-inicio");
  const botonComenzar = document.getElementById("boton-comenzar");
  const overlayEvasion = document.getElementById("overlay-evasion");
  const campoReingreso = document.getElementById("campo-reingreso");
  const mensajeReingresoError = document.getElementById("mensaje-reingreso-error");
  const botonReingreso = document.getElementById("boton-reingreso");
  const overlayAdvertencia = document.getElementById("overlay-advertencia");
  const tituloAdvertencia = document.getElementById("titulo-advertencia");
  const textoAdvertenciasRestantes = document.getElementById("texto-advertencias-restantes");
  const mensajeAdvertenciaError = document.getElementById("mensaje-advertencia-error");
  const botonVolverExamen = document.getElementById("boton-volver-examen");

  const motor = new MotorAlertas(); // límites del spec: aviso en la 7, anulación en la 10
  const gestor = new GestorAlertas();
  const estadoAlimentador = crearEstadoAlimentador();
  const reporte = crearReporteEnVivo({ examenId, nie });
  const t0Seg = ahoraSeg();
  const pinSalida = info.pin_salida ?? "0000";
  // Misma clave que usa el cliente Windows; si el examen no la define, el
  // docente usa el PIN de salida.
  const claveReingreso = info.clave_reingreso ?? pinSalida;
  // Salidas que solo advierten (el estudiante vuelve solo) antes de que la
  // siguiente bloquee con clave del docente. Las advertencias NO suman al
  // contador de anulación (decisión 27/10/2026): se registran en la sesión
  // para el docente; solo cada bloqueo con clave es alerta grave del motor.
  const maxAdvertencias = Number.isInteger(info.advertencias_evasion) ? info.advertencias_evasion : 5;
  let salidas = 0;
  const advertencias = []; // { t, motivo }, van en la sesión subida

  // Evita que el propio cierre (PIN correcto, anulación) se cuente a sí mismo
  // como evasión -- mismo guard que `saliendoControladamente` en Android.
  let saliendoControladamente = false;
  let detector = null;
  // Un mismo cambio de pestaña dispara visibilitychange + fullscreenchange
  // (+ pérdida de foco): mientras siga tapado el examen (advertencia o
  // reingreso), es una sola salida y una sola alerta.
  let bloqueadoPorEvasion = false;
  // Pantalla completa y foco solo se vigilan con la supervisión ya corriendo
  // y la pantalla completa ya activada una vez (ver `vigilando`): antes, el
  // aviso de permiso de cámara le quita el foco a la página y la pantalla
  // completa puede no haberse concedido todavía.
  let supervisionLista = false;
  const vigilando = () => supervisionLista && overlayInicio.hidden;

  function ahoraSeg() {
    return Date.now() / 1000;
  }

  function t() {
    return ahoraSeg() - t0Seg;
  }

  // --------------------------------------------------------------- arranque

  vista.hidden = false;
  marco.src = info.url;

  // El navegador rechaza la pantalla completa si el clic del login ya no es
  // "reciente" (la lista de exámenes se baja en medio): en ese caso el
  // estudiante la activa con el botón de overlay-inicio, sin penalización.
  document.documentElement.requestFullscreen?.().catch(() => {
    overlayInicio.hidden = false;
  });
  botonComenzar.addEventListener("click", () => {
    document.documentElement
      .requestFullscreen?.()
      .then(() => {
        overlayInicio.hidden = true;
      })
      .catch(() => {});
  });

  configurarGatilloSalida();
  configurarDetectorEvasion();
  configurarSalidaDeNavegador();

  crearDetector({ onFrame: onFrameDetectado })
    .then(async (d) => {
      detector = d;
      await detector.iniciar();
      supervisionLista = true;
      reporte.iniciar({
        estado: "activo",
        contador: 0,
        maxAlertas: motor.maxAlertas,
        advertencias: 0,
        maxAdvertencias,
      });
      if (!document.fullscreenElement) overlayInicio.hidden = false;
    })
    .catch((error) => {
      // La supervisión es obligatoria para rendir el examen (mismo criterio
      // que Android): sin cámara no hay examen sin supervisión posible.
      const sinPermiso = error?.name === "NotAllowedError" || error?.name === "NotFoundError";
      window.alert(
        sinPermiso
          ? "La supervisión necesita la cámara para rendir el examen. " +
              "Revisa el permiso de cámara del navegador e intenta de nuevo."
          : error?.name === "CamaraVirtualError"
            ? "Solo se encontró una cámara virtual (OBS, ManyCam o similar). " +
              "Para rendir el examen se necesita la cámara real del equipo."
            : "No se pudo iniciar la supervisión (no cargaron los modelos de detección). " +
              "Avisa al encargado técnico.",
      );
      console.error("No se pudo iniciar la supervisión por cámara:", error);
      terminarExamen();
    });

  // ---------------------------------------------------------- supervisión

  function onFrameDetectado(tipos) {
    const tActual = t();
    gestor.actualizar(tipos, tActual);
    const acciones = alimentar(motor, gestor.activasTipos, tActual, estadoAlimentador);
    if (acciones.length) aplicarAcciones(acciones);
  }

  function aplicarAcciones(acciones) {
    for (const accion of acciones) {
      switch (accion) {
        case Accion.ALERTA: {
          // Sin efecto visible para el estudiante; el docente la ve con foto.
          const alerta = motor.alertas.at(-1);
          reporte.evento("alerta", { detalle: alerta.situacion, cuenta: true, t: alerta.t, conFoto: true });
          reporte.estado({ contador: motor.contador });
          break;
        }
        case Accion.AVISO_ESTUDIANTE:
          mostrarAviso();
          reporte.evento("aviso", { detalle: `Se le avisó que lleva ${motor.contador} alertas`, t: t() });
          break;
        case Accion.BLOQUEAR_EXAMEN:
          overlayBloqueo.hidden = false;
          reporte.evento("bloqueo_ausencia", { detalle: "Bloqueado por ausencia prolongada", t: t() });
          reporte.estado({ estado: "bloqueado_ausencia" });
          break;
        case Accion.REACTIVAR_EXAMEN:
          overlayBloqueo.hidden = true;
          reporte.evento("reactivado", { detalle: "Volvió frente a la cámara", t: t() });
          reporte.estado({ estado: "activo" });
          break;
        case Accion.ANULAR_EXAMEN:
          mostrarAnulacionYTerminar();
          break;
        default:
          break;
      }
    }
  }

  function mostrarAviso() {
    bannerAviso.textContent = `Llevas ${motor.contador} de ${motor.maxAlertas} alertas de supervisión. Al llegar a ${motor.maxAlertas} el examen se anula.`;
    bannerAviso.hidden = false;
  }

  function mostrarAnulacionYTerminar() {
    overlayBloqueo.hidden = true;
    bannerAviso.hidden = true;
    window.alert(
      `Examen anulado: se alcanzaron ${motor.contador} alertas de supervisión. El caso pasa a revisión.`,
    );
    terminarExamen();
  }

  // -------------------------------------------------------- evasión (situación 8)

  function configurarDetectorEvasion() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) reportarEvasion("cambio de pestaña o minimizado");
    });
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement || saliendoControladamente) return;
      if (vigilando()) reportarEvasion("salida de pantalla completa");
      else if (!bloqueadoPorEvasion) overlayInicio.hidden = false;
    });
    // Respaldo por sondeo de lo mismo, más otra ventana encima o al lado
    // (p. ej. un chat de IA), que no oculta la pestaña y visibilitychange no
    // ve. Ojo con hasFocus(): da false también cuando el foco está DENTRO del
    // iframe del examen (es de otro origen) -- por eso se excluye ese caso.
    // El segundo monitor también: la pantalla completa ocupa solo uno, y en
    // el otro puede haber un chat de IA sin que la página pierda el foco.
    setInterval(() => {
      if (!vigilando() || document.hidden || dialogoPin.open) return;
      if (pantallaExtendida()) {
        reportarEvasion("segundo monitor conectado");
      } else if (!document.fullscreenElement) {
        reportarEvasion("fuera de pantalla completa");
      } else if (!document.hasFocus() && document.activeElement !== marco) {
        reportarEvasion("otra ventana con el foco");
      }
    }, 1000);
  }

  function reportarEvasion(motivo) {
    if (saliendoControladamente || bloqueadoPorEvasion) return;
    console.warn("[evasión]", motivo, { t: Math.round(t()), vigilando: vigilando() });
    salidas += 1;
    if (salidas <= maxAdvertencias) {
      advertencias.push({ t: t(), motivo });
      reporte.evento("advertencia", {
        detalle: `${motivo} (advertencia ${salidas} de ${maxAdvertencias})`,
        t: t(),
        conFoto: true,
      });
      reporte.estado({ estado: "advertencia", advertencias: salidas });
      mostrarAdvertencia();
      return;
    }
    const acciones = motor.evasionKiosco(t());
    if (acciones.length) aplicarAcciones(acciones);
    if (motor.estado === EstadoExamen.ANULADO || saliendoControladamente) return;
    reporte.evento("bloqueo_evasion", { detalle: `${motivo}: espera la clave del docente`, t: t() });
    reporte.estado({ estado: "bloqueado_evasion" });
    bloquearPorEvasion();
  }

  /** Volver al examen exige el monitor extra ya desconectado: si no, el
   * sondeo lo contaría como otra salida al segundo siguiente. */
  function segundoMonitorPendiente(mensajeError) {
    if (!pantallaExtendida()) return false;
    mensajeError.textContent = "Desconecta el segundo monitor para volver al examen";
    mensajeError.hidden = false;
    return true;
  }

  function mostrarAdvertencia() {
    bloqueadoPorEvasion = true;
    tituloAdvertencia.textContent = `Advertencia ${salidas} de ${maxAdvertencias}`;
    const restantes = maxAdvertencias - salidas;
    textoAdvertenciasRestantes.textContent =
      restantes === 0
        ? "Es tu última advertencia: si vuelves a salir, el examen se bloquea y solo tu docente lo puede reactivar."
        : `Te ${restantes === 1 ? "queda 1 advertencia" : `quedan ${restantes} advertencias`}. Después, el examen se bloquea y solo tu docente lo puede reactivar.`;
    mensajeAdvertenciaError.hidden = true;
    overlayAdvertencia.hidden = false;
  }

  botonVolverExamen.addEventListener("click", () => {
    if (segundoMonitorPendiente(mensajeAdvertenciaError)) return;
    // Mismo criterio que el reingreso: se destapa recién con la pantalla
    // completa concedida, si no el sondeo lo contaría como otra salida.
    document.documentElement
      .requestFullscreen?.()
      .then(() => {
        overlayAdvertencia.hidden = true;
        bloqueadoPorEvasion = false;
        reporte.estado({ estado: "activo" });
      })
      .catch(() => {
        mensajeAdvertenciaError.textContent = "No se pudo volver a pantalla completa, intenta de nuevo";
        mensajeAdvertenciaError.hidden = false;
      });
  });

  function bloquearPorEvasion() {
    bloqueadoPorEvasion = true;
    overlayAdvertencia.hidden = true;
    campoReingreso.value = "";
    mensajeReingresoError.hidden = true;
    overlayEvasion.hidden = false;
  }

  botonReingreso.addEventListener("click", () => {
    if (campoReingreso.value.trim() !== claveReingreso) {
      mensajeReingresoError.textContent = "Clave incorrecta";
      mensajeReingresoError.hidden = false;
      return;
    }
    if (segundoMonitorPendiente(mensajeReingresoError)) return;
    // El clic del docente es el gesto de usuario que el navegador exige para
    // volver a pantalla completa. Se desbloquea recién cuando se concede: si
    // no, el sondeo lo volvería a bloquear al instante.
    document.documentElement
      .requestFullscreen?.()
      .then(() => {
        overlayEvasion.hidden = true;
        bloqueadoPorEvasion = false;
        reporte.evento("reingreso", { detalle: "El docente ingresó la clave de reingreso", t: t() });
        reporte.estado({ estado: "activo" });
      })
      .catch(() => {
        mensajeReingresoError.textContent = "No se pudo volver a pantalla completa, intenta de nuevo";
        mensajeReingresoError.hidden = false;
      });
  });
  campoReingreso.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") botonReingreso.click();
  });

  /** No se puede impedir que cierren la pestaña (ninguna API web lo permite),
   * pero sí avisar -- y si vuelven a entrar, el estado ANULADO ya va a estar
   * ahí esperando (ver comprobarAnulacionAlVolver). */
  function configurarSalidaDeNavegador() {
    window.addEventListener("beforeunload", (evento) => {
      if (!saliendoControladamente) {
        evento.preventDefault();
        evento.returnValue = "";
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) comprobarAnulacionAlVolver();
    });
  }

  function comprobarAnulacionAlVolver() {
    if (motor.estado === EstadoExamen.ANULADO && !saliendoControladamente) {
      mostrarAnulacionYTerminar();
    }
  }

  // ------------------------------------------------------------ salida por PIN

  function configurarGatilloSalida() {
    let temporizador = null;
    const iniciarPresion = () => {
      temporizador = setTimeout(abrirDialogoPin, 600);
    };
    const cancelarPresion = () => clearTimeout(temporizador);

    gatilloSalida.addEventListener("pointerdown", iniciarPresion);
    gatilloSalida.addEventListener("pointerup", cancelarPresion);
    gatilloSalida.addEventListener("pointerleave", cancelarPresion);
  }

  function abrirDialogoPin() {
    campoPin.value = "";
    mensajePinError.hidden = true;
    dialogoPin.showModal();
    campoPin.focus();
  }

  botonPinCancelar.addEventListener("click", () => dialogoPin.close());
  botonPinConfirmar.addEventListener("click", () => {
    if (campoPin.value.trim() === pinSalida) {
      dialogoPin.close();
      terminarExamen();
    } else {
      mensajePinError.hidden = false;
    }
  });

  // ---------------------------------------------------------------- cierre

  function terminarExamen() {
    saliendoControladamente = true;
    detector?.detener();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});

    vista.hidden = true;
    marco.src = "about:blank";

    // Recargar al terminar (no solo volver a mostrar el login): cada
    // iniciarExamen registra sus propios listeners de evasión y de PIN, y sin
    // recargar quedarían vivos con el PIN y el motor del examen anterior.
    const anulado = motor.estado === EstadoExamen.ANULADO;
    reporte.evento("fin", { detalle: anulado ? "Examen anulado" : "Terminó el examen", t: t() });
    Promise.allSettled([
      reporte.cerrar({ estado: anulado ? "anulado" : "terminado", contador: motor.contador }),
      guardarYEncolar({
        examenId,
        nie,
        motor,
        gestor,
        advertencias,
        inicioEpochSeg: t0Seg,
        tFin: t(),
      }).catch((error) => console.error("No se pudo guardar la sesión:", error)),
    ]).finally(() => window.location.reload());
  }
}
