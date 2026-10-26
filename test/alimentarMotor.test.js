import { test } from "node:test";
import assert from "node:assert/strict";
import { MotorAlertas, Situacion, Accion } from "../src/motor/motorAlertas.js";
import { alimentar, crearEstadoAlimentador } from "../src/motor/alimentarMotor.js";

/** Cubre la tabla de correspondencia detección->situación de alimentarMotor.js. */

test("candidato ausente dispara la ruta de encuadre del motor", () => {
  const motor = new MotorAlertas();
  const estado = crearEstadoAlimentador();
  for (let i = 0; i <= 11; i++) alimentar(motor, new Set(["candidato_ausente"]), i, estado);
  assert.equal(motor.contador, 1); // fuera_de_encuadre a los 10s
  assert.equal(motor.alertas[0].situacion, Situacion.FUERA_DE_ENCUADRE);
});

test("persona adicional dispara segunda persona inmediata", () => {
  const motor = new MotorAlertas();
  const estado = crearEstadoAlimentador();
  const acciones = alimentar(motor, new Set(["persona_adicional"]), 5.0, estado);
  assert.ok(acciones.includes(Accion.ALERTA));
  assert.equal(motor.alertas[0].situacion, Situacion.SEGUNDA_PERSONA);
});

test("objeto no permitido no duplica hasta que se retira", () => {
  const motor = new MotorAlertas();
  const estado = crearEstadoAlimentador();
  alimentar(motor, new Set(["dispositivo_adicional"]), 1.0, estado);
  alimentar(motor, new Set(["dispositivo_adicional"]), 2.0, estado);
  alimentar(motor, new Set(), 3.0, estado); // se retira
  alimentar(motor, new Set(["dispositivo_adicional"]), 4.0, estado); // nuevo episodio
  assert.equal(motor.contador, 2);
});

test("distraccion facial y rostro no visible cuentan como la misma mirada", () => {
  const motor = new MotorAlertas();
  const estado = crearEstadoAlimentador();
  alimentar(motor, new Set(["distraccion_facial"]), 1.0, estado); // abre episodio de mirada
  alimentar(motor, new Set(["rostro_no_visible"]), 2.0, estado); // mismo episodio, no duplica
  assert.equal(motor.contador, 0); // aún no llega a las 5 veces seguidas
});
