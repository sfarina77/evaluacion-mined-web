import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MotorAlertas,
  Situacion,
  Etiqueta,
  Accion,
  EstadoExamen,
  Apelacion,
} from "../src/motor/motorAlertas.js";

/**
 * Port 1:1 de apps/detector/tests/test_motor_alertas.py (mismo espejo que
 * MotorAlertasTest.kt en cliente-android). Correr con: npm test
 */

function motor(overrides = {}) {
  return new MotorAlertas({ umbralAusenciaSeg: 60.0, pausaMaximaSeg: 300.0, ...overrides });
}

// --- Situación 1: salir del encuadre tolera 10s ---

test("fuera de encuadre tolera 10 segundos", () => {
  const m = motor();
  assert.deepEqual(m.sinCandidato(0.0), []);
  assert.deepEqual(m.sinCandidato(9.9), []);
  assert.equal(m.contador, 0);
});

test("fuera de encuadre alerta pasados 10 segundos", () => {
  const m = motor();
  m.sinCandidato(0.0);
  const acciones = m.sinCandidato(10.1);
  assert.ok(acciones.includes(Accion.ALERTA));
  assert.equal(m.contador, 1);
  assert.equal(m.alertas[0].situacion, Situacion.FUERA_DE_ENCUADRE);
});

test("evento continuo cuenta una sola vez", () => {
  const m = motor();
  for (let t = 0; t < 40; t++) m.sinCandidato(t);
  assert.equal(m.contador, 1); // 40s fuera: sigue siendo UNA alerta
});

test("regresar y volver a salir es otro episodio", () => {
  const m = motor();
  m.sinCandidato(0.0);
  m.sinCandidato(11.0);
  m.candidatoPresente(12.0);
  m.sinCandidato(20.0);
  m.sinCandidato(31.0);
  assert.equal(m.contador, 2);
});

// --- Situación 2: segunda persona -> inmediata ---

test("segunda persona alerta inmediata", () => {
  const m = motor();
  const acciones = m.rostrosDetectados(2, 5.0);
  assert.ok(acciones.includes(Accion.ALERTA));
  assert.equal(m.contador, 1);
});

test("segunda persona continua no duplica", () => {
  const m = motor();
  for (let t = 5; t < 30; t++) m.rostrosDetectados(2, t);
  assert.equal(m.contador, 1);
  m.rostrosDetectados(1, 31.0); // se fue
  m.rostrosDetectados(2, 40.0); // volvió: nuevo episodio
  assert.equal(m.contador, 2);
});

// --- Situación 3: mirada fuera, 5 veces seguidas ---

test("mirada fuera solo a las 5 seguidas", () => {
  const m = motor();
  for (let i = 0; i < 4; i++) assert.deepEqual(m.miradaFuera(i), []);
  assert.ok(m.miradaFuera(5.0).includes(Accion.ALERTA));
  assert.equal(m.contador, 1);
});

test("mirada normal rompe la racha", () => {
  const m = motor();
  for (let i = 0; i < 4; i++) m.miradaFuera(i);
  m.miradaNormal();
  assert.deepEqual(m.miradaFuera(10.0), []); // la racha arrancó de nuevo
  assert.equal(m.contador, 0);
});

// --- Situación 4: objeto no permitido ---

test("objeto no permitido una alerta por episodio", () => {
  const m = motor();
  assert.ok(m.objetoNoPermitido("celular", 1.0).includes(Accion.ALERTA));
  assert.deepEqual(m.objetoNoPermitido("celular", 2.0), []);
  assert.ok(m.objetoNoPermitido("smartwatch", 3.0).includes(Accion.ALERTA));
  m.objetoRetirado("celular");
  assert.ok(m.objetoNoPermitido("celular", 9.0).includes(Accion.ALERTA));
  assert.equal(m.contador, 3);
});

// --- Situación 5: ausencia prolongada -> bloqueo y reactivación automática ---

test("ausencia prolongada bloquea el examen", () => {
  const m = motor();
  m.sinCandidato(0.0);
  const acciones = m.sinCandidato(61.0);
  assert.ok(acciones.includes(Accion.BLOQUEAR_EXAMEN));
  assert.equal(m.estado, EstadoExamen.BLOQUEADO);
  assert.equal(m.contador, 2); // fuera_de_encuadre (a los 10s) + ausencia_prolongada
});

