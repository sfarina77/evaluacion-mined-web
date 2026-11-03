import { nube, nubeConfigurada } from "../src/nube/nube.js";

/**
 * Autoría de exámenes (evaluacionsv.com/autoria): un docente crea un examen
 * "de autoría" (colegio/grado/sección + preguntas propias) en vez de apuntar
 * a una URL externa. El estudiante solo sigue necesitando su código + NIE,
 * igual que siempre -- ver src/examen/reproductor.js, que es quien RINDE
 * este examen, y nube/firestore.rules, que separa la pregunta (pública) de
 * la clave de respuesta (solo el docente/admin la lee).
 *
 * Todo lo que escribe el docente se guarda tal cual en Firestore y se pinta
 * de vuelta con textContent, nunca como HTML.
 */

const $ = (id) => document.getElementById(id);

const estado = {
  n: null,
  correo: null,
  examenes: new Map(), // codigo -> datos del documento examenes/{codigo}
  seleccionado: null,
  items: [],
  desuscribirExamenes: null,
  desuscribirItems: null,
  editandoItemId: null, // null = creando uno nuevo
  contenidos: new Map(), // id -> {materia, grado, tema, texto}, biblioteca compartida
  desuscribirContenidos: null,
};

function mostrar(vista) {
  for (const id of ["vista-entrada", "vista-sin-config", "vista-autoria"]) $(id).hidden = id !== vista;
}

function el(etiqueta, { clase, texto } = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  nodo.append(...hijos);
  return nodo;
}

const TITULOS_TIPO = {
  seleccion_simple: "Selección simple",
  seleccion_multiple: "Selección múltiple",
  interpretacion: "Interpretación",
  respuesta_completa: "Respuesta completa",
  pizarra: "Pizarra",
};

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
      avisarEntrada("No se pudo cargar la autoría. Intenta de nuevo.");
      fa.signOut(auth);
    });
  });
}

function avisarEntrada(texto) {
  $("mensaje-entrada").textContent = texto;
  $("mensaje-entrada").hidden = false;
}

async function entrar(usuario) {
  const { db, fs } = estado.n;
  const correo = usuario.email?.toLowerCase() ?? "";
  estado.correo = correo;
  $("correo-usuario").textContent = correo;
  $("usuario").hidden = false;
  mostrar("vista-autoria");

  const admin = (await fs.getDoc(fs.doc(db, "admins", correo))).exists();
  const consulta = admin
    ? fs.collection(db, "examenes")
    : fs.query(fs.collection(db, "examenes"), fs.where("docentes", "array-contains", correo));
  estado.desuscribirExamenes = fs.onSnapshot(consulta, (foto) => {
    estado.examenes = new Map(foto.docs.map((d) => [d.id, d.data()]));
    pintarExamenes();
  });

  // Biblioteca de contenidos: compartida entre todos los docentes/admins, no
  // depende del examen seleccionado -- se carga una sola vez al entrar.
  estado.desuscribirContenidos = fs.onSnapshot(fs.collection(db, "contenidos"), (foto) => {
    estado.contenidos = new Map(foto.docs.map((d) => [d.id, d.data()]));
    pintarSelectorContenidos();
  });

  configurarFormularioExamen();
  configurarItems();
  configurarRevision();
  configurarGenerador();
  configurarBiblioteca();
}

function limpiarSuscripciones() {
  estado.desuscribirExamenes?.();
  estado.desuscribirItems?.();
  estado.desuscribirContenidos?.();
  estado.desuscribirExamenes = null;
  estado.desuscribirItems = null;
  estado.desuscribirContenidos = null;
  estado.seleccionado = null;
}

// ------------------------------------------------------------------ lista

function pintarExamenes() {
  const lista = $("lista-examenes");
  lista.replaceChildren(
    ...[...estado.examenes.keys()].sort().map((codigo) => {
      const boton = el("button", {}, el("span", { clase: "codigo", texto: codigo }), el("span", { clase: "nombre", texto: estado.examenes.get(codigo)?.nombre ?? "" }));
      boton.type = "button";
      boton.setAttribute("aria-current", String(codigo === estado.seleccionado));
      boton.addEventListener("click", () => seleccionar(codigo));
      return el("li", {}, boton);
    }),
  );
}

