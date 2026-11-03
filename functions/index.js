/**
 * Cloud Function: califica cada respuesta apenas el estudiante la manda.
 *
 * Se dispara con onDocumentCreated en sesiones/{sesionId}/respuestas/{itemId}
 * -- no es una función "callable" que el cliente invoque a propósito: el
 * estudiante solo escribe su respuesta cruda (ver nube/firestore.rules) y
 * esto reacciona solo, con permisos de administrador (Admin SDK no pasa por
 * las reglas de seguridad), que es la única forma de leer la clave real en
 * examenes/{codigo}/claves/{itemId} sin exponérsela al navegador del
 * estudiante.
 *
 * Selección simple/múltiple: se califica sola, sin IA (calificacion.js).
 * Interpretación/respuesta completa: Claude sugiere un puntaje +
 * justificación; NO es la nota final -- el docente la confirma o la corrige
 * desde el panel (ver docente/panel.js), por indicación directa del
 * stakeholder (2026-11-03): la evidencia de que los LLM califican peor en
 * respuestas abiertas/subjetivas que en las cerradas pesó en esa decisión.
 * Pizarra: no se intenta calificar con IA (sin OCR de letra manuscrita
 * confiable para niños, ver docs del proyecto) -- queda directo para
 * revisión manual del docente.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  esSeleccion,
  requiereIA,
  requiereRevisionManual,
  calificarSeleccion,
  interpretarRespuestaIA,
} from "./calificacion.js";
import { construirPrompt, interpretarPreguntasIA } from "./generacion.js";
import { calificarConClaude, generarPreguntasConClaude } from "./claudeClient.js";

initializeApp();

// Se configura una sola vez: `firebase functions:secrets:set ANTHROPIC_API_KEY`
// (pide la clave interactivamente, no queda en ningún archivo del repo).
const CLAVE_ANTHROPIC = defineSecret("ANTHROPIC_API_KEY");

/** Mismo criterio que docenteDe()/esDocente() de nube/firestore.rules, pero
 * reimplementado acá: una Cloud Function "callable" no pasa por las reglas
 * de Firestore, así que el permiso hay que verificarlo a mano con el token
 * de autenticación que ya trae la llamada. */
async function esDocenteOAdmin(auth) {
  if (!auth?.token?.email || !auth.token.email_verified) return false;
  const correo = auth.token.email.toLowerCase();
  if (correo.endsWith("@edu.gob.sv")) return true;
  const admin = await getFirestore().doc(`admins/${correo}`).get();
  return admin.exists;
}

