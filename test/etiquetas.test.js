import { test } from "node:test";
import assert from "node:assert/strict";
import { describirEvento, estadoVisible, haceCuanto, leerCorreos } from "../docente/etiquetas.js";

const latido = (ms) => ({ toMillis: () => ms });

test("una alerta se describe con su situación", () => {
  assert.deepEqual(describirEvento({ tipo: "alerta", detalle: "segunda_persona" }), {
    titulo: "Otra persona frente a la cámara",
    detalle: "",
    clase: "grave",
  });
  assert.equal(describirEvento({ tipo: "alerta", detalle: "nueva_cosa" }).titulo, "nueva_cosa");
  assert.equal(describirEvento({ tipo: "desconocido", detalle: "x" }).clase, "neutro");
});

test("estado visible", () => {
  const ahora = 10_000_000;
  assert.equal(estadoVisible({ estado: "activo", ultimoLatido: latido(ahora - 1000) }, ahora).grupo, "en_curso");
  assert.equal(estadoVisible({ estado: "bloqueado_evasion", ultimoLatido: latido(ahora) }, ahora).grupo, "necesita_clave");
  // sin latido por más de 3 min: sin conexión, salvo que ya haya terminado
  assert.equal(estadoVisible({ estado: "activo", ultimoLatido: latido(ahora - 200_000) }, ahora).grupo, "sin_conexion");
  assert.equal(estadoVisible({ estado: "terminado", ultimoLatido: latido(0) }, ahora).grupo, "terminado");
  assert.equal(estadoVisible({ estado: "anulado", ultimoLatido: latido(0) }, ahora).grupo, "anulado");
  // escritura pendiente (serverTimestamp aún sin valor): no se marca caída
  assert.equal(estadoVisible({ estado: "activo", ultimoLatido: null }, ahora).grupo, "en_curso");
});

test("hace cuánto", () => {
  assert.equal(haceCuanto(0, 40_000), "hace 40 s");
  assert.equal(haceCuanto(0, 5 * 60_000), "hace 5 min");
  assert.equal(haceCuanto(0, 2 * 3_600_000), "hace 2 h");
  assert.equal(haceCuanto(1000, 0), "hace 0 s");
});

test("leer correos", () => {
  assert.deepEqual(leerCorreos("Ana.Perez@edu.gob.sv\nana.perez@edu.gob.sv, luis@edu.gob.sv  malo"), {
    validos: ["ana.perez@edu.gob.sv", "luis@edu.gob.sv"],
    invalidos: ["malo"],
  });
  assert.deepEqual(leerCorreos("  "), { validos: [], invalidos: [] });
});
