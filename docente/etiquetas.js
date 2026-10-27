/**
 * Cómo se le muestra al docente lo que escribe src/sesion/reporteEnVivo.js.
 * Funciones puras (test/etiquetas.test.js).
 */

/** Situaciones del motor (src/motor/motorAlertas.js) en palabras del docente. */
export const SITUACIONES = {
  fuera_de_encuadre: "Fuera de la cámara más de 10 s",
  segunda_persona: "Otra persona frente a la cámara",
  mirada_fuera: "Miró fuera de la pantalla varias veces seguidas",
  objeto_no_permitido: "Celular o libro a la vista",
  ausencia_prolongada: "Ausente más de 60 s",
  corte_abrupto: "Corte abrupto (cerró el equipo o se cortó la señal)",
  evasion_kiosco: "Volvió a salir después de las advertencias",
};

/** tipo de evento -> [título, clase de color] */
const EVENTOS = {
  inicio: ["Comenzó el examen", "neutro"],
  alerta: ["Alerta", "grave"],
  advertencia: ["Salió del examen", "aviso"],
  aviso: ["Se le avisó de sus alertas", "aviso"],
  bloqueo_ausencia: ["Bloqueado por ausencia", "aviso"],
  reactivado: ["Volvió frente a la cámara", "ok"],
  bloqueo_evasion: ["Bloqueado: necesita la clave del docente", "grave"],
  reingreso: ["Reactivado con la clave del docente", "ok"],
  fin: ["Fin", "neutro"],
};

export function describirEvento({ tipo, detalle }) {
  const [titulo, clase] = EVENTOS[tipo] ?? [tipo, "neutro"];
  if (tipo === "alerta") return { titulo: SITUACIONES[detalle] ?? detalle, detalle: "", clase };
  return { titulo, detalle: detalle ?? "", clase };
}

export const SIN_CONTACTO_MS = 3 * 60_000;

/** Estado que ve el docente, según el documento de la sesión y la hora. */
export function estadoVisible(sesion, ahoraMs) {
  const { estado } = sesion;
  if (estado === "terminado") return { texto: "Terminó", clase: "neutro", grupo: "terminado" };
  if (estado === "anulado") return { texto: "Anulado", clase: "grave", grupo: "anulado" };
  const latidoMs = sesion.ultimoLatido?.toMillis?.() ?? null;
  if (latidoMs !== null && ahoraMs - latidoMs > SIN_CONTACTO_MS) {
    return { texto: "Sin conexión", clase: "neutro", grupo: "sin_conexion" };
  }
  if (estado === "bloqueado_evasion") {
    return { texto: "Bloqueado: necesita tu clave", clase: "grave", grupo: "necesita_clave" };
  }
  if (estado === "bloqueado_ausencia") return { texto: "Ausente", clase: "aviso", grupo: "en_curso" };
  if (estado === "advertencia") return { texto: "Fuera del examen", clase: "aviso", grupo: "en_curso" };
  return { texto: "En curso", clase: "ok", grupo: "en_curso" };
}

/** "hace 40 s", "hace 5 min", "hace 2 h" */
export function haceCuanto(ms, ahoraMs) {
  const seg = Math.max(0, Math.round((ahoraMs - ms) / 1000));
  if (seg < 60) return `hace ${seg} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.round(min / 60)} h`;
}

/** Correos de un textarea: uno por línea (o separados por coma), en
 * minúsculas, sin repetidos; los inválidos se devuelven aparte. */
export function leerCorreos(texto) {
  const validos = [];
  const invalidos = [];
  for (const crudo of texto.split(/[\s,;]+/)) {
    const correo = crudo.trim().toLowerCase();
    if (!correo) continue;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) invalidos.push(crudo.trim());
    else if (!validos.includes(correo)) validos.push(correo);
  }
  return { validos, invalidos };
}
