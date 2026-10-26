import { inicializarLogin } from "./login/loginVista.js";
import { iniciarExamen } from "./examen/examenControlador.js";

inicializarLogin({
  onIniciar: ({ examenId, nie, info }) => {
    iniciarExamen({ examenId, nie, info });
  },
});

// Service worker: solo cachea el shell de la app para que abra sin red la
// segunda vez (no es la cola de subida de sesiones -- esa la maneja
// sesion/colaSubida.js con su propio reintento, ver README).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // type: "module" porque public/sw.js importa colaSubida.js con ES
    // modules -- soportado en Chrome/ChromeOS (el target de este cliente),
    // no universal en todos los navegadores todavía.
    navigator.serviceWorker.register("./public/sw.js", { type: "module" }).catch(() => {});
  });
}