$("boton-nuevo-examen").addEventListener("click", () => {
  estado.seleccionado = null;
  estado.items = [];
  estado.desuscribirItems?.();
  $("sin-seleccion").hidden = true;
  $("editor-examen").hidden = false;
  $("titulo-examen").textContent = "Nuevo examen";
  $("form-examen").reset();
  $("campo-codigo").disabled = false;
  pintarItems();
  pintarExamenes();
});

function seleccionar(codigo) {
  const { db, fs } = estado.n;
  estado.seleccionado = codigo;
  const datos = estado.examenes.get(codigo) ?? {};
  $("sin-seleccion").hidden = true;
  $("editor-examen").hidden = false;
  $("titulo-examen").textContent = `${codigo} — ${datos.nombre ?? ""}`;
  $("campo-codigo").value = codigo;
  $("campo-codigo").disabled = true; // el código es el id del documento, no se cambia después de creado
  $("campo-nombre").value = datos.nombre ?? "";
  $("campo-colegio").value = datos.colegio ?? "";
  $("campo-grado").value = datos.grado ?? "";
  $("campo-seccion").value = datos.seccion ?? "";
  $("campo-pin").value = datos.pin_salida ?? "";
  $("campo-clave").value = datos.clave_reingreso ?? "";
  $("campo-advertencias").value = datos.advertencias_evasion ?? "";
  pintarExamenes();

  estado.desuscribirItems?.();
  const consulta = fs.query(fs.collection(db, "examenes", codigo, "items"), fs.orderBy("orden"));
  estado.desuscribirItems = fs.onSnapshot(consulta, (foto) => {
    estado.items = foto.docs.map((d) => ({ id: d.id, ...d.data() }));
    pintarItems();
  });
}

// --------------------------------------------------------------- examen

function configurarFormularioExamen() {
  $("form-examen").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const { db, fs } = estado.n;
    const mensaje = $("mensaje-examen");
    mensaje.hidden = false;
    mensaje.textContent = "Guardando…";

    const codigo = $("campo-codigo").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(codigo)) {
      mensaje.textContent = "El código debe tener entre 3 y 20 letras/números, sin espacios.";
      return;
    }

    const datos = {
      nombre: $("campo-nombre").value.trim(),
      colegio: $("campo-colegio").value.trim(),
      grado: $("campo-grado").value.trim(),
      seccion: $("campo-seccion").value.trim(),
      modo: "autoria",
      pin_salida: $("campo-pin").value.trim() || "0000",
      clave_reingreso: $("campo-clave").value.trim() || "1111",
      advertencias_evasion: Number($("campo-advertencias").value) || 5,
      // Para la bitácora (functions/bitacora.js): quién hizo este cambio.
      // nube/firestore.rules exige que coincida con el correo de quien firma.
      actualizadoPor: estado.correo,
    };

    try {
      const existente = estado.examenes.get(codigo);
      if (existente) {
        // No se toca `docentes` desde este formulario -- eso lo maneja la
        // consola de administración (docente/index.html), para no perder a
        // quien ya esté asignado por escribir encima con un array vacío.
        await fs.updateDoc(fs.doc(db, "examenes", codigo), datos);
      } else {
        await fs.setDoc(fs.doc(db, "examenes", codigo), { ...datos, docentes: [estado.correo] });
        seleccionar(codigo);
      }
      mensaje.textContent = "Guardado.";
    } catch (error) {
      console.error("[autoria] no se pudo guardar el examen:", error);
      mensaje.textContent = "No se pudo guardar. ¿Tienes permiso sobre este código?";
    }
  });
}

// ---------------------------------------------------------------- items

/** Una fila de pregunta (orden, tipo, enunciado, puntos), reutilizada por la
 * lista normal y por el diálogo de revisión final -- mismo aspecto, distinto
 * qué pasa al hacer clic. */
function filaItem(item, indice, alHacerClic) {
  const fila = el(
    "li",
    { clase: "fila-item" },
    el("span", { clase: "orden-item", texto: String(indice + 1) }),
    el(
      "div",
      { clase: "resumen-item" },
      el("strong", { texto: TITULOS_TIPO[item.tipo] ?? item.tipo }),
      el("p", { texto: item.enunciado }),
    ),
    el("span", { clase: "tenue", texto: `${item.puntos} pts` }),
  );
  fila.addEventListener("click", alHacerClic);
  return fila;
}

