import { nube } from "../nube/nube.js";
import { urlEmbebibleDeVideo, esEmbedDePlataforma, urlVisorDocumento } from "./medios.js";
import { colorDeMateria } from "../colorMateria.js";
import { crearBotonCalculadora } from "./calculadoras.js";
import { crearIlustracionSvg } from "./ilustraciones.js";

/**
 * Reproductor de un examen "de autoría" (modo == "autoria"): reemplaza el
 * `<iframe src="...">` de un examen externo por preguntas renderizadas
 * nativamente, una a la vez, dentro de la misma página -- sigue bajo la
 * misma pantalla completa y la misma detección de evasión de
 * examenControlador.js, no es una ventana ni una pestaña aparte.
 *
 * El estudiante SOLO manda su respuesta cruda a Firestore
 * (sesiones/{sesionId}/respuestas/{itemId}); nunca calcula ni manda su propia
 * calificación -- eso lo hace functions/index.js (Cloud Function, Admin SDK),
 * que es quien puede leer la clave real sin exponérsela al navegador. Ver
 * nube/firestore.rules para el porqué de esa separación.
 */
export function crearReproductor({ contenedor, examenId, nie, sesionId, onTerminado }) {
  let items = []; // la secuencia ACTIVA (lo que el estudiante rinde), no todo el banco
  let reserva = []; // preguntas de más (si las hay) para reemplazar una tras una evasión
  let indice = 0;
  let n = null;
  const t0 = Date.now() / 1000;

  async function iniciar() {
    n = await nube();
    const { db, fs } = n;
    const [foto, examen] = await Promise.all([
      fs.getDocs(fs.query(fs.collection(db, "examenes", examenId, "items"), fs.orderBy("orden"))),
      fs.getDoc(fs.doc(db, "examenes", examenId)),
    ]);
    const todas = foto.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Banco de repuesto (2026-11-04, pedido explícito): si el docente cargó
    // más preguntas que las requeridas, las que sobran NO se muestran de
    // entrada -- quedan en reserva para cuando el estudiante salga del
    // examen a mitad de una pregunta (ver notificarEvasion). Sin
    // preguntas_requeridas (o con el mismo total de preguntas que hay), no
    // hay reserva y esto se comporta exactamente igual que antes.
    const requeridas = examen.data()?.preguntas_requeridas;
    const corte = Number.isFinite(requeridas) && requeridas > 0 ? Math.min(requeridas, todas.length) : todas.length;
    items = todas.slice(0, corte);
    reserva = todas.slice(corte);
    // Texto grande (2026-11-03, exámenes de lectura de primero/segundo
    // grado): una sola clase en el contenedor, el resto lo resuelve
    // estilos.css (.reproductor-grande ...).
    contenedor.classList.toggle("reproductor-grande", examen.data()?.tamano_texto === "grande");
    contenedor.hidden = false;
    if (!items.length) {
      contenedor.replaceChildren(el("p", { clase: "tenue", texto: "Este examen todavía no tiene preguntas." }));
      return;
    }
    render();
  }

  /**
   * Llamado desde examenControlador.js cada vez que se registra una salida
   * del examen (cambio de pestaña, fuera de pantalla completa, etc.) --
   * pedido explícito (2026-11-04): con varias advertencias disponibles, un
   * estudiante podía salir a buscar la respuesta de LA PREGUNTA QUE TENÍA
   * ABIERTA y volver a escribirla. Si todavía no la contestó y queda algo en
   * la reserva, esa pregunta se cambia por otra -- lo que haya ido a buscar
   * ya no sirve. Sin reserva (el docente no cargó preguntas de más), no hay
   * nada que cambiar y esto no hace nada.
   */
  function notificarEvasion() {
    if (indice >= items.length || !reserva.length) return;
    items[indice] = reserva.shift();
    render();
  }

  function el(etiqueta, { clase, texto } = {}, ...hijos) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    nodo.append(...hijos);
    return nodo;
  }

  function render() {
    const item = items[indice];
    const cuerpo = el("div", { clase: "reproductor-pregunta" });
    cuerpo.append(el("p", { clase: "reproductor-progreso", texto: `Pregunta ${indice + 1} de ${items.length}` }));
    // Barra de progreso visual (2026-11-04, pedido explícito de "algo más
    // didáctico") -- un vistazo rápido en vez de solo leer el número.
    const relleno = el("div", { clase: "reproductor-progreso-relleno" });
    relleno.style.width = `${Math.round(((indice + 1) / items.length) * 100)}%`;
    cuerpo.append(el("div", { clase: "reproductor-progreso-barra" }, relleno));
    const color = colorDeMateria(item.materia);
    if (color) {
      const insignia = el("span", { clase: "badge-materia", texto: item.materia });
      insignia.style.background = color;
      cuerpo.append(insignia);
    }
    cuerpo.append(el("h2", { texto: item.enunciado }));
    if (item.medio) cuerpo.append(renderMedio(item.medio));
    if (item.ilustracion) cuerpo.append(crearIlustracionSvg(item.ilustracion));
    if (item.herramienta) cuerpo.append(crearBotonCalculadora(item.herramienta));

    const campoRespuesta = el("div", { clase: "reproductor-respuesta" });
    const obtenerValor = renderCampoSegunTipo(item, campoRespuesta);
    cuerpo.append(campoRespuesta);

    const botonSiguiente = el("button", {
      clase: "boton boton-primario reproductor-boton-siguiente",
      texto: indice === items.length - 1 ? "Terminar" : "Siguiente",
    });
    botonSiguiente.type = "button";
    const mensajeError = el("p", { clase: "mensaje-error", texto: "" });
    mensajeError.hidden = true;
    botonSiguiente.addEventListener("click", async () => {
      const valor = await obtenerValor();
      if (valor === undefined) {
        mensajeError.textContent = "Responde la pregunta antes de continuar.";
        mensajeError.hidden = false;
        return;
      }
      botonSiguiente.disabled = true;
      try {
        await enviarRespuesta(item, valor);
      } catch (error) {
        console.error("[reproductor] no se pudo enviar la respuesta:", error);
        // No se bloquea el examen por un corte de red puntual: la respuesta
        // se pierde para esta pregunta, pero el estudiante sigue -- mismo
        // criterio que el resto del proctoring, que nunca frena el examen
        // por un fallo de red (ver docs/motor_alertas_spec.md, situación 7).
      }
      indice += 1;
      if (indice < items.length) render();
      else terminar();
      botonSiguiente.disabled = false;
    });

    cuerpo.append(mensajeError, botonSiguiente);
    contenedor.replaceChildren(cuerpo);
  }

  function renderMedio(medio) {
    if (medio.tipo === "imagen") {
      const img = el("img");
      img.src = medio.url;
      img.alt = "";
      img.className = "reproductor-medio-imagen";
      return img;
    }
    if (medio.tipo === "video") {
      const embebible = urlEmbebibleDeVideo(medio.url);
      if (!embebible) return el("p", { clase: "mensaje-error", texto: "El link del video no es válido." });
      if (esEmbedDePlataforma(embebible)) {
        const marco = el("iframe");
        marco.src = embebible;
        marco.className = "reproductor-medio-video";
        marco.allow = "fullscreen";
        return marco;
      }
      const video = el("video");
      video.src = embebible;
      video.controls = true;
      video.className = "reproductor-medio-video";
      return video;
    }
    if (medio.tipo === "audio") {
      const audio = el("audio");
      audio.src = medio.url;
      audio.controls = true;
      audio.className = "reproductor-medio-audio";
      return audio;
    }
    if (medio.tipo === "documento") {
      // PDF directo o Word envuelto en el visor de Google Docs, ver
      // medios.js::urlVisorDocumento. Sigue siendo un <iframe> DENTRO de la
      // misma página, nunca una pestaña nueva -- mismo motivo que el video,
      // ver el comentario del archivo.
      const marco = el("iframe");
      marco.src = urlVisorDocumento(medio.url);
      marco.className = "reproductor-medio-documento";
      return marco;
    }
    // "link": por ahora no se incrusta (destino desconocido, podría negarse a
    // mostrarse en un iframe) -- se avisa en vez de fingir que se puede ver.
    return el("p", { clase: "tenue", texto: `Material de referencia: ${medio.url}` });
  }

  /** Dibuja el campo de respuesta según el tipo y devuelve una función que,
   * al llamarla, entrega el valor actual (o `undefined` si falta responder).
   * Async porque "pizarra" necesita convertir el lienzo a imagen. */
  function renderCampoSegunTipo(item, contenedorCampo) {
    if (item.tipo === "seleccion_simple") {
      const nombre = `opcion-${item.id}`;
      for (const opcion of item.opciones ?? []) {
        contenedorCampo.append(crearOpcion("radio", nombre, opcion));
      }
      return () => {
        const marcada = contenedorCampo.querySelector("input:checked");
        return marcada ? marcada.value : undefined;
      };
    }

    if (item.tipo === "seleccion_multiple") {
      for (const opcion of item.opciones ?? []) {
        contenedorCampo.append(crearOpcion("checkbox", `opcion-${item.id}`, opcion));
      }
      return () => {
        const marcadas = [...contenedorCampo.querySelectorAll("input:checked")].map((i) => i.value);
        return marcadas.length ? marcadas : undefined;
      };
    }

    if (item.tipo === "interpretacion" || item.tipo === "respuesta_completa") {
      const area = el("textarea");
      area.rows = item.tipo === "respuesta_completa" ? 10 : 3;
      area.className = "reproductor-texto";
      contenedorCampo.append(area);
      return () => (area.value.trim() ? area.value.trim() : undefined);
    }

    if (item.tipo === "pizarra") {
      return renderPizarra(contenedorCampo);
    }

    if (item.tipo === "problema_ilustrado") {
      const campo = el("input");
      campo.type = "number";
      campo.inputMode = "numeric";
      campo.className = "reproductor-numero";
      campo.placeholder = "Escribe el número";
      contenedorCampo.append(campo);
      return () => (campo.value.trim() ? campo.value.trim() : undefined);
    }

    contenedorCampo.append(el("p", { clase: "mensaje-error", texto: `Tipo de pregunta desconocido: ${item.tipo}` }));
    return () => undefined;
  }

  function crearOpcion(tipoInput, nombre, texto) {
    const etiqueta = el("label", { clase: "reproductor-opcion" });
    const input = el("input");
    input.type = tipoInput;
    input.name = nombre;
    input.value = texto;
    etiqueta.append(input, el("span", { texto }));
    return etiqueta;
  }

  /** Lienzo de dibujo/escritura a mano -- mismo patrón de evidencia que ya usa
   * el proctoring (foto chica en JPEG, base64, ver reporteEnVivo.js::foto):
   * se envía como imagen, no se intenta reconocer la letra todavía (fase 2 no
   * incluye OCR, la revisión de esto es manual). */
  function renderPizarra(contenedorCampo) {
    const lienzo = el("canvas");
    lienzo.width = 480;
    lienzo.height = 320;
    lienzo.className = "reproductor-pizarra";
    const contexto = lienzo.getContext("2d");
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, lienzo.width, lienzo.height);
    contexto.strokeStyle = "#111827";
    contexto.lineWidth = 2.5;
    contexto.lineCap = "round";

    let dibujando = false;
    const posicion = (evento) => {
      const rect = lienzo.getBoundingClientRect();
      return { x: (evento.clientX - rect.left) * (lienzo.width / rect.width), y: (evento.clientY - rect.top) * (lienzo.height / rect.height) };
    };
    lienzo.addEventListener("pointerdown", (evento) => {
      dibujando = true;
      const { x, y } = posicion(evento);
      contexto.beginPath();
      contexto.moveTo(x, y);
    });
    lienzo.addEventListener("pointermove", (evento) => {
      if (!dibujando) return;
      const { x, y } = posicion(evento);
      contexto.lineTo(x, y);
      contexto.stroke();
    });
    const soltar = () => {
      dibujando = false;
    };
    lienzo.addEventListener("pointerup", soltar);
    lienzo.addEventListener("pointerleave", soltar);

    const botonLimpiar = el("button", { clase: "boton boton-secundario", texto: "Borrar y empezar de nuevo" });
    botonLimpiar.type = "button";
    botonLimpiar.addEventListener("click", () => {
      contexto.fillStyle = "#ffffff";
      contexto.fillRect(0, 0, lienzo.width, lienzo.height);
    });

    contenedorCampo.append(lienzo, botonLimpiar);
    // Calidad baja a propósito: un trazo en blanco y negro no necesita mucho
    // peso, y nube/firestore.rules exige foto < 150 KB (mismo límite que las
    // fotos de evidencia de la cámara).
    return () => lienzo.toDataURL("image/jpeg", 0.7);
  }

  async function enviarRespuesta(item, valor) {
    const { db, fs, auth } = n;
    const esFoto = item.tipo === "pizarra";
    await fs.setDoc(fs.doc(db, "sesiones", sesionId, "respuestas", item.id), {
      tipo: item.tipo,
      respuesta: esFoto ? null : valor,
      foto: esFoto ? valor : null,
      t: Date.now() / 1000 - t0,
      ts: fs.serverTimestamp(),
      examenId,
      nie,
      uid: auth.currentUser.uid,
    });
  }

  function terminar() {
    // Antes esto solo decía "puedes cerrar esta ventana" y no hacía nada
    // más -- mientras el estudiante no cerraba la pestaña a mano, la
    // supervisión (cámara, pantalla completa, foco) seguía corriendo de
    // fondo y podía marcarle una evasión por algo que hizo DESPUÉS de
    // terminar (2026-11-04, reportado directamente). El botón llama a
    // onTerminado (examenControlador.js::terminarExamen), que sí apaga la
    // cámara, sale de pantalla completa y cierra la sesión como "terminado".
    const botonFinalizar = el("button", { clase: "boton boton-primario reproductor-boton-siguiente", texto: "Finalizar examen ✓" });
    botonFinalizar.type = "button";
    botonFinalizar.addEventListener("click", () => onTerminado?.());
    contenedor.replaceChildren(
      el(
        "div",
        { clase: "reproductor-fin" },
        el("h2", { texto: "Terminaste el examen" }),
        el("p", { clase: "tenue", texto: "Toca el botón para entregarlo y apagar la supervisión." }),
        botonFinalizar,
      ),
    );
  }

  return { iniciar, notificarEvasion };
}