export const calificarRespuesta = onDocumentCreated(
  { document: "sesiones/{sesionId}/respuestas/{itemId}", secrets: [CLAVE_ANTHROPIC] },
  async (evento) => {
    const db = getFirestore();
    const { itemId } = evento.params;
    const respuesta = evento.data.data();
    const examenId = respuesta.examenId;

    const refItem = db.doc(`examenes/${examenId}/items/${itemId}`);
    const item = (await refItem.get()).data();
    if (!item) {
      console.error(`[calificarRespuesta] no existe examenes/${examenId}/items/${itemId}`);
      return;
    }

    try {
      if (esSeleccion(item.tipo)) {
        const refClave = db.doc(`examenes/${examenId}/claves/${itemId}`);
        const clave = (await refClave.get()).data();
        const puntos = calificarSeleccion(item.tipo, respuesta.respuesta, clave?.respuestaCorrecta, item.puntos);
        await evento.data.ref.update({ calificacionAuto: puntos, calificacionFinal: puntos, estado: "calificada" });
        return;
      }

      if (requiereRevisionManual(item.tipo)) {
        // Pizarra: sin calificación automática ni de IA -- directo a que el
        // docente la vea y ponga la nota él mismo (ver regla de `update` en
        // firestore.rules, que exige estado == "calificada" al confirmar).
        await evento.data.ref.update({ estado: "pendiente_revision" });
        return;
      }

      if (requiereIA(item.tipo)) {
        const refClave = db.doc(`examenes/${examenId}/claves/${itemId}`);
        const clave = (await refClave.get()).data();
        const textoCrudo = await calificarConClaude({
          apiKey: CLAVE_ANTHROPIC.value(),
          enunciado: item.enunciado,
          rubrica: clave?.rubrica ?? "",
          respuestaEstudiante: String(respuesta.respuesta ?? ""),
          puntosMaximos: item.puntos,
        });
        const sugerencia = interpretarRespuestaIA(textoCrudo, item.puntos);
        if (sugerencia) {
          await evento.data.ref.update({ calificacionIA: sugerencia, estado: "pendiente_revision" });
        } else {
          // Claude no devolvió el JSON esperado: mejor mandarlo a revisión
          // manual sin sugerencia que arriesgar un puntaje mal parseado.
          console.warn(`[calificarRespuesta] respuesta de Claude sin JSON válido: ${textoCrudo.slice(0, 200)}`);
          await evento.data.ref.update({ estado: "pendiente_revision" });
        }
        return;
      }

      console.error(`[calificarRespuesta] tipo de item desconocido: ${item.tipo}`);
    } catch (error) {
      console.error("[calificarRespuesta] fallo calificando:", error);
      // No se re-lanza: dejar la respuesta sin calificar (pendiente_revision)
      // es preferible a que Cloud Functions reintente sin límite sobre un
      // error que probablemente se repita (p. ej. la API de Claude caída).
      await evento.data.ref.update({ estado: "pendiente_revision" }).catch(() => {});
    }
  },
);

// Mismo tope que nube/firestore.rules exige para contenidos/{id}.texto -- un
// contenido guardado de la biblioteca (ver autoria/autoria.js) tiene que
// entrar completo; sigue siendo un tope de costo/abuso, no una limitación
// técnica de Claude.
const MAX_CONTENIDO = 20000;
const MAX_PREGUNTAS = 8;

/**
 * Función "callable": el docente la invoca desde autoria/autoria.js mientras
 * arma el examen, pegando un contenido (tema, párrafo, texto de lectura).
 * Devuelve preguntas SUGERIDAS -- no escribe nada en Firestore. El docente
 * revisa cada una y decide cuáles agregar al examen (mismo botón "Guardar"
 * que ya usa para una pregunta escrita a mano), igual que la calificación
 * por IA nunca es la nota final sin que alguien la confirme.
 */
export const generarPreguntas = onCall({ secrets: [CLAVE_ANTHROPIC] }, async (request) => {
  if (!(await esDocenteOAdmin(request.auth))) {
    throw new HttpsError("permission-denied", "Esta función es solo para docentes/administradores.");
  }

  const contenido = String(request.data?.contenido ?? "").trim();
  if (!contenido) throw new HttpsError("invalid-argument", "Falta el contenido para generar preguntas.");
  if (contenido.length > MAX_CONTENIDO) {
    throw new HttpsError("invalid-argument", `El contenido es muy largo (máximo ${MAX_CONTENIDO} caracteres).`);
  }
  const cantidad = Math.min(Math.max(Number(request.data?.cantidad) || 4, 1), MAX_PREGUNTAS);

  try {
    const textoCrudo = await generarPreguntasConClaude({
      apiKey: CLAVE_ANTHROPIC.value(),
      prompt: construirPrompt(contenido, cantidad),
    });
    const preguntas = interpretarPreguntasIA(textoCrudo);
    if (!preguntas.length) {
      throw new HttpsError("internal", "La IA no devolvió preguntas utilizables. Intenta con un contenido más claro o corto.");
    }
    return { preguntas };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("[generarPreguntas] fallo llamando a Claude:", error);
    throw new HttpsError("internal", "No se pudo generar preguntas en este momento.");
  }
});
