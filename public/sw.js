import { reintentarPendientes } from "../src/sesion/colaSubida.js";

/**
 * Service worker: dos trabajos, sin relación entre sí.
 *
 * 1. Cachear el shell de la app para que abra sin red la segunda vez
 *    (offline-first básico -- los modelos ONNX NO se listan acá
 *    a propósito, son pesados y conviene que se cacheen por separado, ver
 *    README).
 * 2. Reintentar sesiones pendientes cuando el navegador dispara Background
 *    Sync -- esto es lo que se acerca más a lo que WorkManager hace en
 *    Android para `SubirSesionWorker`, pero con una diferencia real: solo
 *    funciona en navegadores que implementan la Background Sync API
 *    (Chrome/ChromeOS sí; no es un estándar universal).
 */

const CACHE = "evaluacion-mined-shell-v2";
const ARCHIVOS_SHELL = [
  "./",
  "./examen-prueba.html",
  "../index.html",
  "../src/estilos.css",
  "../src/main.js",
  "../src/login/loginVista.js",
  "../src/login/examenConfig.js",
  "../src/examen/examenControlador.js",
  "../src/examen/entorno.js",
  "../src/motor/motorAlertas.js",
  "../src/motor/gestorAlertas.js",
  "../src/motor/alimentarMotor.js",
  "../src/sesion/nie.js",
  "../src/sesion/almacenSesiones.js",
  "../src/sesion/colaSubida.js",
  "../src/deteccion/proctorDetector.js",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS_SHELL)),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))),
    ),
  );
});

self.addEventListener("fetch", (evento) => {
  // Network-first: si hay red, siempre se prefiere la versión actual (esto
  // no es contenido estático de largo plazo, es una app en desarrollo activo).
  evento.respondWith(
    fetch(evento.request).catch(() => caches.match(evento.request)),
  );
});

self.addEventListener("sync", (evento) => {
  if (evento.tag === "subir-sesiones-pendientes") {
    evento.waitUntil(reintentarPendientes());
  }
});
