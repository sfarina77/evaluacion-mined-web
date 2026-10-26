/**
 * Port de apps/detector/proctor_detector.py::analizar_frame a getUserMedia +
 * ONNX Runtime Web. Mismo espejo que deteccion/ProctorDetector.kt en Android.
 *
 * Los modelos son los mismos .pt del detector Windows exportados a ONNX con
 * NMS embebido (herramientas/exportar_modelos_onnx.py). Formas verificadas el
 * 26/10/2026 contra ultralytics 8.4.190, incluida la posición de los
 * keypoints sobre una imagen real: entrada `images` [1,3,640,640] (RGB, 0..1,
 * NCHW); salida [1,300,6] detección y [1,300,57] pose, en píxeles de 640.
 *
 * Requiere que `ort` (ONNX Runtime Web) esté cargado como variable global --
 * ver el <script> de index.html. No se importa como módulo npm a propósito:
 * esta PWA no tiene paso de build, así que lo carga desde CDN como script
 * clásico, igual que se haría en cualquier página sin bundler.
 */

const IMG_SZ = 640;
const CONF_YOLO = 0.35;
const FACE_KP_CONF = 0.65;
const SHO_KP_CONF = 0.5;
const YAW_RATIO_MIN = 0.3;
const YAW_RATIO_MAX = 0.7;

const COCO_PERSON = 0;
const OBJETOS_PROHIBIDOS = { 67: "celular", 73: "libro" };

// Keypoints COCO-pose: 0 nariz, 1 ojo_izq, 2 ojo_der, 3 oreja_izq, 4 oreja_der,
// 5 hombro_izq, 6 hombro_der (idéntico a proctor_detector.py).
const KP_NOSE = 0;
const KP_LEYE = 1;
const KP_REYE = 2;
const KP_LSHO = 5;
const KP_RSHO = 6;

const RUTA_MODELO_DETECCION = "public/modelos/yolov8n.onnx";
const RUTA_MODELO_POSE = "public/modelos/yolov8n-pose.onnx";

/** Crea el detector: carga ambos modelos (async) y devuelve { iniciar, detener }. */
export async function crearDetector({ onFrame, analisisPorSegundo = 2 }) {
  const video = document.getElementById("video-camara");
  const lienzo = document.getElementById("lienzo-camara");
  lienzo.width = IMG_SZ;
  lienzo.height = IMG_SZ;
  const contexto = lienzo.getContext("2d", { willReadFrequently: true });

  const opciones = { executionProviders: ["wasm"] };
  const modeloDeteccion = await ort.InferenceSession.create(RUTA_MODELO_DETECCION, opciones);
  const modeloPose = await ort.InferenceSession.create(RUTA_MODELO_POSE, opciones);

  let stream = null;
  let intervalo = null;
  // Una sesión de ONNX Runtime no admite dos `run` a la vez: si un análisis
  // tarda más que el periodo (equipo lento), se salta ese tick.
  let analizando = false;

  async function iniciar() {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    const periodoMs = 1000 / analisisPorSegundo;
    intervalo = setInterval(() => analizarUnFrame().catch(() => {}), periodoMs);
  }

  function detener() {
    if (intervalo) clearInterval(intervalo);
    stream?.getTracks().forEach((track) => track.stop());
    modeloDeteccion.release();
    modeloPose.release();
  }

  async function analizarUnFrame() {
    if (analizando) return;
    analizando = true;
    try {
      contexto.drawImage(video, 0, 0, IMG_SZ, IMG_SZ);
      const pixeles = contexto.getImageData(0, 0, IMG_SZ, IMG_SZ).data;
      const tipos = await analizarFrame(pixeles, modeloDeteccion, modeloPose);
      onFrame(tipos);
    } finally {
      analizando = false;
    }
  }

  return { iniciar, detener };
}

async function analizarFrame(pixeles, modeloDeteccion, modeloPose) {
  const tipos = new Set();

  const entrada = aTensorEntrada(pixeles);

  const detecciones = await correrDeteccion(modeloDeteccion, entrada);
  const nPersonas = detecciones.filter((d) => d.clase === COCO_PERSON).length;
  for (const d of detecciones) {
    if (OBJETOS_PROHIBIDOS[d.clase]) tipos.add("dispositivo_adicional");
  }
  if (nPersonas === 0) tipos.add("candidato_ausente");

  if (nPersonas >= 1) {
    const personas = await correrPose(modeloPose, entrada);
    evaluarPose(personas, tipos);
  }

  entrada.dispose();
  return tipos;
}

/** RGBA del canvas (HWC, 0..255) -> tensor RGB NCHW 0..1, lo que espera el
 * export ONNX de ultralytics. */
