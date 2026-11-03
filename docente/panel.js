import { nube, nubeConfigurada } from "../src/nube/nube.js";
import { obtener as obtenerExamenes } from "../src/login/examenConfig.js";
import { describirEvento, estadoVisible, haceCuanto, leerCorreos } from "./etiquetas.js";

/**
 * Panel del docente (evaluacionsv.com/docente): entra con Google, ve sus
 * exámenes y, en vivo, a cada estudiante con su línea de tiempo y fotos.
 * Qué puede leer cada quien lo deciden las reglas (nube/firestore.rules), no
 * este archivo: acá solo se esconde lo que igual sería rechazado.
 *
 * Todo lo que escribe el estudiante (NIE, detalles) se pinta con
 * textContent, nunca como HTML.
 */

const DOMINIO_DOCENTE = "@edu.gob.sv";
const $ = (id) => document.getElementById(id);

const estado = {
  n: null,
  correo: null,
  admin: false,
  examenes: new Map(), // codigo -> { nombre, docentes }
  infoExamenes: {}, // examenes.json: url, claves
  seleccionado: null,
  sesiones: [],
  revision: [], // respuestas pendientes (autoría), con _sesionId e id del item
  desuscribirExamenes: null,
  desuscribirSesiones: null,
  desuscribirEventos: null,
  desuscribirRevision: null,
};

function mostrar(vista) {
  for (const id of ["vista-entrada", "vista-sin-config", "vista-panel"]) $(id).hidden = id !== vista;
}

function el(etiqueta, { clase, texto } = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  nodo.append(...hijos);
  return nodo;
}

const horaCorta = (ms) =>
  new Date(ms).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// ------------------------------------------------------------------ entrada

async function arrancar() {
  if (!nubeConfigurada()) {
    mostrar("vista-sin-config");
    return;
  }
  estado.n = await nube();
  const { auth, fa } = estado.n;

  $("boton-google").addEventListener("click", async () => {
    $("mensaje-entrada").hidden = true;
    const proveedor = new fa.GoogleAuthProvider();
    proveedor.setCustomParameters({ prompt: "select_account" });
    try {
      await fa.signInWithPopup(auth, proveedor);
    } catch (error) {
      if (error?.code !== "auth/popup-closed-by-user") avisarEntrada("No se pudo entrar. Intenta de nuevo.");
    }
  });
  $("boton-salir").addEventListener("click", () => fa.signOut(auth));

  fa.onAuthStateChanged(auth, (usuario) => {
    limpiarSuscripciones();
    if (!usuario || usuario.isAnonymous) {
      $("usuario").hidden = true;
      mostrar("vista-entrada");
      return;
    }
    entrar(usuario).catch((error) => {
      console.error(error);
      avisarEntrada("No se pudo cargar el panel. Intenta de nuevo.");
      fa.signOut(auth);
    });
  });
}

function avisarEntrada(texto) {
  $("mensaje-entrada").textContent = texto;
  $("mensaje-entrada").hidden = false;
}

async function entrar(usuario) {
  const { db, fs, fa, auth } = estado.n;
  const correo = usuario.email?.toLowerCase() ?? "";
  const admin = (await fs.getDoc(fs.doc(db, "admins", correo))).exists();
  if (!admin && !(usuario.emailVerified && correo.endsWith(DOMINIO_DOCENTE))) {
    await fa.signOut(auth);
    avisarEntrada(`Entra con tu cuenta ${DOMINIO_DOCENTE}. ${correo} no tiene acceso.`);
    return;
  }
  estado.correo = correo;
  estado.admin = admin;
  $("correo-usuario").textContent = correo;
  $("usuario").hidden = false;
  $("seccion-admin").hidden = !admin;
  mostrar("vista-panel");

  obtenerExamenes({}).then(({ examenes }) => {
    estado.infoExamenes = examenes;
    if (admin) pintarExamenes();
    if (estado.seleccionado) pintarEncabezado();
  });

  const consulta = admin
    ? fs.collection(db, "examenes")
    : fs.query(fs.collection(db, "examenes"), fs.where("docentes", "array-contains", correo));
  estado.desuscribirExamenes = fs.onSnapshot(consulta, (foto) => {
    estado.examenes = new Map(foto.docs.map((d) => [d.id, d.data()]));
    pintarExamenes();
  });
}

