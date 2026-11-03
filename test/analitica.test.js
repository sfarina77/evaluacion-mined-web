import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filtrarEventos,
  soloConFoto,
  contarPorSituacion,
  resumirSesiones,
  resumirPorExamen,
} from "../docente/analitica.js";

const EVENTOS = [
  { tipo: "alerta", detalle: "segunda_persona", examenId: "EXAM1", nie: "001", tsMs: 1000, foto: "data:image/jpeg;base64,a" },
  { tipo: "alerta", detalle: "segunda_persona", examenId: "EXAM1", nie: "002", tsMs: 2000, foto: null },
  { tipo: "alerta", detalle: "objeto_no_permitido", examenId: "EXAM1", nie: "001", tsMs: 3000, foto: "data:image/jpeg;base64,b" },
  { tipo: "advertencia", detalle: "cambio de pestaña", examenId: "EXAM1", nie: "001", tsMs: 1500, foto: "data:image/jpeg;base64,c" },
  { tipo: "alerta", detalle: "mirada_fuera", examenId: "EXAM2", nie: "003", tsMs: 5000, foto: null },
];

test("filtra por examen, situacion, nie y rango de fecha", () => {
  assert.equal(filtrarEventos(EVENTOS, { examenId: "EXAM2" }).length, 1);
  assert.equal(filtrarEventos(EVENTOS, { situacion: "segunda_persona" }).length, 2);
  assert.equal(filtrarEventos(EVENTOS, { nie: "001" }).length, 3);
  assert.equal(filtrarEventos(EVENTOS, { desdeMs: 2000, hastaMs: 3000 }).length, 2);
  // sin ts todavía (llegó por el listener en vivo, el servidor no confirmó el timestamp): se conserva
  assert.equal(filtrarEventos([{ tipo: "alerta", tsMs: null }], { desdeMs: 1 }).length, 1);
});

test("solo con foto descarta los eventos sin evidencia", () => {
  assert.equal(soloConFoto(EVENTOS).length, 3);
});

test("cuenta por situacion, solo alertas, ordenado de mas a menos frecuente", () => {
  assert.deepEqual(contarPorSituacion(EVENTOS), [
    { situacion: "segunda_persona", titulo: "Otra persona frente a la cámara", cantidad: 2 },
    { situacion: "objeto_no_permitido", titulo: "Celular o libro a la vista", cantidad: 1 },
    { situacion: "mirada_fuera", titulo: "Miró fuera de la pantalla varias veces seguidas", cantidad: 1 },
  ]);
});

test("resumir sesiones cuenta estados y tasa de anulacion", () => {
  const sesiones = [
    { estado: "anulado" },
    { estado: "terminado" },
    { estado: "activo", fin: null },
    { estado: "activo", fin: {} }, // sin campo estado final claro, pero ya tiene fin: cuenta como "otro"
  ];
  const resumen = resumirSesiones(sesiones);
  assert.equal(resumen.total, 4);
  assert.equal(resumen.anulado, 1);
  assert.equal(resumen.terminado, 1);
  assert.equal(resumen.en_curso, 1);
  assert.equal(resumen.otro, 1);
  assert.equal(resumen.tasaAnulacion, 0.25);
});

test("resumir sesiones sin ninguna no revienta (tasa 0)", () => {
  assert.equal(resumirSesiones([]).tasaAnulacion, 0);
});

test("resumir por examen agrupa y ordena por mas sesiones primero", () => {
  const sesiones = [
    { examenId: "EXAM1", estado: "anulado" },
    { examenId: "EXAM1", estado: "terminado" },
    { examenId: "EXAM2", estado: "terminado" },
  ];
  const resumen = resumirPorExamen(sesiones);
  assert.equal(resumen.length, 2);
  assert.equal(resumen[0].examenId, "EXAM1");
  assert.equal(resumen[0].total, 2);
  assert.equal(resumen[1].examenId, "EXAM2");
});
