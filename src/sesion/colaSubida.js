import { guardarSesion, marcarSubida, listarPendientes } from "./almacenSesiones.js";
import { conFechas } from "../motor/gestorAlertas.js";

/**
 * Port de `cerrar_sesion.py` (Windows) / `CierreSesion.kt` +
 * `SubirSesionWorker.kt` (Android) para el navegador: arma el mismo payload
 * de `POST /sesion` contra el mismo backend, sin `POST /evidencia` porque no
 * se capturan imágenes (misma decisión de los stakeholders, 29/07/2026).
 *
 * Sin `WorkManager` ni un demonio de sistema operativo, el reintento en el
 * navegador se apoya en dos mecanismos: la Background Sync API (si el
 * navegador la soporta -- Chrome/ChromeOS sí, que es justamente el target de
 * este cliente) y, como red de seguridad, el evento `online` de la ventana.
 * Ninguno de los dos es tan confiable como un Worker de Android que sigue
 * vivo aunque se cierre la app -- si el estudiante cierra la pestaña del
 * todo antes de que la sesión suba, hay que confiar en que la vuelva a abrir
 * (o en el barrido de Background Sync, si el navegador lo soporta incluso
 * con la pestaña cerrada).
 */

const CLAVE_CONFIG = "evaluacion-mined:config";

// Mismo mapa que ETIQUETAS en cerrar_sesion.py / ETIQUETAS_DETECCION en
// SubirSesionWorker.kt -- etiqueta por tipo de detección CRUDA.
const ETIQUETAS_DETECCION = {
  candidato_ausente: "conductual",
  persona_adicional: "conductual",
  dispositivo_adicional: "conductual",
  distraccion_facial: "conductual",
  rostro_no_visible: "tecnica_no_confirmada",
  encuadre_incorrecto: "tecnica_no_confirmada",
};

function leerConfig() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_CONFIG) || "{}");
  } catch {
    return {};
  }
}

function construirTimeline({ examenId, nie, motor, gestor, inicioEpochSeg, tFin }) {
  const timeline = gestor.cerrar(tFin);
  const timelineConFechas = conFechas(timeline, inicioEpochSeg);
  const resumen = motor.resumen();
  const veredicto = {
    estado: resumen.estado,
    contador: resumen.contador,
    alertas: resumen.alertas,
    fallas_tecnicas_registradas: resumen.fallasTecnicasRegistradas,
    apelacion: motor.resolverApelacion(),
    detecciones_crudas: timeline.length,
    aviso_al_estudiante: resumen.contador >= motor.alertaDeAviso,
    bloqueos: motor.bloqueosEmitidos,
    origen: "motor_en_vivo",
  };
  return {
    examen_id: examenId,
    nie_estudiante: nie,
    sesion_inicio: new Date(inicioEpochSeg * 1000).toISOString(),
    sesion_fin: new Date((inicioEpochSeg + tFin) * 1000).toISOString(),
    zona_horaria_datos: "UTC",
    alertas: timelineConFechas,
    total: timeline.length,
    veredicto_motor: veredicto,
  };
}

