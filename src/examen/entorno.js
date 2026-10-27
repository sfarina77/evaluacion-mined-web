/**
 * Chequeos del equipo del estudiante que no son de la cámara en sí: segundo
 * monitor y cámaras virtuales. Funciones puras o casi, para poder testearlas
 * sin navegador (test/entorno.test.js).
 */

// Software que publica un video cualquiera (grabado, una escena, otra
// ventana) como si fuera una webcam. NO incluye las apps que usan el celular
// como cámara (DroidCam, Iriun, Camo, EpocCam): esas muestran video real y
// son la única cámara de muchos estudiantes.
const CAMARA_VIRTUAL =
  /\b(obs|manycam|xsplit|snap camera|mmhmm|splitcam|youcam|vcam|e2esoft|nvidia broadcast|chromacam|webcamoid|camtwist|virtual)\b/i;

/** true si la etiqueta del dispositivo de video es de una cámara virtual. */
export function esCamaraVirtual(etiqueta) {
  return CAMARA_VIRTUAL.test(etiqueta ?? "");
}

/** true si el equipo tiene la pantalla extendida a otro monitor (no espejo).
 * `screen.isExtended` existe en Chrome/Edge/ChromeOS desde la versión 100;
 * en otros navegadores no se puede saber y se da por false. */
export function pantallaExtendida(pantalla = globalThis.screen) {
  return pantalla?.isExtended === true;
}