function aTensorEntrada(pixeles) {
  const area = IMG_SZ * IMG_SZ;
  const datos = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    datos[i] = pixeles[i * 4] / 255;
    datos[area + i] = pixeles[i * 4 + 1] / 255;
    datos[2 * area + i] = pixeles[i * 4 + 2] / 255;
  }
  return new ort.Tensor("float32", datos, [1, 3, IMG_SZ, IMG_SZ]);
}

/** Corre el modelo y devuelve las filas de su única salida [1, N, columnas]. */
async function filasDeSalida(modelo, entrada) {
  const resultados = await modelo.run({ [modelo.inputNames[0]]: entrada });
  const salida = resultados[modelo.outputNames[0]];
  const [, n, columnas] = salida.dims;
  const filas = [];
  for (let i = 0; i < n; i++) filas.push(salida.data.subarray(i * columnas, (i + 1) * columnas));
  return filas;
}

function evaluarPose(personas, tipos) {
  if (personas.length === 0) return;

  // Candidato principal: la caja de mayor área.
  const principal = personas.reduce((a, b) => (areaDe(a.caja) >= areaDe(b.caja) ? a : b));

  // Cuántas personas MUESTRAN LA CARA (nariz + al menos un ojo) -- situación 2.
  let nRostros = 0;
  for (const persona of personas) {
    const nariz = persona.keypoints[KP_NOSE][2] >= FACE_KP_CONF;
    const ojos =
      persona.keypoints[KP_LEYE][2] >= FACE_KP_CONF || persona.keypoints[KP_REYE][2] >= FACE_KP_CONF;
    if (nariz && ojos) nRostros++;
  }
  if (nRostros > 1) tipos.add("persona_adicional");

  const visible = (kp, umbral = FACE_KP_CONF) => principal.keypoints[kp][2] >= umbral;

  // Rostro "al 100%": nariz + AMBOS ojos con confianza alta.
  const narizOk = visible(KP_NOSE);
  const ojoIOk = visible(KP_LEYE);
  const ojoDOk = visible(KP_REYE);
  const hayRostro = narizOk && ojoIOk && ojoDOk;

  // Encuadre "de los hombros hacia arriba": al menos un hombro visible.
  const hombrosOk = visible(KP_LSHO, SHO_KP_CONF) || visible(KP_RSHO, SHO_KP_CONF);
  if (!hombrosOk) tipos.add("encuadre_incorrecto");

  if (!hayRostro) {
    if (narizOk && (ojoIOk || ojoDOk)) {
      tipos.add("distraccion_facial"); // giro fuerte de cabeza, no rostro tapado
    } else {
      tipos.add("rostro_no_visible");
    }
  } else {
    const lx = principal.keypoints[KP_LEYE][0];
    const rx = principal.keypoints[KP_REYE][0];
    const nx = principal.keypoints[KP_NOSE][0];
    const ancho = rx - lx;
    if (Math.abs(ancho) > 1e-3) {
      const ratio = (nx - lx) / ancho;
      if (ratio < YAW_RATIO_MIN || ratio > YAW_RATIO_MAX) tipos.add("distraccion_facial");
    }
  }
}

function areaDe(caja) {
  return Math.max(0, caja[2] - caja[0]) * Math.max(0, caja[3] - caja[1]);
}

/** Salida [1, N, 6] = (x1,y1,x2,y2,conf,cls), con NMS ya aplicado por el
 * export (herramientas/exportar_modelos_onnx.py). Es el único lugar que
 * conoce esta forma. */
async function correrDeteccion(modelo, entrada) {
  const resultado = [];
  for (const fila of await filasDeSalida(modelo, entrada)) {
    const conf = fila[4] ?? 0;
    if (conf < CONF_YOLO) continue;
    resultado.push({ caja: Array.from(fila.slice(0, 4)), conf, clase: Math.round(fila[5] ?? -1) });
  }
  return resultado;
}

/** Salida [1, N, 6 + 17*3] = box(4) + conf(1) + cls(1) + 17 keypoints *
 * (x,y,conf). Mismo layout que el port Android. */
async function correrPose(modelo, entrada) {
  const resultado = [];
  for (const fila of await filasDeSalida(modelo, entrada)) {
    const conf = fila[4] ?? 0;
    if (conf < CONF_YOLO) continue;
    const caja = Array.from(fila.slice(0, 4));
    const keypoints = [];
    for (let i = 0; i < 17; i++) {
      const base = 6 + i * 3;
      keypoints.push([fila[base] ?? 0, fila[base + 1] ?? 0, fila[base + 2] ?? 0]);
    }
    resultado.push({ caja, keypoints });
  }
  return resultado;
}