/** Port de `construir_payload` (cerrar_sesion.py). */
function construirPayload(sesionId, timeline) {
  const alertas = [];
  for (const a of timeline.alertas) {
    alertas.push({
      tipo: a.tipo,
      severidad: a.severidad,
      etiqueta: ETIQUETAS_DETECCION[a.tipo] ?? "conductual",
      cuenta: false,
      origen: "deteccion",
      ts_inicio: a.ts_inicio,
      ts_fin: a.ts_fin ?? null,
      t_inicio: a.t_inicio,
      t_fin: a.t_fin ?? null,
      duracion_seg: a.duracion_seg ?? null,
      evidencia_uri: null, // no se capturan imágenes
    });
  }

  const veredicto = timeline.veredicto_motor;
  const inicio = new Date(timeline.sesion_inicio);
  for (const a of veredicto?.alertas ?? []) {
    alertas.push({
      tipo: a.situacion,
      severidad: a.grave ? "grave" : "normal",
      etiqueta: a.etiqueta,
      cuenta: true,
      origen: "motor",
      ts_inicio: new Date(inicio.getTime() + a.t * 1000).toISOString(),
      ts_fin: null,
      t_inicio: a.t,
      t_fin: null,
      duracion_seg: null,
      evidencia_uri: null,
    });
  }

  const payload = {
    sesion_id: sesionId,
    examen_id: timeline.examen_id,
    inicio: timeline.sesion_inicio,
    fin: timeline.sesion_fin,
    nie_estudiante: timeline.nie_estudiante,
    identidad_verificada: null, // verificación de identidad: solo backend, no en el cliente
    identidad_similitud: null,
    cliente: "evaluacion-mined-web v1.0.0",
    estado: veredicto?.estado ?? "activo",
    alertas,
  };
  if (veredicto) {
    payload.reporte = {
      veredicto: veredicto.estado,
      apelacion: veredicto.apelacion,
      narrativa: narrativaDe(veredicto),
      generado_por: "motor_alertas",
    };
  }
  return payload;
}

/** Port de `narrativa_de` (cerrar_sesion.py). */
function narrativaDe(veredicto) {
  const partes = [
    `${veredicto.contador} alertas que cuentan de ${veredicto.detecciones_crudas} detecciones crudas.`,
    `Estado: ${veredicto.estado}.`,
  ];
  if (veredicto.aviso_al_estudiante) partes.push("Se avisó al estudiante en la alerta 7 de 10.");
  if (veredicto.bloqueos > 0) {
    partes.push(`El examen se bloqueó ${veredicto.bloqueos} vez/veces por ausencia.`);
  }
  if (veredicto.estado === "anulado") partes.push(`Apelación automática: ${veredicto.apelacion}.`);
  return partes.join(" ");
}

async function subir(sesionId, timeline) {
  const { api_url: apiUrl, api_key: apiKey } = leerConfig();
  if (!apiUrl) throw new Error("sin api_url configurada");
  const payload = construirPayload(sesionId, timeline);
  const respuesta = await fetch(`${apiUrl.replace(/\/$/, "")}/sesion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey ?? "" },
    body: JSON.stringify(payload),
  });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
}

export async function guardarYEncolar({ examenId, nie, motor, gestor, inicioEpochSeg, tFin }) {
  const sesionId = `ses_${examenId}_${crypto.randomUUID()}`;
  const timeline = construirTimeline({ examenId, nie, motor, gestor, inicioEpochSeg, tFin });
  await guardarSesion({ sesionId, timeline, subida: false });

  try {
    await subir(sesionId, timeline);
    await marcarSubida(sesionId);
  } catch {
    // Sin conexión o sin api_url configurada: la sesión queda completa en
    // IndexedDB, lista para reintentar -- no se pierde nada.
    registrarReintentoBackgroundSync();
  }
}

function registrarReintentoBackgroundSync() {
  navigator.serviceWorker?.ready
    .then((registro) => registro.sync?.register("subir-sesiones-pendientes"))
    .catch(() => {
      // Background Sync no soportado por este navegador: el listener de
      // window "online" (más abajo) es el respaldo mientras la pestaña siga
      // abierta.
    });
}

/** Reintenta todas las sesiones pendientes. Lo llama el service worker en el
 * evento "sync" (public/sw.js) y también el listener de "online" de acá. */
export async function reintentarPendientes() {
  const pendientes = await listarPendientes();
  for (const { sesionId, timeline } of pendientes) {
    try {
      await subir(sesionId, timeline);
      await marcarSubida(sesionId);
    } catch {
      // sigue pendiente, se reintenta en la próxima pasada
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    reintentarPendientes().catch(() => {});
  });
}