function pintarItems() {
  $("sin-items").hidden = estado.items.length > 0;
  $("lista-items").replaceChildren(...estado.items.map((item, indice) => filaItem(item, indice, () => abrirDialogoItem(item))));
}

// -------------------------------------------------------- revisión final

/** Antes de dar el examen por terminado: un repaso de todas las preguntas en
 * un solo diálogo. Clic en cualquiera cierra la revisión y abre esa pregunta
 * para editarla (reutiliza abrirDialogoItem); "Sí, están bien" solo cierra. */
function configurarRevision() {
  $("boton-revisar-examen").addEventListener("click", () => {
    if (!estado.seleccionado) {
      window.alert("Primero guarda los datos del examen (código, nombre) antes de revisar las preguntas.");
      return;
    }
    pintarRevision();
    $("dialogo-revision").showModal();
  });
  $("boton-listo-revision").addEventListener("click", () => $("dialogo-revision").close());
}

function pintarRevision() {
  $("sin-items-revision").hidden = estado.items.length > 0;
  $("lista-revision").replaceChildren(
    ...estado.items.map((item, indice) =>
      filaItem(item, indice, () => {
        $("dialogo-revision").close();
        abrirDialogoItem(item);
      }),
    ),
  );
}

function configurarItems() {
  $("boton-agregar-item").addEventListener("click", () => {
    if (!estado.seleccionado) {
      window.alert("Primero guarda los datos del examen (código, nombre) antes de agregar preguntas.");
      return;
    }
    abrirDialogoItem(null);
  });

  $("item-tipo").addEventListener("change", actualizarCamposSegunTipo);

  $("boton-cancelar-item").addEventListener("click", () => $("dialogo-item").close());

  $("form-item").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    await guardarItem();
  });

  $("boton-eliminar-item").addEventListener("click", async () => {
    if (!estado.editandoItemId) return;
    if (!window.confirm("¿Eliminar esta pregunta? No se puede deshacer.")) return;
    const { db, fs } = estado.n;
    try {
      await fs.deleteDoc(fs.doc(db, "examenes", estado.seleccionado, "items", estado.editandoItemId));
      await fs.deleteDoc(fs.doc(db, "examenes", estado.seleccionado, "claves", estado.editandoItemId)).catch(() => {});
      $("dialogo-item").close();
    } catch (error) {
      console.error("[autoria] no se pudo eliminar:", error);
      $("mensaje-item").textContent = "No se pudo eliminar.";
      $("mensaje-item").hidden = false;
    }
  });
}

// --------------------------------------------------------- generar con IA

function configurarGenerador() {
  $("boton-generar").addEventListener("click", generarConIA);
}

async function generarConIA() {
  if (!estado.seleccionado) {
    window.alert("Primero guarda los datos del examen (código, nombre) antes de generar preguntas.");
    return;
  }
  const contenido = $("generador-contenido").value.trim();
  const error = $("generador-error");
  error.hidden = true;
  if (!contenido) {
    error.textContent = "Pega un contenido primero (un tema, un párrafo, un texto de lectura).";
    error.hidden = false;
    return;
  }

  const { ffn, fns } = estado.n;
  const boton = $("boton-generar");
  boton.disabled = true;
  $("generador-cargando").hidden = false;
  try {
    // "Callable": a diferencia de calificarRespuesta (que se dispara sola al
    // guardar una respuesta), esta función SÍ la invoca el docente a
    // propósito, mientras arma el examen -- ver functions/index.js.
    const llamar = ffn.httpsCallable(fns, "generarPreguntas");
    const resultado = await llamar({ contenido, cantidad: Number($("generador-cantidad").value) || 4 });
    pintarBorradores(resultado.data.preguntas ?? []);
  } catch (err) {
    console.error("[autoria] no se pudo generar preguntas:", err);
    // Antes esto se tapaba con un solo mensaje genérico sin importar la
    // causa -- un docente viendo "intenta de nuevo" no tenía forma de saber
    // que el problema real era, por ejemplo, "la IA no devolvió preguntas
    // utilizables, prueba con un contenido más corto". El SDK de Functions
    // pone en err.code el motivo exacto (ver functions/index.js, cada
    // HttpsError) y en err.message el texto que ya escribimos pensando en
    // que el docente lo lea -- mostrarlo tal cual es mejor que adivinar.
    if (err?.code === "functions/permission-denied") {
      error.textContent = "No tienes permiso para generar preguntas en este examen.";
    } else if (err?.code === "functions/invalid-argument" || err?.code === "functions/internal") {
      error.textContent = err.message || "No se pudo generar preguntas. Intenta de nuevo en un momento.";
    } else {
      error.textContent = "No se pudo generar preguntas. Intenta de nuevo en un momento.";
    }
    error.hidden = false;
  } finally {
    boton.disabled = false;
    $("generador-cargando").hidden = true;
  }
}

