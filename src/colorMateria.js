/**
 * Color determinístico para una materia (2026-11-03): un examen
 * "multi-materia" necesita una pista visual rápida de a qué materia
 * pertenece cada pregunta, sin pedirle al docente que elija un color a mano
 * por cada nombre de materia que escriba. El mismo texto siempre da el mismo
 * color, tomado de una paleta chica ya acorde al resto del tema claro.
 * Pura, para poder probarla sin navegador (test/colorMateria.test.js) y
 * para que autoria.js y el reproductor del estudiante (reproductor.js)
 * pinten exactamente el mismo color para la misma materia.
 */
const PALETA = [
  "#3b6df0", // azul
  "#8b5cf6", // violeta
  "#16a34a", // verde
  "#d97706", // ámbar
  "#dc2626", // rojo
  "#0891b2", // celeste
  "#db2777", // rosa
  "#65a30d", // oliva
];

/** null si no hay materia -- no tiene sentido pintar un color para "sin materia". */
export function colorDeMateria(materia) {
  const texto = String(materia ?? "").trim();
  if (!texto) return null;
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    hash = (hash * 31 + texto.charCodeAt(i)) | 0;
  }
  return PALETA[Math.abs(hash) % PALETA.length];
}
