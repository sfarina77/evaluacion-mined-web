import { test } from "node:test";
import assert from "node:assert/strict";
import { esCamaraVirtual, pantallaExtendida } from "../src/examen/entorno.js";

test("reconoce las camaras virtuales comunes", () => {
  for (const etiqueta of [
    "OBS Virtual Camera",
    "ManyCam Virtual Webcam",
    "XSplit VCam",
    "Snap Camera",
    "e2eSoft VCam",
    "NVIDIA Broadcast",
  ]) {
    assert.ok(esCamaraVirtual(etiqueta), etiqueta);
  }
});

test("acepta camaras reales y el celular como camara", () => {
  for (const etiqueta of [
    "Integrated Camera (04f2:b6dd)",
    "HD Webcam C270",
    "FaceTime HD Camera",
    "DroidCam Source 3",
    "Iriun Webcam",
    "fake_device_0",
    "",
  ]) {
    assert.ok(!esCamaraVirtual(etiqueta), etiqueta);
  }
  assert.ok(!esCamaraVirtual(undefined));
});

test("pantalla extendida solo si el navegador lo afirma", () => {
  assert.equal(pantallaExtendida({ isExtended: true }), true);
  assert.equal(pantallaExtendida({ isExtended: false }), false);
  assert.equal(pantallaExtendida({}), false); // Firefox/Safari: no se sabe
  assert.equal(pantallaExtendida(undefined), false);
});
