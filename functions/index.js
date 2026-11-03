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
import { calificarConClaude } from "./claudeClient.js";

initializeApp();

// Se configura una sola vez: `firebase functions:secrets:set ANTHROPIC_API_KEY`
// (pide la clave interactivamente, no queda en ningún archivo del repo).
const CLAVE_ANTHROPIC = defineSecret("ANTHROPIC_API_KEY");

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
