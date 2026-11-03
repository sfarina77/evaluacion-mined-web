import { nube, nubeConfigurada } from "../src/nube/nube.js";
import { obtener as obtenerExamenes } from "../src/login/examenConfig.js";
import { describirEvento, SITUACIONES } from "../docente/etiquetas.js";
import { filtrarEventos, soloConFoto, contarPorSituacion, resumirPorExamen } from "../docente/analitica.js";

/**
 * Consola de integridad (evaluacionsv.com/docente/admin.html): galería de
 * evidencia y análisis entre TODOS los exámenes, no uno a la vez como el
 * panel en vivo (index.html/panel.js). Es la respuesta a "¿no es fácil
 * copiarse? y si lo hacen, ¿lo bloqueamos o lo analizamos?" -- ver
 * docente/README.md.
 *
 * Acceso: SOLO admins (documento en `admins/{correo}`). Un docente normal ve
 * el panel en vivo de sus propios exámenes, no esta consola -- las reglas de
 * Firestore (nube/firestore.rules) ya limitan lo que puede leer un docente a
 * sus exámenes asignados, así que esta pantalla no podría mostrarle más de lo
 * que las reglas permiten aunque quisiera: lo que hace este archivo es negar
 * el acceso ANTES, con un mensaje claro, en vez de dejar que cada consulta
 * falle una por una.
 *
 * Todo lo que viene de Firestore se pinta con textContent, nunca como HTML.
 */

const $ = (id) => document.getElementById(id);
const VENTANA_POR_OMISION_DIAS = 7;

const estado = {
  n: null,
  correo: null,
  infoExamenes: {},
  sesiones: [],
  eventos: [], // de la ventana de fechas actual, con _sesionId y tsMs ya resueltos
  vista: "resumen",
};

function mostrar(vista) {
  for (const id of ["vista-entrada", "vista-sin-config", "vista-sin-permiso", "vista-admin"]) {
    $(id).hidden = id !== vista;
  }
}