function pintarBorradores(preguntas) {
  $("lista-borradores").replaceChildren(
    ...preguntas.map((pregunta) => {
      const fila = el(
        "li",
        { clase: "fila-item fila-borrador" },
        el(
          "div",
          { clase: "resumen-item" },
          el("strong", { texto: TITULOS_TIPO[pregunta.tipo] ?? pregunta.tipo }),
          el("p", { texto: pregunta.enunciado }),
        ),
      );
      const boton = el("button", { clase: "boton boton-secundario", texto: "Revisar y agregar" });
      boton.type = "button";
      boton.addEventListener("click", () => abrirDialogoItem(null, pregunta));
      fila.append(boton);
      return fila;
    }),
  );
}

function actualizarCamposSegunTipo() {
  const tipo = $("item-tipo").value;
  $("campo-opciones").hidden = tipo !== "seleccion_simple" && tipo !== "seleccion_multiple";
  $("campo-rubrica").hidden = tipo !== "interpretacion" && tipo !== "respuesta_completa";
}

/**
 * Abre el diálogo de pregunta. `item` es una pregunta YA guardada (se edita);
 * `borrador` es una sugerencia de la IA que todavía no existe en Firestore
 * (se trata como "nueva", el docente la revisa/edita antes de guardarla por
 * primera vez). Nunca se pasan los dos juntos.
 */
async function abrirDialogoItem(item, borrador) {
  $("form-item").reset();
  $("mensaje-item").hidden = true;
  $("sugerencia-medio-ia").hidden = true;
  estado.editandoItemId = item?.id ?? null;
  $("titulo-dialogo-item").textContent = item ? "Editar pregunta" : borrador ? "Revisar sugerencia de la IA" : "Nueva pregunta";
  $("boton-eliminar-item").hidden = !item;

  if (item) {
    $("item-tipo").value = item.tipo;
    $("item-enunciado").value = item.enunciado ?? "";
    $("item-medio-tipo").value = item.medio?.tipo ?? "";
    $("item-medio-url").value = item.medio?.url ?? "";
    $("item-opciones").value = (item.opciones ?? []).join("\n");
    $("item-puntos").value = item.puntos ?? 10;

    // La clave (respuesta correcta/rúbrica) vive aparte -- se pide solo al
    // abrir el editor, nunca viaja con la lista de preguntas (ver
    // nube/firestore.rules: items vs. claves).
    const { db, fs } = estado.n;
    try {
      const clave = (await fs.getDoc(fs.doc(db, "examenes", estado.seleccionado, "claves", item.id))).data();
      $("item-correctas").value = Array.isArray(clave?.respuestaCorrecta)
        ? clave.respuestaCorrecta.join("\n")
        : (clave?.respuestaCorrecta ?? "");
      $("item-rubrica").value = clave?.rubrica ?? "";
    } catch (error) {
      console.error("[autoria] no se pudo leer la clave:", error);
    }
  } else if (borrador) {
    $("item-tipo").value = borrador.tipo;
    $("item-enunciado").value = borrador.enunciado ?? "";
    $("item-opciones").value = (borrador.opciones ?? []).join("\n");
    $("item-correctas").value = Array.isArray(borrador.respuestaCorrecta)
      ? borrador.respuestaCorrecta.join("\n")
      : (borrador.respuestaCorrecta ?? "");
    $("item-rubrica").value = borrador.rubrica ?? "";
    $("item-puntos").value = borrador.puntos ?? 10;
    if (borrador.sugerenciaMedio) {
      $("sugerencia-medio-ia").textContent = `Sugerencia de la IA de apoyo visual: ${borrador.sugerenciaMedio}`;
      $("sugerencia-medio-ia").hidden = false;
    }
  } else {
    $("item-puntos").value = 10;
  }
  actualizarCamposSegunTipo();
  $("dialogo-item").showModal();
}

