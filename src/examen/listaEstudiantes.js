/**
 * Lista de estudiantes por número (2026-11-04): para niños pequeños que
 * todavía no saben su NIE/DUI de memoria, el docente carga una listita
 * simple (número -> nombre) y el estudiante solo escribe su número. Un color
 * automático (mismo truco que src/colorMateria.js para las materias: hash
 * del texto sobre una paleta chica) acompaña cada número para que el
 * docente le diga "sos el número 5, el verde" y el niño se dé cuenta solo si
 * se equivocó de número al ver un nombre/color que no es el suyo. Pura, para
 * poder probarla sin navegador (test/listaEstudiantes.test.js).
 */

import { colorDeMateria } from "../colorMateria.js";

const NOMBRES_COLOR = {
  "#3b6df0": "Azul",
  "#8b5cf6": "Morado",
  "#16a34a": "Verde",
  "#d97706": "Naranja",
  "#dc2626": "Rojo",
  "#0891b2": "Celeste",
  "#db2777": "Rosa",
  "#65a30d": "Oliva",
};

/** Mismo color siempre para el mismo número -- se calcula, nunca se guarda,
 * así que cambia solo si algún día se amplía la paleta de colorMateria.js
 * (ambos quedan sincronizados automáticamente). */
export function colorDeNumero(numero) {
  return colorDeMateria(String(numero));
}

export function nombreDeColor(color) {
  return NOMBRES_COLOR[color] ?? "un color";
}

/** Busca un número en la lista del docente. Tolera que venga como texto
 * ("05", con espacios) o como number -- el teclado numérico de un celular/
 * tableta no siempre da un string limpio. null si no hay lista, no hay
 * número, o el número no está en la lista. */
export function buscarEnLista(lista, numero) {
  const buscado = Number(String(numero ?? "").trim());
  if (!Number.isFinite(buscado)) return null;
  return (Array.isArray(lista) ? lista : []).find((entrada) => Number(entrada.numero) === buscado) ?? null;
}

/**
 * El docente pega/escribe la lista como texto plano, una línea por
 * estudiante: "1 - Juan Pérez", "2, Ana López" o solo "3 Pedro Ruiz" -- lo
 * que le resulte más natural escribir. Una línea que no calza con "número
 * primero" se descarta en silencio (mejor una lista incompleta que una
 * interpretada mal); nunca lanza.
 */
export function interpretarListaTexto(texto) {
  const lineas = String(texto ?? "").split("\n");
  const resultado = [];
  for (const linea of lineas) {
    const coincidencia = linea.trim().match(/^(\d+)\s*[-,.]?\s*(.+)$/);
    if (!coincidencia) continue;
    const numero = Number(coincidencia[1]);
    const nombre = coincidencia[2].trim();
    if (!Number.isFinite(numero) || numero <= 0 || !nombre) continue;
    resultado.push({ numero, nombre });
  }
  return resultado;
}

/** La vuelta de interpretarListaTexto, para mostrar en el textarea al abrir
 * un examen que ya tiene lista guardada. */
export function listaATexto(lista) {
  return (Array.isArray(lista) ? lista : []).map((entrada) => `${entrada.numero} - ${entrada.nombre}`).join("\n");
}
