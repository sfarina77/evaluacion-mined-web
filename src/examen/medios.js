/**
 * Convierte un link de video a uno que se pueda incrustar en una etiqueta.
 * Pura, para poder probarla sin navegador (test/medios.test.js).
 *
 * Por qué esto importa para el proctoring: el reproductor (reproductor.js)
 * nunca abre un link en pestaña/ventana nueva -- eso dispararía la detección
 * de evasión (examenControlador.js ve que la página pierde el foco) para algo
 * que el estudiante hizo bien, viendo el video que le pusieron. Todo el medio
 * tiene que quedar DENTRO de la misma página.
 */
export function urlEmbebibleDeVideo(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.get("v")) {
      return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    }
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return url; // link directo a un archivo de video (mp4, webm...): se usa tal cual en <video>
  } catch {
    return null;
  }
}

/** ¿El link de arriba resultó ser de una plataforma que solo se puede mostrar
 * en <iframe> (YouTube/Vimeo), o es un archivo de video directo para <video>? */
export function esEmbedDePlataforma(urlEmbebible) {
  return /youtube\.com\/embed|player\.vimeo\.com/.test(urlEmbebible ?? "");
}

/**
 * A qué `medio.tipo` corresponde un MIME de un archivo que el docente sube
 * (2026-11-03, ver autoria.js::subirMedioArchivo) -- null si no es ninguno
 * de los que esta plataforma sabe mostrar (nube/storage.rules ya lo habría
 * rechazado antes de llegar acá, esto es la segunda línea de defensa en el
 * propio navegador, con un mensaje más claro que un error de permisos).
 */
/**
 * Qué URL de iframe mostrar para un documento (medio.tipo === "documento",
 * PDF o Word). Un PDF lo renderiza el propio navegador en un
 * `<iframe src="...">` directo; Word (.doc/.docx) no lo sabe mostrar ningún
 * navegador, así que se envuelve con el visor público de Google Docs --
 * funciona igual con una URL de descarga de Storage, que ya trae su propio
 * token de acceso embebido en el link (no hace falta que el archivo sea
 * "público" aparte).
 */
export function urlVisorDocumento(url) {
  if (/\.pdf(\?|$)/i.test(String(url ?? ""))) return url;
  return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
}

export function tipoMedioDesdeMime(mime) {
  const texto = String(mime ?? "");
  if (texto.startsWith("image/")) return "imagen";
  if (texto.startsWith("video/")) return "video";
  if (texto.startsWith("audio/")) return "audio";
  if (
    texto === "application/pdf" ||
    texto === "application/msword" ||
    texto === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "documento";
  }
  return null;
}
