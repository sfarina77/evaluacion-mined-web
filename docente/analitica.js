/**
 * Funciones puras de la consola de administración (docente/admin.js):
 * filtrar eventos, contar por tipo, y resumir sesiones por examen. Separadas
 * de admin.js (que solo hace DOM/Firestore) para poder probarlas sin
 * navegador, mismo criterio que etiquetas.js (ver test/analitica.test.js).
 */

import { SITUACIONES, describirEvento } from "./etiquetas.js";

/** Un evento "de alerta" sin su situación reconocida todavía cuenta -- se
 * muestra con su propio detalle en vez de perderse como "undefined". */
function tituloSituacion(tipo, detalle) {
  if (tipo !== "alerta") return null;
  return SITUACIONES[detalle] ?? detalle;
}

/**
 * Filtra una lista plana de eventos (de varias sesiones, ya traídos por una
 * collectionGroup query) por examen, tipo de situación, NIE y rango de fecha.
 * `desdeMs`/`hastaMs` comparan contra `evento.ts` (epoch ms); si el evento no
 * tiene `ts` todavía (llegó por un listener en vivo antes de que el servidor
 * confirme el timestamp), se conserva -- no tiene sentido descartarlo por un
 * dato que está por llegar.
 */
export function filtrarEventos(eventos, { examenId, situacion, nie, desdeMs, hastaMs } = {}) {
  return eventos.filter((evento) => {
    if (examenId && evento.examenId !== examenId) return false;
    if (nie && evento.nie !== nie) return false;
    if (situacion && evento.detalle !== situacion) return false;
    if ((desdeMs || hastaMs) && evento.tsMs != null) {
      if (desdeMs && evento.tsMs < desdeMs) return false;
      if (hastaMs && evento.tsMs > hastaMs) return false;
    }
    return true;
  });
}

/** Solo los eventos que traen foto -- la galería de evidencia no muestra nada más. */
export function soloConFoto(eventos) {
  return eventos.filter((evento) => typeof evento.foto === "string" && evento.foto.length > 0);
}

/**
 * Cuenta cuántas veces aparece cada situación entre los eventos de tipo
 * "alerta" (no advertencias ni avisos de sistema: lo que de verdad pesó en el
 * contador de anulación). Devuelve la lista ordenada de más a menos frecuente
 * -- responde directamente "¿cómo intentan copiarse más seguido?".
 */
export function contarPorSituacion(eventos) {
  const conteo = new Map();
  for (const evento of eventos) {
    if (evento.tipo !== "alerta") continue;
    const clave = evento.detalle ?? "desconocida";
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .map(([situacion, cantidad]) => ({ situacion, titulo: SITUACIONES[situacion] ?? situacion, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

/**
 * Resume una lista de sesiones (de uno o varios exámenes): cuántas en cada
 * estado, y la tasa de anulación. `sesiones` son los documentos ya leídos de
 * la colección `sesiones` (no sus eventos).
 */
export function resumirSesiones(sesiones) {
  const totales = { total: sesiones.length, anulado: 0, terminado: 0, en_curso: 0, otro: 0 };
  for (const sesion of sesiones) {
    if (sesion.estado === "anulado") totales.anulado += 1;
    else if (sesion.estado === "terminado") totales.terminado += 1;
    else if (sesion.fin == null) totales.en_curso += 1;
    else totales.otro += 1;
  }
  totales.tasaAnulacion = totales.total > 0 ? totales.anulado / totales.total : 0;
  return totales;
}

/**
 * Para cada examen presente en `sesiones`, cuántas sesiones y cuántas
 * anuladas -- la vista "por examen" de la consola, para comparar entre
 * grupos/materias sin tener que abrirlos uno por uno.
 */
export function resumirPorExamen(sesiones) {
  const porExamen = new Map();
  for (const sesion of sesiones) {
    const clave = sesion.examenId ?? "desconocido";
    if (!porExamen.has(clave)) porExamen.set(clave, []);
    porExamen.get(clave).push(sesion);
  }
  return [...porExamen.entries()]
    .map(([examenId, lista]) => ({ examenId, ...resumirSesiones(lista) }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Bitácora completa (2026-11-03): combina en una sola lista cronológica las
 * acciones de docentes (colección `bitacora`, ver functions/bitacora.js),
 * los eventos de sesión del estudiante (ya traídos para la galería/resumen
 * de arriba) y los errores técnicos de las Cloud Functions (colección
 * `bitacora_errores`) -- la consola de administración los pinta juntos, más
 * fácil de auditar que tres listas sueltas.
 */
const TITULOS_ACCION_DOCENTE = {
  examen: "examen",
  pregunta: "pregunta",
  contenido: "contenido",
  calificacion: "calificación",
};

function normalizarAccionDocente(entrada) {
  const tipoLegible = TITULOS_ACCION_DOCENTE[entrada.tipo] ?? entrada.tipo ?? "";
  return {
    tsMs: entrada.ts?.toMillis?.() ?? null,
    tipo: "docente",
    origen: entrada.actor ?? "—",
    examenId: entrada.examenId ?? null,
    detalle: `${entrada.accion ?? ""} ${tipoLegible}: ${entrada.detalle ?? ""}`.trim(),
  };
}

function normalizarEventoSesion(evento) {
  const { titulo, detalle } = describirEvento(evento);
  return {
    tsMs: evento.tsMs ?? null,
    tipo: "sesion",
    origen: evento.nie ? `NIE ${evento.nie}` : "—",
    examenId: evento.examenId ?? null,
    detalle: detalle ? `${titulo} — ${detalle}` : titulo,
  };
}

function normalizarErrorSistema(entrada) {
  return {
    tsMs: entrada.ts?.toMillis?.() ?? null,
    tipo: "sistema",
    origen: entrada.funcion ?? "—",
    examenId: entrada.examenId ?? entrada.contexto?.examenId ?? null,
    detalle: entrada.mensaje ?? "",
  };
}

/** `filtroTipo` es "docente"/"sesion"/"sistema" o vacío/undefined para todo. */
export function combinarBitacora({ accionesDocentes = [], eventosSesion = [], erroresSistema = [], filtroTipo } = {}) {
  const filas = [
    ...accionesDocentes.map(normalizarAccionDocente),
    ...eventosSesion.map(normalizarEventoSesion),
    ...erroresSistema.map(normalizarErrorSistema),
  ];
  const filtradas = filtroTipo ? filas.filter((fila) => fila.tipo === filtroTipo) : filas;
  return filtradas.sort((a, b) => (b.tsMs ?? 0) - (a.tsMs ?? 0));
}

export { tituloSituacion };
