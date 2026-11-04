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

  // Ampliado (2026-11-04, "mucha más variedad") -- mismo criterio: formas
  // simples y planas, nada de detalle fino que no se note a este tamaño.

  // La jirafa de la mascota (ver docente/panel.css .mascota), adaptada a una
  // celda de ícono repetible -- pedido explícito de que se vea más y sea LA
  // imagen de la plataforma, así que también aparece como objeto para contar.
  jirafa: (color) =>
    `<path d="M9 23c-.5-6 0-10 2-14h2v14z" fill="${color}"/>` +
    `<path d="M15 23c.5-6 0-10-2-14h2v14z" fill="${color}"/>` +
    `<ellipse cx="12" cy="5.5" rx="5" ry="4.2" fill="${color}"/>` +
    `<ellipse cx="7.5" cy="4.5" rx="1.4" ry="1.9" fill="${color}" transform="rotate(-25 7.5 4.5)"/>` +
    `<ellipse cx="16.5" cy="4.5" rx="1.4" ry="1.9" fill="${color}" transform="rotate(25 16.5 4.5)"/>` +
    `<line x1="9.5" y1="2.2" x2="9.5" y2="4" stroke="${color}" stroke-width="1.3"/>` +
    `<line x1="14.5" y1="2.2" x2="14.5" y2="4" stroke="${color}" stroke-width="1.3"/>` +
    `<circle cx="9.5" cy="1.5" r="1" fill="#ff8a5c"/>` +
    `<circle cx="14.5" cy="1.5" r="1" fill="#ff8a5c"/>` +
    `<ellipse cx="12" cy="8" rx="2.2" ry="1.3" fill="#ffffff" opacity="0.9"/>` +
    `<circle cx="10.3" cy="5.3" r="0.7" fill="#1f2a44"/>` +
    `<circle cx="13.7" cy="5.3" r="0.7" fill="#1f2a44"/>` +
    `<circle cx="10" cy="12.5" r="1" fill="#ff8a5c" opacity="0.85"/>` +
    `<circle cx="14" cy="16.5" r="0.9" fill="#ff8a5c" opacity="0.85"/>` +
    `<circle cx="10.5" cy="20" r="0.8" fill="#ff8a5c" opacity="0.85"/>`,
  perro: (color) =>
    `<ellipse cx="12" cy="13" rx="7" ry="6" fill="${color}"/>` +
    `<ellipse cx="5.5" cy="9" rx="2.2" ry="3.5" fill="${color}" transform="rotate(-20 5.5 9)"/>` +
    `<ellipse cx="18.5" cy="9" rx="2.2" ry="3.5" fill="${color}" transform="rotate(20 18.5 9)"/>` +
    `<ellipse cx="12" cy="15" rx="3" ry="2.2" fill="#ffffff" opacity="0.9"/>` +
    `<circle cx="9" cy="11" r="1" fill="#1f2a44"/>` +
    `<circle cx="15" cy="11" r="1" fill="#1f2a44"/>` +
    `<circle cx="12" cy="14.5" r="1" fill="#1f2a44"/>`,
  gato: (color) =>
    `<ellipse cx="12" cy="13" rx="6.5" ry="6" fill="${color}"/>` +
    `<path d="M6 9 4 3 9 7Z" fill="${color}"/>` +
    `<path d="M18 9 20 3 15 7Z" fill="${color}"/>` +
    `<circle cx="9.5" cy="12" r="1" fill="#1f2a44"/>` +
    `<circle cx="14.5" cy="12" r="1" fill="#1f2a44"/>` +
    `<path d="M11 15q1 1 2 0" stroke="#1f2a44" stroke-width="0.8" fill="none"/>` +
    `<line x1="4" y1="13.5" x2="9" y2="14" stroke="#1f2a44" stroke-width="0.6"/>` +
    `<line x1="20" y1="13.5" x2="15" y2="14" stroke="#1f2a44" stroke-width="0.6"/>`,
  pez: (color) =>
    `<ellipse cx="10" cy="12" rx="7" ry="4.5" fill="${color}"/>` +
    `<path d="M17 12 22 8 22 16Z" fill="${color}"/>` +
    `<circle cx="6" cy="11" r="1" fill="#1f2a44"/>` +
    `<path d="M8 16q2 2 4 0" stroke="${color}" stroke-width="1" fill="none"/>`,
  mariposa: (color) =>
    `<ellipse cx="7" cy="8" rx="4" ry="3" fill="${color}" transform="rotate(-20 7 8)"/>` +
    `<ellipse cx="17" cy="8" rx="4" ry="3" fill="${color}" transform="rotate(20 17 8)"/>` +
    `<ellipse cx="8" cy="15" rx="3" ry="2.5" fill="${color}" opacity="0.85" transform="rotate(-10 8 15)"/>` +
    `<ellipse cx="16" cy="15" rx="3" ry="2.5" fill="${color}" opacity="0.85" transform="rotate(10 16 15)"/>` +
    `<line x1="12" y1="4" x2="12" y2="19" stroke="#1f2a44" stroke-width="1.3"/>` +
    `<line x1="12" y1="4" x2="10" y2="2" stroke="#1f2a44" stroke-width="0.8"/>` +
    `<line x1="12" y1="4" x2="14" y2="2" stroke="#1f2a44" stroke-width="0.8"/>`,
  abeja: (color) =>
    `<ellipse cx="12" cy="13" rx="6" ry="4.5" fill="${color}"/>` +
    `<path d="M7.5 10h9M7.5 13h9M7.5 16h9" stroke="#1f2a44" stroke-width="1.5"/>` +
    `<ellipse cx="7" cy="7" rx="2.8" ry="2" fill="#dbeafe" opacity="0.85" transform="rotate(-20 7 7)"/>` +
    `<ellipse cx="14.5" cy="7" rx="2.8" ry="2" fill="#dbeafe" opacity="0.85" transform="rotate(20 14.5 7)"/>` +
    `<circle cx="18.5" cy="12" r="1" fill="#1f2a44"/>`,
  oveja: (color) =>
    `<circle cx="8" cy="10" r="3" fill="${color}"/><circle cx="12" cy="8" r="3.5" fill="${color}"/>` +
    `<circle cx="16" cy="10" r="3" fill="${color}"/><circle cx="12" cy="12" r="3.5" fill="${color}"/>` +
    `<ellipse cx="12" cy="16" rx="2.5" ry="2" fill="#a16a3c"/>` +
    `<circle cx="10.7" cy="15.5" r="0.6" fill="#1f2a44"/>` +
    `<circle cx="13.3" cy="15.5" r="0.6" fill="#1f2a44"/>` +
    `<ellipse cx="6" cy="17" rx="1.3" ry="2" fill="#a16a3c"/>` +
    `<ellipse cx="18" cy="17" rx="1.3" ry="2" fill="#a16a3c"/>`,
  rana: (color) =>
    `<ellipse cx="12" cy="15" rx="7" ry="5" fill="${color}"/>` +
    `<circle cx="8" cy="8" r="2.5" fill="${color}"/><circle cx="16" cy="8" r="2.5" fill="${color}"/>` +
    `<circle cx="8" cy="8" r="1" fill="#1f2a44"/><circle cx="16" cy="8" r="1" fill="#1f2a44"/>` +
    `<path d="M8 16q4 3 8 0" stroke="#1f2a44" stroke-width="1" fill="none"/>` +
    `<ellipse cx="3" cy="17" rx="2" ry="1.3" fill="${color}"/>` +
    `<ellipse cx="21" cy="17" rx="2" ry="1.3" fill="${color}"/>`,
  naranja: (color) =>
    `<circle cx="12" cy="13" r="7" fill="${color}"/>` +
    `<path d="M12 6V4" stroke="#65350f" stroke-width="1.5"/>` +
    `<path d="M12 4c1-1 2-1 3 0" stroke="#16a34a" stroke-width="1.5" fill="none"/>`,
  platano: (color) =>
    `<path d="M5 18c0-8 4-13 10-14 1 0 1 1 0 1-6 1-9 6-9 13 0 2 1 3 3 3 5 0 9-3 10-7 0-1 1-1 1 0-1 6-6 9-12 9-2 0-3-2-3-5z" fill="${color}"/>`,
  fresa: (color) =>
    `<path d="M12 7c4 0 7 4 6 8-1 4-3 6-6 6s-5-2-6-6c-1-4 2-8 6-8z" fill="${color}"/>` +
    `<path d="M8 7l1-3 3 2 3-2 1 3Z" fill="#16a34a"/>` +
    `<circle cx="10" cy="11" r="0.5" fill="#fef3c7"/><circle cx="14" cy="11" r="0.5" fill="#fef3c7"/>` +
    `<circle cx="9" cy="15" r="0.5" fill="#fef3c7"/><circle cx="15" cy="15" r="0.5" fill="#fef3c7"/>` +
    `<circle cx="12" cy="18" r="0.5" fill="#fef3c7"/>`,
  uva: (color) =>
    `<circle cx="9" cy="10" r="2.3" fill="${color}"/><circle cx="14" cy="10" r="2.3" fill="${color}"/>` +
    `<circle cx="11.5" cy="13.5" r="2.3" fill="${color}"/><circle cx="7" cy="14" r="2.3" fill="${color}"/>` +
    `<circle cx="16" cy="14" r="2.3" fill="${color}"/><circle cx="9.5" cy="17.5" r="2.3" fill="${color}"/>` +
    `<circle cx="14" cy="17.5" r="2.3" fill="${color}"/>` +
    `<path d="M11.5 7c1-2 2-2 2-3" stroke="#16a34a" stroke-width="1.3" fill="none"/>`,
  pelota: (color) =>
    `<circle cx="12" cy="12" r="8" fill="${color}"/>` +
    `<path d="M12 6l3 2-1 4h-4l-1-4z" fill="#1f2a44"/>` +
    `<path d="M17 6l-1.5 2M7 6l1.5 2M17 18l-1.5-2M7 18l1.5-2" stroke="#1f2a44" stroke-width="0.8"/>`,
  flor: (color) =>
    `<circle cx="12" cy="6.5" r="2.2" fill="${color}"/><circle cx="17.5" cy="12" r="2.2" fill="${color}"/>` +
    `<circle cx="12" cy="17.5" r="2.2" fill="${color}"/><circle cx="6.5" cy="12" r="2.2" fill="${color}"/>` +
    `<circle cx="12" cy="12" r="2.3" fill="#fbbf24"/>` +
    `<line x1="12" y1="19" x2="12" y2="23" stroke="#16a34a" stroke-width="1.5"/>`,
  corazon: (color) =>
    `<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z" fill="${color}"/>`,
  sol: (color) =>
    `<circle cx="12" cy="12" r="5.5" fill="${color}"/>` +
    `<g stroke="${color}" stroke-width="2" stroke-linecap="round">` +
    `<line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>` +
    `<line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>` +
    `<line x1="4.5" y1="4.5" x2="6.5" y2="6.5"/><line x1="17.5" y1="17.5" x2="19.5" y2="19.5"/>` +
    `<line x1="4.5" y1="19.5" x2="6.5" y2="17.5"/><line x1="17.5" y1="6.5" x2="19.5" y2="4.5"/></g>`,
};