async function guardarItem() {
  const { db, fs } = estado.n;
  const mensaje = $("mensaje-item");
  const tipo = $("item-tipo").value;
  const enunciado = $("item-enunciado").value.trim();
  const puntos = Number($("item-puntos").value);

  if (!enunciado) {
    mensaje.textContent = "Escribe el enunciado.";
    mensaje.hidden = false;
    return;
  }

  const medioUrl = $("item-medio-url").value.trim();
  const medioTipo = $("item-medio-tipo").value;
  const medio = medioTipo && medioUrl ? { tipo: medioTipo, url: medioUrl } : null;

  const esSeleccion = tipo === "seleccion_simple" || tipo === "seleccion_multiple";
  const opciones = esSeleccion
    ? $("item-opciones").value.split("\n").map((linea) => linea.trim()).filter(Boolean)
    : null;

  const itemId = estado.editandoItemId ?? crypto.randomUUID();
  const orden = estado.editandoItemId
    ? estado.items.find((i) => i.id === itemId)?.orden ?? estado.items.length
    : estado.items.length;

  const datosItem = { orden, tipo, enunciado, puntos, actualizadoPor: estado.correo };
  if (medio) datosItem.medio = medio;
  if (opciones) datosItem.opciones = opciones;

  try {
    await fs.setDoc(fs.doc(db, "examenes", estado.seleccionado, "items", itemId), datosItem);

    if (esSeleccion) {
      const correctas = $("item-correctas").value.split("\n").map((linea) => linea.trim()).filter(Boolean);
      const respuestaCorrecta = tipo === "seleccion_simple" ? (correctas[0] ?? "") : correctas;
      await fs.setDoc(fs.doc(db, "examenes", estado.seleccionado, "claves", itemId), { respuestaCorrecta });
    } else if (tipo === "interpretacion" || tipo === "respuesta_completa") {
      const rubrica = $("item-rubrica").value.trim();
      await fs.setDoc(fs.doc(db, "examenes", estado.seleccionado, "claves", itemId), { rubrica });
    }
    // pizarra: no hace falta ninguna clave, se revisa a mano.

    $("dialogo-item").close();
  } catch (error) {
    console.error("[autoria] no se pudo guardar la pregunta:", error);
    mensaje.textContent = "No se pudo guardar.";
    mensaje.hidden = false;
  }
}

// -------------------------------------------------------- biblioteca de contenidos

function pintarSelectorContenidos() {
  const select = $("selector-contenido");
  const seleccionActual = select.value;
  select.replaceChildren(el("option", { texto: "-- elegir --" }));
  for (const [id, c] of [...estado.contenidos.entries()].sort((a, b) =>
    `${a[1].materia} ${a[1].grado} ${a[1].tema}`.localeCompare(`${b[1].materia} ${b[1].grado} ${b[1].tema}`),
  )) {
    const opcion = el("option", { texto: `${c.materia} — ${c.grado} — ${c.tema}` });
    opcion.value = id;
    select.append(opcion);
  }
  // Conserva la selección si el elemento sigue existiendo tras el refresco.
  if ([...select.options].some((o) => o.value === seleccionActual)) select.value = seleccionActual;
}

function configurarBiblioteca() {
  $("boton-guardar-contenido").addEventListener("click", guardarContenido);
  $("boton-importar-link").addEventListener("click", importarLink);
  $("contenido-archivo").addEventListener("change", importarArchivo);
  $("boton-usar-contenido").addEventListener("click", () => {
    const id = $("selector-contenido").value;
    const contenido = estado.contenidos.get(id);
    if (!contenido) {
      window.alert("Elige un contenido guardado de la lista primero.");
      return;
    }
    $("generador-contenido").value = contenido.texto;
    $("generador-contenido").scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

// Mismo CDN y versión que ya se usó y verificó con curl en esta sesión --
// esta build de pdf.js 4.0.379 se publica como .mjs (módulo ES), no .js.
const PDF_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";
let pdfjsLibPromesa = null;

function cargarPdfJs() {
  // Se carga una sola vez y se reutiliza -- la mayoría de docentes no sube
  // más de un PDF por sesión, pero si suben varios no hace falta repetir la
  // descarga del propio pdf.js.
  if (!pdfjsLibPromesa) {
    pdfjsLibPromesa = import(PDF_JS_URL).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      return lib;
    });
  }
  return pdfjsLibPromesa;
}

async function leerPdf(archivo) {
  const pdfjsLib = await cargarPdfJs();
  const datos = await archivo.arrayBuffer();
  const documento = await pdfjsLib.getDocument({ data: datos }).promise;
  const paginas = [];
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n);
    const contenido = await pagina.getTextContent();
    paginas.push(contenido.items.map((item) => item.str).join(" "));
  }
  return paginas.join("\n").slice(0, 20000);
}

