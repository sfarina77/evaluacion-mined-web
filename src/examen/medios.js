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
