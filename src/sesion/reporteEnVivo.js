import { nube, nubeConfigurada } from "../nube/nube.js";
import { DIAS_RETENCION } from "../nube/configNube.js";

/**
 * Reporte en vivo al panel del docente (evaluacionsv.com/docente): un
 * documento `sesiones/{id}` con el estado actual del estudiante, y debajo
 * `eventos/` con cada alerta, advertencia o bloqueo, con una foto chica de la
 * cámara como evidencia. Forma de los datos y quién puede leerlos:
 * firestore.rules.
 *
 * Nunca debe trabar el examen: todo es "disparar y olvidar", los errores se
 * registran en consola y se descartan. Si la nube no está configurada o no
 * hay red, el examen sigue igual y la sesión completa queda en IndexedDB
 * (colaSubida.js) como antes.
 */

const LATIDO_MS = 60_000; // el panel marca "sin conexión" pasados 3 minutos
const FOTO_ANCHO = 320;
const FOTO_ALTO = 240;
const FOTO_CALIDAD = 0.6; // ~15 KB por foto
const FOTOS_MAXIMAS = 60; // por sesión; pasado eso los eventos van sin foto
const FOTO_INTERVALO_MIN_MS = 5_000; // ráfagas de eventos comparten foto

export function crearReporteEnVivo({ examenId, nie }) {
  if (!nubeConfigurada()) {
    const nada = () => {};
    return { iniciar: nada, evento: nada, estado: nada, cerrar: () => Promise.resolve() };
  }

  const sesionId = crypto.randomUUID();
  const expira = new Date(Date.now() + DIAS_RETENCION * 86_400_000);
  const video = document.getElementById("video-camara");
  const lienzo = document.createElement("canvas");
  lienzo.width = FOTO_ANCHO;
  lienzo.height = FOTO_ALTO;
  let fotosTomadas = 0;
  let ultimaFotoMs = 0;
  let ultimaFoto = null;
  let latido = null;
  let iniciada = false;

  // Cola en serie: el documento de la sesión tiene que existir antes que sus
  // eventos (las reglas lo leen), y los eventos llegan en orden.
  // Sin conexión inicial (SDK que no cargó, sin red al empezar) la cola queda
  // en null y todo lo demás se descarta: la sesión igual se guarda local.
  let cola = nube()
    .then(async (n) => {
      if (!n.auth.currentUser) await n.fa.signInAnonymously(n.auth);
      return n;
    })
    .catch((error) => {
      console.error("[reporte en vivo] no se pudo conectar:", error);
      return null;
    });
  const encolar = (trabajo) => {
    cola = cola.then(async (n) => {
      if (!n) return n;
      try {
        await trabajo(n);
      } catch (error) {
        console.error("[reporte en vivo]", error);
      }
      return n;
    });
    return cola;
  };

  const refSesion = (n) => n.fs.doc(n.db, "sesiones", sesionId);

  function foto() {
    const ahora = Date.now();
    // En una ráfaga (p. ej. la foto de inicio y una alerta en el mismo
    // segundo) cada evento lleva la misma foto en vez de quedar sin evidencia.
    if (ahora - ultimaFotoMs < FOTO_INTERVALO_MIN_MS) return ultimaFoto;
    if (fotosTomadas >= FOTOS_MAXIMAS) return null;
    if (!video.srcObject || video.readyState < 2 || !video.videoWidth) return null;
    const contexto = lienzo.getContext("2d");
    // Recorte central 4:3, sin espejo: es evidencia, no una vista previa.
    const escala = Math.max(FOTO_ANCHO / video.videoWidth, FOTO_ALTO / video.videoHeight);
    const ancho = video.videoWidth * escala;
    const alto = video.videoHeight * escala;
    contexto.drawImage(video, (FOTO_ANCHO - ancho) / 2, (FOTO_ALTO - alto) / 2, ancho, alto);
    fotosTomadas += 1;
    ultimaFotoMs = ahora;
    ultimaFoto = lienzo.toDataURL("image/jpeg", FOTO_CALIDAD);
    return ultimaFoto;
  }

  /** Crea la sesión (con la foto de inicio) y arranca el latido. */
  function iniciar(estadoInicial) {
    iniciada = true;
    encolar(async (n) => {
      await n.fs.setDoc(refSesion(n), {
        uid: n.auth.currentUser.uid,
        examenId,
        nie,
        cliente: "web",
        inicio: n.fs.serverTimestamp(),
        ultimoLatido: n.fs.serverTimestamp(),
        expira,
        ...estadoInicial,
      });
    });
    evento("inicio", { detalle: "Comenzó el examen", conFoto: true });
    latido = setInterval(() => {
      encolar((n) => n.fs.updateDoc(refSesion(n), { ultimoLatido: n.fs.serverTimestamp() }));
    }, LATIDO_MS);
  }

  /** Un hecho de la línea de tiempo. `t` en segundos desde el inicio. */
  function evento(tipo, { detalle = "", cuenta = false, t = null, conFoto = false } = {}) {
    if (!iniciada) return;
    // La foto se toma YA, no cuando la cola llegue a este evento.
    const imagen = conFoto ? foto() : null;
    encolar((n) =>
      n.fs.addDoc(n.fs.collection(refSesion(n), "eventos"), {
        tipo,
        detalle,
        cuenta,
        t,
        foto: imagen,
        ts: n.fs.serverTimestamp(),
        expira,
      }),
    );
  }

  /** Campos de estado del resumen que ve el docente (estado, contador...). */
  function estado(campos) {
    if (!iniciada) return;
    encolar((n) =>
      n.fs.updateDoc(refSesion(n), { ...campos, ultimoLatido: n.fs.serverTimestamp() }),
    );
  }

  /** Último estado y fin; espera (con tope) a que salga antes de recargar. */
  function cerrar(campos) {
    clearInterval(latido);
    if (!iniciada) return Promise.resolve();
    encolar((n) =>
      n.fs.updateDoc(refSesion(n), {
        ...campos,
        fin: n.fs.serverTimestamp(),
        ultimoLatido: n.fs.serverTimestamp(),
      }),
    );
    return Promise.race([cola, new Promise((ok) => setTimeout(ok, 4000))]);
  }

  return { iniciar, evento, estado, cerrar };
}
