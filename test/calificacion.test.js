import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizar,
  calificarSeleccion,
  esSeleccion,
  requiereIA,
  requiereRevisionManual,
  interpretarRespuestaIA,
} from "../functions/calificacion.js";

test("normaliza acentos, mayusculas y espacios de mas", () => {
  assert.equal(normalizar("  José   Pérez "), "jose perez");
  assert.equal(normalizar(null), "");
});

test("seleccion simple: exacta e insensible a acentos/mayusculas", () => {
  assert.equal(calificarSeleccion("seleccion_simple", "San Salvador", "san salvador", 10), 10);
  assert.equal(calificarSeleccion("seleccion_simple", "Sansalvador", "san salvador", 10), 0);
});

test("seleccion multiple: todo o nada, sin importar el orden", () => {
  const correctas = ["rojo", "azul"];
  assert.equal(calificarSeleccion("seleccion_multiple", ["azul", "rojo"], correctas, 10), 10);
  assert.equal(calificarSeleccion("seleccion_multiple", ["rojo"], correctas, 10), 0); // falta una
  assert.equal(calificarSeleccion("seleccion_multiple", ["rojo", "azul", "verde"], correctas, 10), 0); // sobra una
  assert.equal(calificarSeleccion("seleccion_multiple", [], correctas, 10), 0);
});

test("calificar seleccion rechaza tipos que no son de seleccion", () => {
  assert.throws(() => calificarSeleccion("interpretacion", "x", "y", 10));
});

test("clasificacion de tipos", () => {
  assert.equal(esSeleccion("seleccion_simple"), true);
  assert.equal(esSeleccion("pizarra"), false);
  assert.equal(requiereIA("interpretacion"), true);
  assert.equal(requiereIA("respuesta_completa"), true);
  assert.equal(requiereIA("seleccion_simple"), false);
  assert.equal(requiereRevisionManual("pizarra"), true);
  assert.equal(requiereRevisionManual("interpretacion"), false);
});

test("interpreta el JSON de Claude cuando viene bien formado", () => {
  const texto = 'Aquí va mi análisis.\n{"puntos": 7, "justificacion": "Cubre la idea principal."}';
  assert.deepEqual(interpretarRespuestaIA(texto, 10), { puntos: 7, justificacion: "Cubre la idea principal." });
});

test("recorta el puntaje al maximo de la pregunta", () => {
  const texto = '{"puntos": 99, "justificacion": "ok"}';
  assert.equal(interpretarRespuestaIA(texto, 10).puntos, 10);
});

test("sin JSON valido, devuelve null en vez de inventar un puntaje", () => {
  assert.equal(interpretarRespuestaIA("no hay json acá", 10), null);
  assert.equal(interpretarRespuestaIA('{"puntos": "no es numero"}', 10), null);
  assert.equal(interpretarRespuestaIA('{"puntos": -3}', 10), null);
});