test("reactivacion automatica al volver", () => {
  const m = motor();
  m.sinCandidato(0.0);
  m.sinCandidato(61.0);
  const acciones = m.candidatoPresente(70.0);
  assert.ok(acciones.includes(Accion.REACTIVAR_EXAMEN));
  assert.equal(m.estado, EstadoExamen.ACTIVO);
});

test("pausa maxima anula directamente", () => {
  const m = motor();
  m.sinCandidato(0.0);
  m.sinCandidato(61.0); // bloqueado en t=61
  const acciones = m.sinCandidato(362.0); // 301s bloqueado > 300 de pausa máxima
  assert.ok(acciones.includes(Accion.ANULAR_EXAMEN));
  assert.equal(m.estado, EstadoExamen.ANULADO);
});

// --- Situaciones 6 y 7: corte abrupto vs falla técnica confirmada ---

test("corte abrupto cuenta y es grave", () => {
  const m = motor();
  m.corteAbrupto(100.0);
  assert.equal(m.contador, 1);
  assert.equal(m.alertas[0].grave, true);
});

test("falla tecnica confirmada no suma", () => {
  const m = motor();
  const acciones = m.fallaTecnicaConfirmada("navegador perdió acceso a cámara", 50.0);
  assert.deepEqual(acciones, [Accion.REGISTRO_SIN_ALERTA]);
  assert.equal(m.contador, 0);
  assert.equal(m.registros.length, 1);
});

// --- Situación 8: evasión del kiosco ---

test("evasion kiosco es alerta grave", () => {
  const m = motor();
  m.evasionKiosco(10.0);
  assert.equal(m.contador, 1);
  assert.equal(m.alertas[0].grave, true);
  assert.equal(m.alertas[0].etiqueta, Etiqueta.CONDUCTUAL);
});

// --- Reglas generales: aviso en la 7, anulación en la 10 ---

test("aviso en la alerta 7", () => {
  const m = motor();
  for (let i = 0; i < 6; i++) m.corteAbrupto(i);
  const acciones = m.corteAbrupto(6.0);
  assert.ok(acciones.includes(Accion.AVISO_ESTUDIANTE));
  assert.equal(m.estado, EstadoExamen.ACTIVO); // el aviso no detiene el examen
});

test("anulacion en la alerta 10", () => {
  const m = motor();
  for (let i = 0; i < 9; i++) m.corteAbrupto(i);
  assert.equal(m.estado, EstadoExamen.ACTIVO);
  const acciones = m.corteAbrupto(9.0);
  assert.ok(acciones.includes(Accion.ANULAR_EXAMEN));
  assert.equal(m.estado, EstadoExamen.ANULADO);
});

test("anulado no suma mas alertas", () => {
  const m = motor();
  for (let i = 0; i < 10; i++) m.corteAbrupto(i);
  assert.deepEqual(m.corteAbrupto(99.0), []);
  assert.equal(m.contador, 10);
});

// --- Apelación: más de 60% técnicas -> nuevo intento; 60%+ conductuales -> rechazo ---

function conAlertas(tecnicas, conductuales) {
  const m = new MotorAlertas();
  for (let i = 0; i < tecnicas; i++) m.corteAbrupto(i, Etiqueta.TECNICA_NO_CONFIRMADA);
  for (let i = 0; i < conductuales; i++) m.evasionKiosco(100.0 + i);
  return m;
}

test("apelacion mas de 60 por ciento tecnicas nuevo intento", () => {
  assert.equal(conAlertas(7, 3).resolverApelacion(), Apelacion.NUEVO_INTENTO);
});

test("apelacion 60 por ciento conductuales rechazo", () => {
  assert.equal(conAlertas(4, 6).resolverApelacion(), Apelacion.RECHAZO);
});

test("apelacion zona gris revision manual", () => {
  // 6 técnicas / 4 conductuales: técnicas no pasan de 60% y conductuales no llegan -> ninguna mayoría
  assert.equal(conAlertas(6, 4).resolverApelacion(), Apelacion.REVISION_MANUAL);
});

test("apelacion 5 y 5 revision manual", () => {
  assert.equal(conAlertas(5, 5).resolverApelacion(), Apelacion.REVISION_MANUAL);
});

// --- Resumen para reporte ---

test("resumen serializable", () => {
  const m = motor();
  m.corteAbrupto(1.0);
  const r = m.resumen();
  assert.equal(r.contador, 1);
  assert.equal(r.alertas[0].situacion, "corte_abrupto");
  assert.equal(r.estado, "activo");
});