function el(etiqueta, { clase, texto } = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  nodo.append(...hijos);
  return nodo;
}

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
    if (!usuario || usuario.isAnonymous) {
      $("usuario").hidden = true;
      mostrar("vista-entrada");
      return;
    }
    entrar(usuario).catch((error) => {
      console.error(error);
      avisarEntrada("No se pudo cargar la consola. Intenta de nuevo.");
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
  if (!admin) {
    $("correo-sin-permiso").textContent = correo;
    mostrar("vista-sin-permiso");
    return;
  }
  estado.correo = correo;
  $("correo-usuario").textContent = correo;
  $("usuario").hidden = false;
  mostrar("vista-admin");

  const { examenes } = await obtenerExamenes({});
  estado.infoExamenes = examenes;
  llenarFiltroExamen();
  llenarFiltroSituacion();
  configurarFiltros();
  configurarPestanas();
  configurarDialogos();

  // Semana por omisión: consultar TODO el historial desde el navegador no
  // escala (ver docs/escala_500mil.md) y acá no hay backend propio que
  // pre-agregue -- se amplía la ventana a mano si hace falta más rango.
  const hoy = new Date();
  const hace7 = new Date(hoy.getTime() - VENTANA_POR_OMISION_DIAS * 86_400_000);
  $("filtro-desde").value = formatoFecha(hace7);
  $("filtro-hasta").value = formatoFecha(hoy);

  await cargar();
}

function formatoFecha(fecha) {
  return fecha.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ filtros

function llenarFiltroExamen() {
  const select = $("filtro-examen");
  for (const codigo of Object.keys(estado.infoExamenes).sort()) {
    const opcion = el("option", { texto: `${codigo} — ${estado.infoExamenes[codigo]?.nombre ?? ""}` });
    opcion.value = codigo;
    select.append(opcion);
  }
}

function llenarFiltroSituacion() {
  const select = $("filtro-situacion");
  for (const [clave, titulo] of Object.entries(SITUACIONES)) {
    const opcion = el("option", { texto: titulo });
    opcion.value = clave;
    select.append(opcion);
  }
}

function configurarFiltros() {
  $("boton-refrescar").addEventListener("click", () => cargar());
  // Examen/situación/NIE no necesitan volver a pedirle nada a Firestore: ya
  // tenemos los eventos de la ventana de fechas en memoria, solo se vuelve a
  // pintar. Cambiar las fechas sí vuelve a consultar (cambia la ventana).
  for (const id of ["filtro-examen", "filtro-situacion", "filtro-nie"]) {
    $(id).addEventListener("input", pintarTodo);
  }
}

function filtrosActuales() {
  const desde = $("filtro-desde").value ? new Date(`${$("filtro-desde").value}T00:00:00`).getTime() : null;
  const hasta = $("filtro-hasta").value ? new Date(`${$("filtro-hasta").value}T23:59:59`).getTime() : null;
  return {
    examenId: $("filtro-examen").value || undefined,
    situacion: $("filtro-situacion").value || undefined,
    nie: $("filtro-nie").value.trim() || undefined,
    desdeMs: desde ?? undefined,
    hastaMs: hasta ?? undefined,
  };
}

function configurarPestanas() {
  for (const boton of document.querySelectorAll(".pestana")) {
    boton.addEventListener("click", () => {
      estado.vista = boton.dataset.vista;
      for (const otro of document.querySelectorAll(".pestana")) otro.setAttribute("aria-selected", String(otro === boton));
      for (const seccion of document.querySelectorAll(".seccion-vista")) {
        seccion.hidden = seccion.id !== `seccion-${estado.vista}`;
      }
    });
  }
}

// -------------------------------------------------------------------- carga

async function cargar() {
  const { db, fs } = estado.n;
  $("mensaje-carga").hidden = false;
  $("mensaje-error-carga").hidden = true;
  const { desdeMs, hastaMs } = filtrosActuales();
  $("aviso-ventana").textContent =
    `Mostrando del ${$("filtro-desde").value} al ${$("filtro-hasta").value}. ` +
    "Una ventana más amplia tarda más y lee más datos.";

  try {
    const desdeFecha = desdeMs ? new Date(desdeMs) : null;
    const hastaFecha = hastaMs ? new Date(hastaMs) : null;

    // Rango simple en un solo campo (inicio/ts): no exige índice compuesto.
    // El resto de los filtros (examen, situación, NIE) se aplican en memoria
    // con las funciones puras de analitica.js, sobre este conjunto ya acotado.
    // El limit() es un tope de seguridad si alguien borra las dos fechas: sin
    // eso, una consulta sin rango leería la colección entera.
    const TOPE_LECTURA = 5000;
    const consultaSesiones = fs.query(
      fs.collection(db, "sesiones"),
      ...(desdeFecha ? [fs.where("inicio", ">=", desdeFecha)] : []),
      ...(hastaFecha ? [fs.where("inicio", "<=", hastaFecha)] : []),
      fs.orderBy("inicio", "desc"),
      fs.limit(TOPE_LECTURA),
    );
    const consultaEventos = fs.query(
      fs.collectionGroup(db, "eventos"),
      ...(desdeFecha ? [fs.where("ts", ">=", desdeFecha)] : []),
      ...(hastaFecha ? [fs.where("ts", "<=", hastaFecha)] : []),
      fs.orderBy("ts", "desc"),
      fs.limit(TOPE_LECTURA),
    );

    const [fotoSesiones, fotoEventos] = await Promise.all([
      fs.getDocs(consultaSesiones),
      fs.getDocs(consultaEventos),
    ]);

    estado.sesiones = fotoSesiones.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    estado.eventos = fotoEventos.docs.map((d) => {
      const datos = d.data({ serverTimestamps: "estimate" });
      return { ...datos, _sesionId: d.ref.parent.parent.id, tsMs: datos.ts?.toMillis?.() ?? null };
    });

    pintarTodo();
  } catch (error) {
    console.error("[consola] no se pudo cargar:", error);
    // El error más probable la primera vez es un índice compuesto que falta
    // -- Firestore lo dice en la consola del navegador con un link directo
    // para crearlo en un clic. Si no es eso, se muestra el mensaje tal cual.
    $("mensaje-error-carga").textContent =
      "No se pudo cargar. Si la consola del navegador (F12) muestra un enlace para crear un índice, ábrelo y espera " +
      "a que termine de construirse (unos minutos), luego vuelve a Actualizar. Detalle: " + (error?.message ?? error);
    $("mensaje-error-carga").hidden = false;
  } finally {
    $("mensaje-carga").hidden = true;
  }
}

function eventosFiltrados() {
  return filtrarEventos(estado.eventos, filtrosActuales());
}

function sesionesFiltradas() {
  const { examenId, nie } = filtrosActuales();
  return estado.sesiones.filter(
    (sesion) => (!examenId || sesion.examenId === examenId) && (!nie || sesion.nie === nie),
  );
}

// ------------------------------------------------------------------ resumen

function pintarTodo() {
  pintarResumen();
  pintarGaleria();
  pintarPorExamen();
}

function pintarResumen() {
  const sesiones = sesionesFiltradas();
  const eventos = eventosFiltrados();
  const anulados = sesiones.filter((s) => s.estado === "anulado").length;

  const cifra = (valor, texto) => el("div", { clase: "cifra" }, el("strong", { texto: String(valor) }), el("span", { texto }));
  $("cifras-globales").replaceChildren(
    cifra(sesiones.length, "sesiones en la ventana"),
    cifra(anulados, "exámenes anulados"),
    cifra(sesiones.length ? `${Math.round((anulados / sesiones.length) * 100)}%` : "—", "tasa de anulación"),
    cifra(eventos.filter((e) => e.tipo === "alerta").length, "alertas que contaron"),
  );

  const ranking = contarPorSituacion(eventos);
  $("sin-alertas").hidden = ranking.length > 0;
  const max = ranking[0]?.cantidad ?? 1;
  $("ranking-situaciones").replaceChildren(...ranking.map(({ titulo, cantidad }) => filaRanking(titulo, cantidad, max)));
}

function filaRanking(titulo, cantidad, max) {
  const relleno = el("div", { clase: "ranking-relleno" });
  relleno.style.width = `${Math.max(4, Math.round((cantidad / max) * 100))}%`;
  return el(
    "li",
    {},
    el("div", { clase: "ranking-fila" }, el("span", { texto: titulo }), el("strong", { texto: String(cantidad) })),
    el("div", { clase: "ranking-barra" }, relleno),
  );
}

// ------------------------------------------------------------------ galería

function pintarGaleria() {
  const fotos = soloConFoto(eventosFiltrados());
  $("sin-fotos").hidden = fotos.length > 0;
  $("galeria").replaceChildren(
    ...fotos.slice(0, 300).map((evento) => {
      const { titulo } = describirEvento(evento);
      const tarjeta = el("button", { clase: "foto-tarjeta" });
      tarjeta.type = "button";
      const imagen = el("img");
      imagen.src = evento.foto;
      imagen.alt = titulo;
      imagen.loading = "lazy";
      tarjeta.append(
        imagen,
        el("div", { clase: "foto-pie" }, el("span", { texto: titulo }), el("span", { clase: "tenue", texto: evento.nie ?? "" })),
      );
      tarjeta.addEventListener("click", () => abrirSesion(evento._sesionId, evento.examenId, evento.nie));
      return tarjeta;
    }),
  );
  if (fotos.length > 300) {
    $("galeria").append(
      el("p", { clase: "tenue", texto: `Mostrando las primeras 300 de ${fotos.length} fotos. Acota los filtros para ver el resto.` }),
    );
  }
}

// -------------------------------------------------------------- por examen

function pintarPorExamen() {
  const resumen = resumirPorExamen(sesionesFiltradas());
  $("filas-examenes").replaceChildren(
    ...resumen.map((fila) =>
      el(
        "tr",
        {},
        el("td", { texto: `${fila.examenId} — ${estado.infoExamenes[fila.examenId]?.nombre ?? ""}` }),
        el("td", { texto: String(fila.total) }),
        el("td", { clase: fila.anulado > 0 ? "texto-grave" : "", texto: String(fila.anulado) }),
        el("td", { texto: String(fila.terminado) }),
        el("td", { texto: String(fila.en_curso) }),
        el("td", { texto: `${Math.round(fila.tasaAnulacion * 100)}%` }),
      ),
    ),
  );
}

// ------------------------------------------------------------ línea de tiempo

function configurarDialogos() {
  $("boton-cerrar-sesion").addEventListener("click", () => $("dialogo-sesion").close());
  $("dialogo-foto").addEventListener("click", () => $("dialogo-foto").close());
}

function abrirSesion(sesionId, examenId, nie) {
  const { db, fs } = estado.n;
  $("titulo-sesion").textContent = `NIE ${nie ?? ""}`;
  $("subtitulo-sesion").textContent = examenId ?? "";
  $("linea-tiempo").replaceChildren(el("li", { clase: "tenue", texto: "Cargando…" }));
  $("dialogo-sesion").showModal();

  fs.getDocs(fs.query(fs.collection(db, "sesiones", sesionId, "eventos"), fs.orderBy("ts")))
    .then((foto) => pintarEventosSesion(foto.docs.map((d) => d.data({ serverTimestamps: "estimate" }))))
    .catch((error) => {
      console.error("[consola] eventos de sesión:", error);
      $("linea-tiempo").replaceChildren(el("li", { clase: "mensaje-error", texto: "No se pudo cargar la línea de tiempo." }));
    });
}

function pintarEventosSesion(eventos) {
  const horaCorta = (ms) => new Date(ms).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
  if (!eventos.length) $("linea-tiempo").replaceChildren(el("li", { clase: "tenue", texto: "Sin eventos." }));
}

arrancar();