function limpiarSuscripciones() {
  for (const clave of ["desuscribirExamenes", "desuscribirSesiones", "desuscribirEventos", "desuscribirRevision"]) {
    estado[clave]?.();
    estado[clave] = null;
  }
  estado.seleccionado = null;
  $("detalle-examen").hidden = true;
  $("sin-seleccion").hidden = false;
}

// ------------------------------------------------------------------ exámenes

function codigosVisibles() {
  const codigos = new Set(estado.examenes.keys());
  // El admin ve también los de examenes.json que todavía no tienen docentes.
  if (estado.admin) for (const codigo of Object.keys(estado.infoExamenes)) codigos.add(codigo);
  return [...codigos].sort();
}

function nombreDe(codigo) {
  return estado.examenes.get(codigo)?.nombre || estado.infoExamenes[codigo]?.nombre || "";
}

function pintarExamenes() {
  const lista = $("lista-examenes");
  const codigos = codigosVisibles();
  lista.replaceChildren(
    ...codigos.map((codigo) => {
      const boton = el("button", {}, el("span", { clase: "codigo", texto: codigo }), el("span", { clase: "nombre", texto: nombreDe(codigo) }));
      boton.type = "button";
      boton.setAttribute("aria-current", String(codigo === estado.seleccionado));
      boton.addEventListener("click", () => seleccionar(codigo));
      return el("li", {}, boton);
    }),
  );
  $("sin-examenes").hidden = codigos.length > 0;
}

function seleccionar(codigo) {
  const { db, fs } = estado.n;
  estado.desuscribirSesiones?.();
  estado.seleccionado = codigo;
  estado.sesiones = [];
  pintarExamenes();
  $("sin-seleccion").hidden = true;
  $("detalle-examen").hidden = false;
  claveVisible = false;
  pintarEncabezado();
  pintarSesiones();

  if (estado.admin) {
    $("admin-codigo").value = codigo;
    $("admin-nombre").value = nombreDe(codigo);
    $("admin-docentes").value = (estado.examenes.get(codigo)?.docentes ?? []).join("\n");
  }

  const consulta = fs.query(fs.collection(db, "sesiones"), fs.where("examenId", "==", codigo));
  estado.desuscribirSesiones = fs.onSnapshot(
    consulta,
    (foto) => {
      estado.sesiones = foto.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
      pintarSesiones();
    },
    (error) => console.error("sesiones:", error),
  );

  // Plataforma de autoría (2026-11-03): respuestas que la función en la nube
  // dejó en "pendiente_revision" (interpretación/respuesta completa con
  // sugerencia de IA, o pizarra para calificar a mano). collectionGroup
  // porque están repartidas entre las subcolecciones de cada sesión -- ver
  // nube/firestore.rules, misma idea que ya usa dashboard/dashboard.js con
  // "eventos".
  estado.desuscribirRevision?.();
  const consultaRevision = fs.query(
    fs.collectionGroup(db, "respuestas"),
    fs.where("examenId", "==", codigo),
    fs.where("estado", "==", "pendiente_revision"),
  );
  estado.desuscribirRevision = fs.onSnapshot(
    consultaRevision,
    (foto) => {
      estado.revision = foto.docs.map((d) => ({
        itemId: d.id,
        sesionId: d.ref.parent.parent.id,
        ...d.data({ serverTimestamps: "estimate" }),
      }));
      pintarRevision();
    },
    (error) => console.error("revision:", error),
  );
}

// -------------------------------------------------------- revisión (autoría)

