import { test } from "node:test";
import assert from "node:assert/strict";
import { MotorAlertas, Situacion, Etiqueta, Accion, EstadoExamen } from "../src/motor/motorAlertas.js";

/**
 * Port de la parte de comportamiento (situación 8) de
 * apps/detector/tests/test_evasion_kiosco.py. En el cliente web, evasión NO
 * es un caso degradado -- es la única defensa real (ver README): salir de
 * pantalla completa, cambiar de pestaña o perder el foco de la ventana se
 * reporta al motor exactamente igual.
 */

test("la evasion suma al mismo contador de 10", () => {
  const m = new MotorAlertas();
  assert.equal(m.contador, 0);
  m.evasionKiosco(12.0);
  assert.equal(m.contador, 1);
  assert.equal(m.alertas.at(-1).situacion, Situacion.EVASION_KIOSCO);
});

test("la evasion es conductual no tecnica", () => {
  const m = new MotorAlertas();
  m.evasionKiosco(5.0);
  assert.equal(m.alertas.at(-1).etiqueta, Etiqueta.CONDUCTUAL);
});

test("varias evasiones cuentan por separado", () => {
  const m = new MotorAlertas();
  for (const t of [5.0, 20.0, 40.0]) m.evasionKiosco(t);
  assert.equal(m.contador, 3);
});

test("la evasion puede disparar el aviso y la anulacion", () => {
  const m = new MotorAlertas({ maxAlertas: 3, alertaDeAviso: 2 });
  assert.deepEqual(m.evasionKiosco(1.0), [Accion.ALERTA]);
  assert.ok(m.evasionKiosco(2.0).includes(Accion.AVISO_ESTUDIANTE));
  assert.ok(m.evasionKiosco(3.0).includes(Accion.ANULAR_EXAMEN));
  assert.equal(m.estado, EstadoExamen.ANULADO);
});
