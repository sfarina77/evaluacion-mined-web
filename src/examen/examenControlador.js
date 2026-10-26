import { MotorAlertas, Accion, EstadoExamen } from "../motor/motorAlertas.js";
import { GestorAlertas } from "../motor/gestorAlertas.js";
import { alimentar, crearEstadoAlimentador } from "../motor/alimentarMotor.js";
import { crearDetector } from "../deteccion/proctorDetector.js";
import { guardarYEncolar } from "../sesion/colaSubida.js";

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
 * cualquier salida de pantalla completa o cambio de pestaña se cuenta como
 * alerta grave en el mismo contador de 10. Ver docs/chromebooks_spike.md.
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

  const motor = new MotorAlertas(); // límites del spec: aviso en la 7, anulación en la 10
  const gestor = new GestorAlertas();
  const estadoAlimentador = crearEstadoAlimentador();
  const t0Seg = ahoraSeg();
  const pinSalida = info.pin_salida ?? "0000";

  // Evita que el propio cierre (PIN correcto, anulación) se cuente a sí mismo
  // como evasión -- mismo guard que `saliendoControladamente` en Android.
  let saliendoControladamente = false;
  let detector = null;

  function ahoraSeg() {
    return Date.now() / 1000;
  }

  function t() {
    return ahoraSeg() - t0Seg;
  }

  // --------------------------------------------------------------- arranque

  vista.hidden = false;
  marco.src = info.url;

  document.documentElement.requestFullscreen?.().catch(() => {
    // El navegador puede rechazar el pedido si no vino de una interacción
    // directa del usuario reciente -- no es un error fatal, la supervisión
    // sigue igual; solo no habrá pantalla completa forzada.
  });

  configurarGatilloSalida();
  configurarDetectorEvasion();
  configurarSalidaDeNavegador();

  crearDetector({ onFrame: onFrameDetectado })
    .then(async (d) => {
      detector = d;
      await detector.iniciar();
    })
    .catch((error) => {
      // La supervisión es obligatoria para rendir el examen (mismo criterio
      // que Android): sin cámara no hay examen sin supervisión posible.
      const sinPermiso = error?.name === "NotAllowedError" || error?.name === "NotFoundError";
      window.alert(
        sinPermiso
          ? "La supervisión necesita la cámara para rendir el examen. " +
              "Revisa el permiso de cámara del navegador e intenta de nuevo."
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
        case Accion.ALERTA:
          break; // sin efecto visible; el registro ya quedó en el motor
        case Accion.AVISO_ESTUDIANTE:
          mostrarAviso();
          break;
        case Accion.BLOQUEAR_EXAMEN:
          overlayBloqueo.hidden = false;
          break;
        case Accion.REACTIVAR_EXAMEN:
          overlayBloqueo.hidden = true;
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
      if (!document.fullscreenElement && !saliendoControladamente) {
        reportarEvasion("salida de pantalla completa");
      }
    });
  }

  function reportarEvasion(_motivo) {
    if (saliendoControladamente) return;
    const acciones = motor.evasionKiosco(t());
    if (acciones.length) aplicarAcciones(acciones);
  }

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
    guardarYEncolar({
      examenId,
      nie,
      motor,
      gestor,
      inicioEpochSeg: t0Seg,
      tFin: t(),
    })
      .catch((error) => console.error("No se pudo guardar la sesión:", error))
      .finally(() => window.location.reload());
  }
}
