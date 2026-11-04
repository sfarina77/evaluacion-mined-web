import { obtener as obtenerExamenes, normalizarUrlExamen } from "./examenConfig.js";
import { nieValido } from "../sesion/nie.js";
import { pantallaExtendida } from "../examen/entorno.js";
import { nube, nubeConfigurada } from "../nube/nube.js";
import { colorDeNumero, nombreDeColor, buscarEnLista } from "../examen/listaEstudiantes.js";

// Examen de prueba embebido, igual que EXAMENES_LOCALES en el cliente Windows
// y en LoginActivity de Android: permite probar el flujo completo sin
// depender de la red ni del backend.
const EXAMENES_LOCALES = {
  TEST01: {
    // Página propia de la PWA: mined.gob.sv no se deja mostrar en un iframe.
    url: new URL("../../public/examen-prueba.html", import.meta.url).href,
    pin_salida: "0000",
    clave_reingreso: "1111",
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
  const bloqueNumeroLista = document.getElementById("bloque-numero-lista");
  const campoNumeroLista = document.getElementById("campo-numero-lista");
  const confirmacionEstudiante = document.getElementById("confirmacion-estudiante");
  const campoConsentimiento = document.getElementById("campo-consentimiento");
  const mensajeError = document.getElementById("mensaje-error");
  const botonIniciar = document.getElementById("boton-iniciar");
  const botonCancelar = document.getElementById("boton-cancelar");

  // Examen ya resuelto para el código que hay escrito ahora mismo (o null
  // mientras no se reconoce ninguno) -- se guarda para no tener que volver a
  // consultar Firestore al tocar "Iniciar Evaluación", y porque decide qué
  // campo de identificación mostrar (ver actualizarModoIdentificacion).
  let examenReconocido = null;

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
    campoNumeroLista.value = "";
    campoConsentimiento.checked = false;
    ocultarError();
  });

  /**
   * Número de lista (2026-11-04): en vez del NIE, para niños que todavía no
   * lo saben de memoria -- el docente carga número->nombre en el examen (ver
   * autoria/index.html) y esto reconoce el modo apenas el código coincide
   * con un examen así, SIN esperar a que toquen "Iniciar Evaluación" (igual
   * que antes solo pasaba al enviar). El color es la segunda confirmación:
   * si puso el número de otro compañero, va a ver un nombre y un color que
   * no son los que le dijeron.
   */
  async function actualizarModoIdentificacion() {
    const codigo = campoCodigo.value.trim().toUpperCase();
    examenReconocido = codigo ? await buscarExamenDeAutoria(codigo) : null;
    const esNumeroLista = examenReconocido?.identificacion === "numero_lista";
    campoNie.hidden = esNumeroLista;
    bloqueNumeroLista.hidden = !esNumeroLista;
    if (esNumeroLista) actualizarConfirmacionEstudiante();
  }

  function actualizarConfirmacionEstudiante() {
    const estudiante = buscarEnLista(examenReconocido?.lista_estudiantes, campoNumeroLista.value);
    if (!estudiante) {
      confirmacionEstudiante.hidden = true;
      return;
    }
    const color = colorDeNumero(estudiante.numero);
    const punto = document.createElement("span");
    punto.className = "punto-color";
    punto.style.background = color;
    confirmacionEstudiante.replaceChildren(punto, document.createTextNode(`¿Eres tú, ${estudiante.nombre}? ${nombreDeColor(color)}`));
    confirmacionEstudiante.hidden = false;
  }

  campoCodigo.addEventListener("blur", actualizarModoIdentificacion);
  campoNumeroLista.addEventListener("input", actualizarConfirmacionEstudiante);

  // Link para compartir (2026-11-04): autoria/index.html y docente/index.html
  // arman "https://.../?codigo=XXXX" -- con esto, abrir ese link ya deja el
  // código listo, al estudiante solo le falta su NIE/número y aceptar la
  // cámara. Sin esto el link no ahorraba nada sobre decirle el código de voz.
  const codigoDesdeUrl = new URLSearchParams(location.search).get("codigo");
  if (codigoDesdeUrl) {
    campoCodigo.value = codigoDesdeUrl.trim().toUpperCase();
    actualizarModoIdentificacion();
  }

  botonIniciar.addEventListener("click", async () => {
    ocultarError();
    // El blur de campoCodigo ya debería haber corrido, pero si el estudiante
    // nunca le quitó el foco (p. ej. tocó "Iniciar" directo desde el
    // teclado), hay que asegurarse de tener el examen reconocido ANTES de
    // decidir qué campo de identificación exigir.
    await actualizarModoIdentificacion();

    const codigo = campoCodigo.value.trim().toUpperCase();
    if (!codigo) {
      mostrarError("Ese código de examen no existe");
      return;
    }

    let nie;
    if (examenReconocido?.identificacion === "numero_lista") {
      const estudiante = buscarEnLista(examenReconocido.lista_estudiantes, campoNumeroLista.value);
      if (!estudiante) {
        mostrarError("Ese número no está en la lista. Pregúntale a tu docente.");
        return;
      }
      nie = String(estudiante.numero);
    } else {
      nie = campoNie.value.trim();
      if (!nieValido(nie)) {
        mostrarError("NIE con formato inválido");
        return;
      }
    }

    if (!campoConsentimiento.checked) {
      mostrarError("Para rendir el examen tienes que aceptar el uso de la cámara");
      return;
    }
    // Antes de entrar, para que no le cuente como advertencia algo que ni
    // sabía: con el examen ya empezado, el segundo monitor es una salida.
    if (pantallaExtendida()) {
      mostrarError("Desconecta el segundo monitor (o ponlo en modo espejo) para rendir el examen");
      return;
    }

    botonIniciar.disabled = true;
    try {
      // Un examen "de autoría" (plataforma de autoría, 2026-11-03) vive en
      // Firestore, no en examenes.json -- se prueba primero ahí (si hay
      // nube configurada) y solo si no existe se sigue con el camino de
      // siempre (red -> caché -> local). Así un código de GitHub sigue
      // funcionando exactamente igual que hoy; esto es pura adición.
      if (examenReconocido) {
        vista.hidden = true;
        onIniciar({ examenId: codigo, nie, info: examenReconocido });
        return;
      }

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

/**
 * Busca `codigo` en Firestore. Devuelve `info` (sin `url`: el reproductor
 * renderiza sus propias preguntas) si es un examen "de autoría", o `null` si
 * no existe ahí -- en ese caso el llamador sigue con examenes.json, igual que
 * siempre. Nunca lanza: sin nube configurada, o sin red, simplemente no hay
 * examen de autoría que encontrar.
 */
async function buscarExamenDeAutoria(codigo) {
  if (!nubeConfigurada()) return null;
  try {
    const { db, fs, auth, fa } = await nube();
    if (!auth.currentUser) await fa.signInAnonymously(auth);
    const doc = await fs.getDoc(fs.doc(db, "examenes", codigo));
    if (!doc.exists() || doc.data().modo !== "autoria") return null;
    const datos = doc.data();
    return {
      nombre: datos.nombre ?? codigo,
      modo: "autoria",
      pin_salida: datos.pin_salida ?? "0000",
      clave_reingreso: datos.clave_reingreso ?? "1111",
      advertencias_evasion: datos.advertencias_evasion,
      // Número de lista (2026-11-04): ver actualizarModoIdentificacion arriba.
      identificacion: datos.identificacion ?? "nie",
      lista_estudiantes: datos.lista_estudiantes ?? [],
    };
  } catch (error) {
    console.error("[login] no se pudo consultar Firestore para el examen de autoría:", error);
    return null;
  }
}