const COLORES = {
  pato: "#f6c445",
  bolo: "#f4f4f4",
  manzana: "#dc2626",
  estrella: "#f6c445",
  globo: "#3b6df0",
  jirafa: "#8b5cf6",
  perro: "#a16a3c",
  gato: "#f0a94e",
  pez: "#0ea5e9",
  mariposa: "#db2777",
  abeja: "#fbbf24",
  oveja: "#f4f4f4",
  rana: "#4ade80",
  naranja: "#f97316",
  platano: "#facc15",
  fresa: "#ef4444",
  uva: "#7c3aed",
  pelota: "#3b6df0",
  flor: "#ec4899",
  corazon: "#dc2626",
  sol: "#f59e0b",
};

export const OBJETOS_DISPONIBLES = Object.keys(OBJETOS);
export const TITULOS_OBJETO = {
  pato: "Patos",
  bolo: "Bolos",
  manzana: "Manzanas",
  estrella: "Estrellas",
  globo: "Globos",
  jirafa: "Jirafas",
  perro: "Perros",
  gato: "Gatos",
  pez: "Peces",
  mariposa: "Mariposas",
  abeja: "Abejas",
  oveja: "Ovejas",
  rana: "Ranas",
  naranja: "Naranjas",
  platano: "Plátanos",
  fresa: "Fresas",
  uva: "Uvas",
  pelota: "Pelotas",
  flor: "Flores",
  corazon: "Corazones",
  sol: "Soles",
};

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
