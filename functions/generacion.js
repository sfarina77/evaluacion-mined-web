/**
 * Lógica pura para generar preguntas con IA a partir de un contenido (tema,
 * párrafo, texto de lectura) que el docente pega en autoria/autoria.js.
 * Separada de index.html.js para poder probarla sin desplegar nada
 * (test/generacion.test.js), mismo criterio que calificacion.js.
 *
 * Importante: esto SUGIERE preguntas, no las guarda. El docente las revisa,
 * edita si hace falta, y recién ahí decide cuáles agregar al examen --
 * mismo principio de "la IA propone, la persona confirma" que ya se usa
 * para calificar interpretación/respuesta completa (ver docs del proyecto,
 * decisión 2026-11-03).
 */

export const TIPOS_VALIDOS = new Set([
  "seleccion_simple",
  "seleccion_multiple",
  "interpretacion",
  "respuesta_completa",
  "pizarra",
]);

export function construirPrompt(contenido, cantidad) {
  return (
    `Eres un asistente que ayuda a un docente de educación básica a preparar preguntas de examen ` +
    `a partir de un contenido. NO calificas ni decides nada por tu cuenta: el docente revisa, edita ` +
    `y decide cuáles preguntas usar antes de que lleguen a un estudiante.\n\n` +
    `Contenido sobre el que debes basar las preguntas:\n"""\n${contenido}\n"""\n\n` +
    `Genera ${cantidad} preguntas variadas (mezcla selección simple, selección múltiple e ` +
    `interpretación/respuesta completa cuando tenga sentido para el contenido). Responde SOLO con un ` +
    `arreglo JSON, sin texto antes ni después, donde cada elemento tiene esta forma:\n` +
    `- Para "seleccion_simple" o "seleccion_multiple": {"tipo", "enunciado", "opciones": [...], ` +
    `"respuestaCorrecta": "texto" (o ["texto", ...] si es múltiple), "puntos": número}\n` +
    `- Para "interpretacion" o "respuesta_completa": {"tipo", "enunciado", "rubrica", "puntos": número, ` +
    `"sugerenciaMedio": "una frase corta describiendo qué imagen o video de apoyo ayudaría, o null si ninguno hace falta"}\n\n` +
    `No generes preguntas de tipo "pizarra" -- esas las agrega el docente a mano cuando quiere que el ` +
    `estudiante dibuje o escriba a mano, no tiene sentido que las sugiera un contenido de texto.`
  );
}

/**
 * Interpreta el arreglo JSON que debería devolver Claude. Descarta (no
 * lanza) cualquier elemento mal formado en vez de tumbar toda la tanda por
 * una pregunta rara -- mejor devolver 3 de 4 preguntas buenas que ninguna.
 */
export function interpretarPreguntasIA(textoCrudo) {
  const coincidencia = String(textoCrudo ?? "").match(/\[[\s\S]*\]/);
  if (!coincidencia) return [];
  let datos;
  try {
    datos = JSON.parse(coincidencia[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];
  return datos.map(normalizarPregunta).filter(Boolean);
}

function normalizarPregunta(bruto) {
  if (!bruto || typeof bruto !== "object") return null;
  const tipo = bruto.tipo;
  if (!TIPOS_VALIDOS.has(tipo) || tipo === "pizarra") return null;
  const enunciado = typeof bruto.enunciado === "string" ? bruto.enunciado.trim() : "";
  if (!enunciado) return null;
  const puntos = Number(bruto.puntos);
  const base = { tipo, enunciado, puntos: Number.isFinite(puntos) && puntos > 0 ? Math.min(puntos, 100) : 10 };

  if (tipo === "seleccion_simple" || tipo === "seleccion_multiple") {
    const opciones = Array.isArray(bruto.opciones) ? bruto.opciones.filter((o) => typeof o === "string" && o.trim()) : [];
    if (opciones.length < 2) return null;
    const respuestaCorrecta =
      tipo === "seleccion_multiple"
        ? (Array.isArray(bruto.respuestaCorrecta) ? bruto.respuestaCorrecta : [bruto.respuestaCorrecta]).filter(Boolean)
        : typeof bruto.respuestaCorrecta === "string"
          ? bruto.respuestaCorrecta
          : null;
    if (!respuestaCorrecta || (Array.isArray(respuestaCorrecta) && respuestaCorrecta.length === 0)) return null;
    return { ...base, opciones, respuestaCorrecta };
  }

  // interpretacion / respuesta_completa
  const rubrica = typeof bruto.rubrica === "string" ? bruto.rubrica.trim() : "";
  if (!rubrica) return null;
  const sugerenciaMedio = typeof bruto.sugerenciaMedio === "string" ? bruto.sugerenciaMedio.trim() : null;
  return { ...base, rubrica, sugerenciaMedio: sugerenciaMedio || null };
}
