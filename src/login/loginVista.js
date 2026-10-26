import { obtener as obtenerExamenes, normalizarUrlExamen } from "./examenConfig.js";
import { nieValido } from "../sesion/nie.js";

// Examen de prueba embebido, igual que EXAMENES_LOCALES en el cliente Windows
// y en LoginActivity de Android: permite probar el flujo completo sin
// depender de la red ni del backend.
const EXAMENES_LOCALES = {
  TEST01: {
    // Página propia de la PWA: mined.gob.sv no se deja mostrar en un iframe.
    url: new URL("../../public/examen-prueba.html", import.meta.url).href,
    pin_salida: "0000",
    nombre: "Examen de prueba",
    permitir_calculadora: true,
  },
};

/**
 * Pantalla de inicio: NIE + código de examen, igual que
 * apps/cliente-integrado/examen_unificado.py::init_pantalla_inicio y
 * LoginActivity.kt en Android. Resuelve el examen contra examenConfig.js
 * (red -> caché -> local) y llama `onIniciar` con lo necesario para arrancar
 * la vista de examen.
 */
export function inicializarLogin({ onIniciar }) {
  const vista = document.getElementById("vista-login");
  const campoNie = document.getElementById("campo-nie");
  const campoCodigo = document.getElementById("campo-codigo");
  const mensajeError = document.getElementById("mensaje-error");
  const botonIniciar = document.getElementById("boton-iniciar");
  const botonCancelar = document.getElementById("boton-cancelar");

  function mostrarError(texto) {
    mensajeError.textContent = texto;
    mensajeError.hidden = false;
  }
  function ocultarError() {
    mensajeError.hidden = true;
  }

  botonCancelar.addEventListener("click", () => {
    campoNie.value = "";
    campoCodigo.value = "";
    ocultarError();
  });

  botonIniciar.addEventListener("click", async () => {
    ocultarError();
    const nie = campoNie.value.trim();
    const codigo = campoCodigo.value.trim().toUpperCase();

    if (!nieValido(nie)) {
      mostrarError("NIE con formato inválido");
      return;
    }
    if (!codigo) {
      mostrarError("Ese código de examen no existe");
      return;
    }

    botonIniciar.disabled = true;
    try {
      const { examenes } = await obtenerExamenes(EXAMENES_LOCALES);
      const info = examenes[codigo];
      if (!info) {
        mostrarError("Ese código de examen no existe");
        return;
      }
      const url = normalizarUrlExamen(info.url);
      if (!url) {
        mostrarError("El link de este examen no es válido. Avisa a tu docente.");
        return;
      }
      vista.hidden = true;
      onIniciar({ examenId: codigo, nie, info: { ...info, url } });
    } catch {
      mostrarError("No se pudo obtener la lista de exámenes");
    } finally {
      botonIniciar.disabled = false;
    }
  });
}
