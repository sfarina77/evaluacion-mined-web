/**
 * Ilustraciones para preguntas "problema_ilustrado" (2026-11-03, estilo
 * Kumon: "¿cuántos patos quedan si 3 vuelan?"). Dibujadas a mano en SVG por
 * mí (Claude), NO generadas por un modelo de imágenes -- este proyecto no
 * tiene ninguna API de generación de imágenes conectada. Un ícono simple y
 * plano por tipo de objeto, repetido `cantidadInicial` veces, con los
 * últimos `cantidadQuitar` "apagados" (opacidad baja + una X) para
 * representar lo que se fue/se quitó -- mismo lenguaje visual para
 * cualquier objeto, en vez de una animación distinta por cada uno.
 */

const OBJETOS = {
  pato: (color) =>
    `<path d="M6 16c0-5 4-9 9-9 3 0 5 1 6 3 2 0 4 1 4 3s-2 3-4 3c-1 2-3 3-6 3-5 0-9-3-9-3z" fill="${color}"/>` +
    `<circle cx="12" cy="8" r="1.4" fill="#1f2a44"/>` +
    `<path d="M4 8c2-1 4 0 4 2" stroke="${color}" stroke-width="2" fill="none"/>`,
  bolo: (color) =>
    `<path d="M12 2c2 2 2 4 1 6-1 1-1 2 0 3 2 2 3 5 3 8 0 2-2 3-4 3s-4-1-4-3c0-3 1-6 3-8 1-1 1-2 0-3-1-2-1-4 1-6z" ` +
    `fill="${color}" stroke="#cbd8f3" stroke-width="1"/>`,
  manzana: (color) =>
    `<path d="M12 7c3-2 6 0 6 4 0 5-3 9-6 9s-6-4-6-9c0-4 3-6 6-4z" fill="${color}"/>` +
    `<path d="M12 7V4" stroke="#65350f" stroke-width="1.5"/>` +
    `<path d="M12 5c1-1 2-1 3 0" stroke="#16a34a" stroke-width="1.5" fill="none"/>`,
  estrella: (color) => `<path d="M12 2l2.6 6.6 7 .4-5.4 4.5 1.9 6.9L12 16.9 5.9 20.4l1.9-6.9-5.4-4.5 7-.4z" fill="${color}"/>`,
  globo: (color) =>
    `<ellipse cx="12" cy="9" rx="6" ry="7" fill="${color}"/>` +
    `<path d="M12 16l-1.4 1.6 1.4 1.2 1.4-1.2z" fill="${color}"/>` +
    `<path d="M12 19v4" stroke="#5b6b8c" stroke-width="1"/>`,
};

const COLORES = { pato: "#f6c445", bolo: "#f4f4f4", manzana: "#dc2626", estrella: "#f6c445", globo: "#3b6df0" };

export const OBJETOS_DISPONIBLES = Object.keys(OBJETOS);
export const TITULOS_OBJETO = { pato: "Patos", bolo: "Bolos", manzana: "Manzanas", estrella: "Estrellas", globo: "Globos" };

/** Cuántos quedan -- nunca negativo, nunca más de los que había. Es lo que
 * autoria.js sugiere como respuesta correcta (el docente puede corregirlo si
 * el problema no es una simple resta). */
export function calcularRestantes(cantidadInicial, cantidadQuitar) {
  const inicial = Math.max(0, Math.trunc(Number(cantidadInicial) || 0));
  const quitar = Math.max(0, Math.trunc(Number(cantidadQuitar) || 0));
  return Math.max(0, inicial - quitar);
}

/** Construye el SVG (elemento DOM) con `cantidadInicial` íconos del objeto
 * dado, en una cuadrícula, con los últimos `cantidadQuitar` marcados como
 * quitados. `cantidadInicial` se topa en 30 -- es una ilustración para
 * contar a simple vista, no un censo. */
export function crearIlustracionSvg({ objeto, cantidadInicial, cantidadQuitar }) {
  const dibujar = OBJETOS[objeto] ?? OBJETOS.estrella;
  const color = COLORES[objeto] ?? "#3b6df0";
  const total = Math.max(0, Math.min(30, Math.trunc(Number(cantidadInicial) || 0)));
  const quitar = Math.max(0, Math.trunc(Number(cantidadQuitar) || 0));

  const TAM = 48;
  const columnas = Math.min(6, Math.max(1, total || 1));
  const filas = Math.max(1, Math.ceil(total / columnas));

  let iconos = "";
  for (let i = 0; i < total; i++) {
    const col = i % columnas;
    const fila = Math.floor(i / columnas);
    const quitado = i >= total - quitar;
    const x = col * TAM + TAM / 2 - 12;
    const y = fila * TAM + TAM / 2 - 12;
    iconos += `<g transform="translate(${x},${y})" opacity="${quitado ? 0.25 : 1}">${dibujar(color)}</g>`;
    if (quitado) {
      iconos +=
        `<line x1="${x}" y1="${y}" x2="${x + 24}" y2="${y + 24}" stroke="#dc2626" stroke-width="2.5"/>` +
        `<line x1="${x + 24}" y1="${y}" x2="${x}" y2="${y + 24}" stroke="#dc2626" stroke-width="2.5"/>`;
    }
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${columnas * TAM} ${filas * TAM}`);
  svg.setAttribute("width", String(columnas * TAM));
  svg.setAttribute("height", String(filas * TAM));
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    quitar > 0
      ? `${total} ${TITULOS_OBJETO[objeto] ?? objeto}, ${quitar} tachados`
      : `${total} ${TITULOS_OBJETO[objeto] ?? objeto}`,
  );
  svg.innerHTML = iconos;
  return svg;
}