async function importarArchivo() {
  const campo = $("contenido-archivo");
  const archivo = campo.files?.[0];
  if (!archivo) return;

  const error = $("contenido-importar-error");
  error.hidden = true;
  $("contenido-importando").hidden = false;
  try {
    let texto;
    if (archivo.type === "application/pdf" || archivo.name.toLowerCase().endsWith(".pdf")) {
      texto = await leerPdf(archivo);
    } else {
      // .txt u otro texto plano: lo que no sea PDF se trata como texto, sin
      // intentar adivinar Word/otros formatos binarios -- ver README.md.
      texto = (await archivo.text()).slice(0, 20000);
    }
    if (!texto.trim()) {
      error.textContent = "No se encontró texto legible en ese archivo.";
      error.hidden = false;
      return;
    }
    $("contenido-texto").value = texto;
  } catch (err) {
    console.error("[autoria] no se pudo leer el archivo:", err);
    error.textContent = "No se pudo leer ese archivo. Prueba con un .txt o un .pdf con texto (no solo imágenes escaneadas).";
    error.hidden = false;
  } finally {
    $("contenido-importando").hidden = true;
    campo.value = "";
  }
}

async function importarLink() {
  const url = $("contenido-url").value.trim();
  const error = $("contenido-importar-error");
  error.hidden = true;
  if (!url) {
    error.textContent = "Pega un link primero.";
    error.hidden = false;
    return;
  }

  const { ffn, fns } = estado.n;
  const boton = $("boton-importar-link");
  boton.disabled = true;
  $("contenido-importando").hidden = false;
  try {
    const llamar = ffn.httpsCallable(fns, "extraerContenidoWeb");
    const resultado = await llamar({ url });
    $("contenido-texto").value = resultado.data.texto ?? "";
    $("contenido-url").value = "";
  } catch (err) {
    console.error("[autoria] no se pudo importar el link:", err);
    // Mismo criterio que generarConIA: el servidor ya manda un mensaje
    // pensado para el docente (URL inválida, página con error, sin texto
    // legible...) -- mostrarlo tal cual en vez de uno genérico fijo.
    error.textContent =
      err?.code === "functions/invalid-argument" || err?.code === "functions/internal"
        ? err.message || "No se pudo importar ese link."
        : "No se pudo importar ese link. Revisa que sea correcto y vuelve a intentar.";
    error.hidden = false;
  } finally {
    boton.disabled = false;
    $("contenido-importando").hidden = true;
  }
}

async function guardarContenido() {
  const { db, fs } = estado.n;
  const error = $("contenido-error");
  error.hidden = true;

  const materia = $("contenido-materia").value.trim();
  const grado = $("contenido-grado").value.trim();
  const tema = $("contenido-tema").value.trim();
  const texto = $("contenido-texto").value.trim();
  if (!materia || !grado || !tema || !texto) {
    error.textContent = "Completa materia, grado, tema y el contenido antes de guardar.";
    error.hidden = false;
    return;
  }
  if (texto.length > 20000) {
    error.textContent = `El contenido es muy largo (${texto.length} caracteres, máximo 20,000). Pártelo en más de un tema.`;
    error.hidden = false;
    return;
  }

  $("contenido-guardando").hidden = false;
  try {
    await fs.setDoc(fs.doc(db, "contenidos", crypto.randomUUID()), {
      materia,
      grado,
      tema,
      texto,
      creadoPor: estado.correo,
      ts: fs.serverTimestamp(),
    });
    $("contenido-materia").value = "";
    $("contenido-grado").value = "";
    $("contenido-tema").value = "";
    $("contenido-texto").value = "";
  } catch (err) {
    console.error("[autoria] no se pudo guardar el contenido:", err);
    error.textContent = "No se pudo guardar el contenido.";
    error.hidden = false;
  } finally {
    $("contenido-guardando").hidden = true;
  }
}

arrancar();