function pintarRevision() {
  $("sin-revision").hidden = estado.revision.length > 0;
  $("lista-revision").replaceChildren(
    ...estado.revision.map((respuesta) => {
      const sugerido = respuesta.calificacionIA?.puntos;
      const campoPuntos = el("input");
      campoPuntos.type = "number";
      campoPuntos.min = "0";
      campoPuntos.step = "0.5";
      if (sugerido != null) campoPuntos.value = String(sugerido);

      const botonConfirmar = el("button", { clase: "boton boton-primario", texto: "Confirmar calificación" });
      botonConfirmar.type = "button";
      const mensaje = el("span", { clase: "tenue" });
      botonConfirmar.addEventListener("click", () => confirmarRevision(respuesta, campoPuntos, mensaje, botonConfirmar));

      const cuerpo = el(
        "li",
        { clase: "fila-revision" },
        el(
          "div",
          { clase: "encabezado-revision" },
          el("span", { texto: `NIE ${respuesta.nie ?? ""}` }),
          el("span", { texto: respuesta.tipo ?? "" }),
        ),
      );
      if (respuesta.respuesta) cuerpo.append(el("p", { clase: "respuesta-revision", texto: String(respuesta.respuesta) }));
      if (typeof respuesta.foto === "string" && respuesta.foto.startsWith("data:image/jpeg;base64,")) {
        const imagen = el("img");
        imagen.src = respuesta.foto;
        imagen.alt = "Respuesta en pizarra";
        cuerpo.append(imagen);
      }
      if (respuesta.calificacionIA) {
        cuerpo.append(
          el(
            "div",
            { clase: "sugerencia-ia" },
            el("strong", { texto: `IA sugiere: ${respuesta.calificacionIA.puntos} pts — ` }),
            el("span", { texto: respuesta.calificacionIA.justificacion ?? "" }),
          ),
        );
      }
      cuerpo.append(el("div", { clase: "controles-revision" }, el("span", { texto: "Puntos:" }), campoPuntos, botonConfirmar, mensaje));
      return cuerpo;
    }),
  );
}

async function confirmarRevision(respuesta, campoPuntos, mensaje, boton) {
  const { db, fs } = estado.n;
  const puntos = Number(campoPuntos.value);
  if (!Number.isFinite(puntos) || puntos < 0) {
    mensaje.textContent = "Puntos inválidos.";
    return;
  }
  boton.disabled = true;
  try {
    await fs.updateDoc(fs.doc(db, "sesiones", respuesta.sesionId, "respuestas", respuesta.itemId), {
      calificacionFinal: puntos,
      estado: "calificada",
    });
    // No hace falta repintar a mano: el onSnapshot de arriba ya deja de
    // traer este documento apenas sale de "pendiente_revision".
  } catch (error) {
    console.error("[panel] no se pudo confirmar la calificación:", error);
    mensaje.textContent = "No se pudo guardar.";
    boton.disabled = false;
  }
}

let claveVisible = false;
$("boton-clave").addEventListener("click", () => {
  claveVisible = !claveVisible;
  pintarEncabezado();
});

function pintarEncabezado() {
  const codigo = estado.seleccionado;
  const info = estado.infoExamenes[codigo] ?? {};
  $("titulo-examen").textContent = codigo;
  $("subtitulo-examen").textContent = nombreDe(codigo);
  const clave = info.clave_reingreso ?? info.pin_salida ?? null;
  $("boton-clave").textContent = clave === null ? "—" : claveVisible ? clave : "••••";
}

// ------------------------------------------------------------------ sesiones

function pintarSesiones() {
  const ahora = Date.now();
  const filas = [...estado.sesiones].sort(
    (a, b) => (b.inicio?.toMillis?.() ?? 0) - (a.inicio?.toMillis?.() ?? 0),
  );
  const grupos = { en_curso: 0, necesita_clave: 0, sin_conexion: 0, terminado: 0, anulado: 0 };

  $("filas-sesiones").replaceChildren(
    ...filas.map((sesion) => {
      const visible = estadoVisible(sesion, ahora);
      grupos[visible.grupo] += 1;
      const contador = sesion.contador ?? 0;
      const max = sesion.maxAlertas ?? 10;
      const celdaAlertas = el("td", { texto: `${contador} / ${max}` });
      if (contador >= 7) celdaAlertas.className = "texto-grave";
      else if (contador > 0) celdaAlertas.className = "texto-aviso";
      const latido = sesion.ultimoLatido?.toMillis?.();
      const fila = el(
        "tr",
        {},
        el("td", { texto: sesion.nie }),
        el("td", {}, el("span", { clase: `chip ${visible.clase}`, texto: visible.texto })),
        celdaAlertas,
        el("td", { texto: `${sesion.advertencias ?? 0} / ${sesion.maxAdvertencias ?? 5}` }),
        el("td", { texto: sesion.inicio ? horaCorta(sesion.inicio.toMillis()) : "—" }),
        el("td", { clase: "tenue", texto: latido ? haceCuanto(latido, ahora) : "—" }),
      );
      fila.addEventListener("click", () => abrirSesion(sesion.id));
      return fila;
    }),
  );
  $("sin-sesiones").hidden = filas.length > 0;

  const cifra = (valor, texto) => el("div", { clase: "cifra" }, el("strong", { texto: String(valor) }), el("span", { texto }));
  $("resumen").replaceChildren(
    cifra(filas.length, "estudiantes"),
    cifra(grupos.en_curso, "en curso"),
    cifra(grupos.necesita_clave, "necesitan tu clave"),
    cifra(grupos.sin_conexion, "sin conexión"),
    cifra(grupos.terminado, "terminaron"),
    cifra(grupos.anulado, "anulados"),
  );
}

