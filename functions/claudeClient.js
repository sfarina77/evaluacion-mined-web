/**
 * Llamada directa a la API de Mensajes de Claude (fetch nativo de Node, sin
 * el SDK de @anthropic-ai -- una sola llamada no lo justifica, y así no hay
 * que instalar nada para desplegar la función). La clave NUNCA llega al
 * navegador: esta función corre en el servidor (Cloud Functions), el
 * navegador del estudiante o del docente nunca la ve.
 */

// OJO al desplegar: confirmar este ID de modelo contra la documentación
// vigente de Anthropic (docs.anthropic.com) antes de activar en producción
// -- no se inventó una fecha de snapshot concreta porque no se puede
// verificar desde acá, y un ID equivocado hace que la función falle con 404
// en cada calificación.
const MODELO = "claude-sonnet-5-5";
const URL_API = "https://api.anthropic.com/v1/messages";

/** Una sola llamada a la API de Mensajes, compartida por calificar y generar
 * -- ambas solo difieren en el prompt y en cuántos tokens necesitan de vuelta. */
async function llamarClaude({ apiKey, prompt, maxTokens }) {
  const respuesta = await fetch(URL_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`Claude API ${respuesta.status}: ${detalle.slice(0, 300)}`);
  }

  const datos = await respuesta.json();
  return datos.content?.[0]?.text ?? "";
}

/**
 * Pide a Claude que califique una respuesta de interpretación/respuesta
 * completa contra una rúbrica, y que devuelva el resultado en un bloque JSON
 * (ver calificacion.js::interpretarRespuestaIA). Devuelve el texto crudo de
 * la respuesta -- el llamador decide qué hacer si no viene el JSON esperado.
 */
export async function calificarConClaude({ apiKey, enunciado, rubrica, respuestaEstudiante, puntosMaximos }) {
  const prompt =
    `Eres un asistente que ayuda a un docente de educación básica a calificar la respuesta ` +
    `de un estudiante. NO eres quien decide la nota final: el docente la confirma o la corrige ` +
    `después de leer lo que sugieras.\n\n` +
    `Pregunta: ${enunciado}\n\n` +
    `Rúbrica del docente (qué se espera de una respuesta completa): ${rubrica}\n\n` +
    `Respuesta del estudiante: ${respuestaEstudiante}\n\n` +
    `Puntos máximos de esta pregunta: ${puntosMaximos}\n\n` +
    `Responde SOLO con un bloque JSON, sin texto antes ni después, con esta forma exacta:\n` +
    `{"puntos": <número entre 0 y ${puntosMaximos}>, "justificacion": "<una o dos frases, en español, dirigidas al docente, explicando el puntaje sugerido>"}`;

  return llamarClaude({ apiKey, prompt, maxTokens: 300 });
}

/**
 * Pide a Claude que proponga preguntas de examen a partir de un contenido
 * (ver generacion.js::construirPrompt/interpretarPreguntasIA). Devuelve el
 * texto crudo -- nada de esto se guarda en Firestore automáticamente, el
 * docente decide qué aceptar desde autoria/autoria.js.
 */
export async function generarPreguntasConClaude({ apiKey, prompt }) {
  return llamarClaude({ apiKey, prompt, maxTokens: 2000 });
}
