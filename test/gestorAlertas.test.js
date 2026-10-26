import { test } from "node:test";
import assert from "node:assert/strict";
import { GestorAlertas } from "../src/motor/gestorAlertas.js";

/** Port 1:1 de apps/detector/tests/test_gestor_alertas.py. */

const DEBOUNCE_SEG = 1.5;

test("condicion breve no alerta", () => {
  const g = new GestorAlertas();
  g.actualizar(new Set(["distraccion_facial"]), 0.0);
  g.actualizar(new Set(["distraccion_facial"]), DEBOUNCE_SEG - 0.1);
  g.actualizar(new Set(), DEBOUNCE_SEG + 5.0); // se fue antes de sostenerse
  assert.deepEqual(g.cerrar(10.0), []);
});

test("condicion sostenida genera un segmento", () => {
  const g = new GestorAlertas();
  for (let decima = 0; decima < 30; decima++) {
    g.actualizar(new Set(["dispositivo_adicional"]), decima / 10);
  }
  g.actualizar(new Set(), 5.0);
  const timeline = g.cerrar(6.0);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].tipo, "dispositivo_adicional");
  assert.equal(timeline[0].t_inicio, 0.0);
});

test("parpadeo corto no corta el episodio", () => {
  const g = new GestorAlertas();
  g.actualizar(new Set(["distraccion_facial"]), 0.0);
  g.actualizar(new Set(["distraccion_facial"]), 1.0);
  g.actualizar(new Set(["distraccion_facial"]), 2.0);
  g.actualizar(new Set(), 2.3); // micro-corte de 0.5s (< tolerancia 0.7)
  g.actualizar(new Set(["distraccion_facial"]), 2.5);
  g.actualizar(new Set(["distraccion_facial"]), 4.0);
  g.actualizar(new Set(), 5.5); // corte real (> tolerancia)
  const timeline = g.cerrar(6.0);
  assert.equal(timeline.length, 1); // UN episodio continuo, no dos
  assert.equal(timeline[0].t_inicio, 0.0);
  assert.equal(timeline[0].t_fin, 4.0); // cierra en el último avistamiento real
});

test("parpadeo no reinicia el debounce", () => {
  const g = new GestorAlertas();
  g.actualizar(new Set(["distraccion_facial"]), 0.0);
  g.actualizar(new Set(), 0.5); // parpadeo antes de cumplir el debounce
  g.actualizar(new Set(["distraccion_facial"]), 0.9);
  g.actualizar(new Set(["distraccion_facial"]), 1.6); // 1.6s desde el inicio ORIGINAL
  const timeline = g.cerrar(3.0);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].t_inicio, 0.0);
});
