import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarPreguntasIA, construirPrompt } from "../functions/generacion.js";

test("construye el prompt incluyendo el contenido y la cantidad pedida", () => {
  const prompt = construirPrompt("La fotosíntesis es...", 3);
  assert.match(prompt, /La fotosíntesis es\.\.\./);
  assert.match(prompt, /Genera 3 preguntas/);
});

test("interpreta un arreglo de preguntas bien formado", () => {
  const texto = JSON.stringify([
    { tipo: "seleccion_simple", enunciado: "¿Capital de El Salvador?", opciones: ["San Salvador", "Santa Ana"], respuestaCorrecta: "San Salvador", puntos: 10 },
    { tipo: "interpretacion", enunciado: "Explica la fotosíntesis", rubrica: "Debe mencionar luz solar", puntos: 15, sugerenciaMedio: "Un diagrama de una planta" },
  ]);
  const preguntas = interpretarPreguntasIA(texto);
  assert.equal(preguntas.length, 2);
  assert.equal(preguntas[0].tipo, "seleccion_simple");
  assert.deepEqual(preguntas[0].opciones, ["San Salvador", "Santa Ana"]);
  assert.equal(preguntas[1].sugerenciaMedio, "Un diagrama de una planta");
});

test("descarta preguntas individuales mal formadas sin tumbar las demas", () => {
  const texto = JSON.stringify([
    { tipo: "seleccion_simple", enunciado: "Buena", opciones: ["A", "B"], respuestaCorrecta: "A" },
    { tipo: "seleccion_simple", enunciado: "Sin opciones suficientes", opciones: ["A"], respuestaCorrecta: "A" },
    { tipo: "interpretacion", enunciado: "Sin rubrica" },
    { tipo: "pizarra", enunciado: "No deberia generar esto" },
    "no es un objeto",
  ]);
  const preguntas = interpretarPreguntasIA(texto);
  assert.equal(preguntas.length, 1);
  assert.equal(preguntas[0].enunciado, "Buena");
});

test("puntos por defecto 10 si viene invalido, recortado a 100 si se pasa", () => {
  const texto = JSON.stringify([
    { tipo: "seleccion_simple", enunciado: "A", opciones: ["x", "y"], respuestaCorrecta: "x", puntos: "no es numero" },
    { tipo: "seleccion_simple", enunciado: "B", opciones: ["x", "y"], respuestaCorrecta: "x", puntos: 500 },
  ]);
  const preguntas = interpretarPreguntasIA(texto);
  assert.equal(preguntas[0].puntos, 10);
  assert.equal(preguntas[1].puntos, 100);
});

test("seleccion multiple acepta un arreglo de respuestas correctas", () => {
  const texto = JSON.stringify([
    { tipo: "seleccion_multiple", enunciado: "Colores primarios", opciones: ["rojo", "verde", "azul"], respuestaCorrecta: ["rojo", "azul"], puntos: 10 },
  ]);
  const preguntas = interpretarPreguntasIA(texto);
  assert.deepEqual(preguntas[0].respuestaCorrecta, ["rojo", "azul"]);
});

test("sin JSON valido devuelve lista vacia, nunca lanza", () => {
  assert.deepEqual(interpretarPreguntasIA("texto sin json"), []);
  assert.deepEqual(interpretarPreguntasIA(null), []);
  assert.deepEqual(interpretarPreguntasIA("[esto no es json valido"), []);
});