// "hace N s" y "sin conexión" dependen del reloj, no solo de los datos.
setInterval(() => {
  if (estado.seleccionado) pintarSesiones();
}, 15_000);

// ------------------------------------------------------------ línea de tiempo

function abrirSesion(sesionId) {
  const { db, fs } = estado.n;
  const sesion = estado.sesiones.find((s) => s.id === sesionId);
  $("titulo-sesion").textContent = `NIE ${sesion?.nie ?? ""}`;
  $("subtitulo-sesion").textContent = sesion
    ? `${estado.seleccionado} · ${estadoVisible(sesion, Date.now()).texto} · ${sesion.contador ?? 0} alertas`
    : "";
  $("linea-tiempo").replaceChildren(el("li", { clase: "tenue", texto: "Cargando…" }));
  $("dialogo-sesion").showModal();

  estado.desuscribirEventos?.();
  const consulta = fs.query(fs.collection(db, "sesiones", sesionId, "eventos"), fs.orderBy("ts"));
  estado.desuscribirEventos = fs.onSnapshot(
    consulta,
    (foto) => pintarEventos(foto.docs.map((d) => d.data({ serverTimestamps: "estimate" }))),
    (error) => console.error("eventos:", error),
  );
}

function pintarEventos(eventos) {
  $("linea-tiempo").replaceChildren(
    ...eventos.map((evento) => {
      const { titulo, detalle, clase } = describirEvento(evento);
      const cuerpo = el("div", {}, el("span", { clase: `chip ${clase}`, texto: titulo }));
      if (detalle) cuerpo.append(el("p", { clase: "detalle", texto: detalle }));
      const item = el("li", {}, el("span", { clase: "hora", texto: evento.ts ? horaCorta(evento.ts.toMillis()) : "" }), cuerpo);
      if (typeof evento.foto === "string" && evento.foto.startsWith("data:image/jpeg;base64,")) {
        const imagen = el("img");
        imagen.src = evento.foto;
        imagen.alt = `Foto: ${titulo}`;
        imagen.addEventListener("click", () => {
          $("foto-grande").src = evento.foto;
          $("dialogo-foto").showModal();
        });
        item.append(imagen);
      }
      return item;
    }),
  );
  if (!eventos.length) $("linea-tiempo").replaceChildren(el("li", { clase: "tenue", texto: "Sin eventos todavía." }));
}

$("boton-cerrar-sesion").addEventListener("click", () => $("dialogo-sesion").close());
$("dialogo-sesion").addEventListener("close", () => {
  estado.desuscribirEventos?.();
  estado.desuscribirEventos = null;
});
$("dialogo-foto").addEventListener("click", () => $("dialogo-foto").close());

// ------------------------------------------------------------------ admin

$("form-admin").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const { db, fs } = estado.n;
  const mensaje = $("mensaje-admin");
  const codigo = $("admin-codigo").value.trim().toUpperCase();
  const { validos, invalidos } = leerCorreos($("admin-docentes").value);
  mensaje.hidden = false;
  if (invalidos.length) {
    mensaje.textContent = `Correos no válidos: ${invalidos.join(", ")}`;
    return;
  }
  try {
    await fs.setDoc(fs.doc(db, "examenes", codigo), {
      nombre: $("admin-nombre").value.trim(),
      docentes: validos,
    });
    mensaje.textContent = `Guardado: ${codigo} con ${validos.length} docente(s).`;
  } catch (error) {
    console.error(error);
    mensaje.textContent = "No se pudo guardar.";
  }
});

arrancar();
