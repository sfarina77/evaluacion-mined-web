/**
 * Lógica pura de calificación: sin Firebase, sin red, para poder probarla sin
 * desplegar nada (test/calificacion.test.js). La usa index.js (el trigger de
 * Firestore), que sí habla con la base de datos y con la API de Claude.
 *
 * Por qué esto vive en la función y NO en el cliente del estudiante: el
 * estudiante nunca debe poder calcular ni mandar su propia nota -- con las
 * herramientas de desarrollador del navegador podría escribirse el puntaje
 * máximo directo en Firestore. El cliente solo manda la respuesta cruda
 * (ver nube/firestore.rules, sesiones/{id}/respuestas); esta función, con
 * acceso de administrador a la clave real (examenes/{codigo}/claves), es la
 * única que pone la nota.
 */

/** minúsculas, sin espacios de más, sin acentos -- para no reprobar a alguien
 * por escribir "José" en vez de "jose" en una selección de texto libre. */
export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Selección simple: compara una sola alternativa. Selección múltiple: compara
 * el CONJUNTO de alternativas elegidas contra el de la clave -- ni de más ni
 * de menos, sin crédito parcial (ver advertencia abajo).
 */
export function calificarSeleccion(tipo, respuesta, respuestaCorrecta, puntos) {
  if (tipo === "seleccion_simple") {
    return normalizar(respuesta) === normalizar(respuestaCorrecta) ? puntos : 0;
  }
  if (tipo === "seleccion_multiple") {
    const elegidas = new Set((Array.isArray(respuesta) ? respuesta : []).map(normalizar));
    const correctas = new Set((Array.isArray(respuestaCorrecta) ? respuestaCorrecta : []).map(normalizar));
    const mismoTamano = elegidas.size === correctas.size;
    const todasCorrectas = [...elegidas].every((valor) => correctas.has(valor));
    // Fase 1: todo o nada. Crédito parcial por selección múltiple queda
    // pendiente de que el stakeholder defina la fórmula (p. ej. aciertos
    // menos errores) -- inventar una ahora sería arbitrario.
    return mismoTamano && todasCorrectas ? puntos : 0;
  }
  throw new Error(`calificarSeleccion no aplica al tipo "${tipo}"`);
}

export const TIPOS_SELECCION = new Set(["seleccion_simple", "seleccion_multiple"]);
export const TIPOS_IA = new Set(["interpretacion", "respuesta_completa"]);
export const TIPOS_MANUAL = new Set(["pizarra"]);

export function esSeleccion(tipo) {
  return TIPOS_SELECCION.has(tipo);
}

export function requiereIA(tipo) {
  return TIPOS_IA.has(tipo);
}

export function requiereRevisionManual(tipo) {
  return TIPOS_MANUAL.has(tipo);
}

/**
 * Interpreta la respuesta de Claude (ver claudeClient.js) para la
 * calificación por IA. Se pide un bloque JSON explícito en el prompt porque
 * parsear texto libre de un LLM para sacarle un número es frágil -- si no
 * viene el JSON esperado, es mejor fallar alto y mandarlo a revisión manual
 * que inventar un puntaje.
 */
export function interpretarRespuestaIA(textoCrudo, puntosMaximos) {
  const coincidencia = String(textoCrudo ?? "").match(/\{[\s\S]*\}/);
  if (!coincidencia) return null;
  let datos;
  try {
    datos = JSON.parse(coincidencia[0]);
  } catch {
    return null;
  }
  const puntos = Number(datos.puntos);
  if (!Number.isFinite(puntos) || puntos < 0) return null;
  return {
    puntos: Math.min(puntos, puntosMaximos),
    justificacion: typeof datos.justificacion === "string" ? datos.justificacion.slice(0, 1000) : "",
  };
}
