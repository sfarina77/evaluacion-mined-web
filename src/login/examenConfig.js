/**
 * Port de apps/cliente-integrado/config_examenes.py: de dónde sale la lista
 * de exámenes y cómo sobrevive a un corte de red. Mismo orden red -> caché ->
 * local que Windows y Android, mismo valor de omisión -- así las tres
 * plataformas ven la misma lista sin ningún cambio de servidor.
 *
 * Diferencia real con Python: el navegador no deja fijar la cabecera
 * User-Agent en `fetch` (es una cabecera "prohibida" que controla el
 * navegador) -- no es un descuido, es una restricción de la plataforma web.
 *
 * Diferencia real con Python sobre TLS: el navegador YA valida el
 * certificado contra su propio almacén de confianza antes de dejar pasar la
 * respuesta a este código -- no existe el problema que motivó `certifi` en
 * Windows (un almacén de certificados de Python no disponible).
 */

const CLAVE_CACHE = "evaluacion-mined:examenes-cache";
const CLAVE_CONFIG = "evaluacion-mined:config";

// Mismo valor de omisión que usan Windows y Android mientras el MINEDUCYT no
// tenga su propia infraestructura (ver docs/escala_500mil.md).
const URL_POR_OMISION = "https://raw.githubusercontent.com/sfarina77/examenes/main/examenes.json";

function leerConfig() {
  try {
    const texto = localStorage.getItem(CLAVE_CONFIG);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

/**
 * URL de la lista de exámenes. En Windows y Android el primer nivel es una
 * configuración empujada por el MDM/entorno; en el navegador no hay ningún
 * canal equivalente sin un backend propio detrás del hosting de esta PWA, así
 * que aquí el único nivel configurable es `config` en localStorage (se puede
 * escribir a mano en la consola del navegador para pruebas, o desde una
 * pantalla de ajustes si hiciera falta más adelante).
 */
export function urlExamenes() {
  const config = leerConfig();
  if (config?.url_examenes) return config.url_examenes;
  return URL_POR_OMISION;
}

export async function descargar() {
  const respuesta = await fetch(urlExamenes());
  if (!respuesta.ok) {
    throw new Error(`HTTP ${respuesta.status} al descargar la lista de exámenes`);
  }
  const datos = await respuesta.json();
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
    throw new Error("la lista de exámenes no es un objeto JSON");
  }
  return datos;
}

function guardarCache(examenes) {
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(examenes));
  } catch {
    // no poder cachear no debe impedir el examen
  }
}

function leerCache() {
  try {
    const texto = localStorage.getItem(CLAVE_CACHE);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

/**
 * URL absoluta del examen, o null si no es válida. examenes.json se edita a
 * mano y ya trae entradas sin esquema ("Evaluaciones.edu.gob.sv"): en un
 * iframe eso se resolvería como ruta relativa a esta PWA, no como el sitio
 * del examen -- así que se completa con https:// en vez de fallar.
 */
export function normalizarUrlExamen(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  let texto = url.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(texto)) texto = `https://${texto}`;
  try {
    const resultado = new URL(texto);
    return resultado.protocol === "https:" || resultado.protocol === "http:" ? resultado.href : null;
  } catch {
    return null;
  }
}

/**
 * Lista de exámenes disponible y de dónde salió:{ examenes, origen } con
 * origen en "red" | "cache" | "local". Nunca lanza excepción: si todo falla,
 * quedan los exámenes locales.
 */
export async function obtener(examenesLocales) {
  try {
    const examenes = await descargar();
    guardarCache(examenes);
    return { examenes: { ...examenesLocales, ...examenes }, origen: "red" };
  } catch {
    const enCache = leerCache();
    if (enCache) {
      return { examenes: { ...examenesLocales, ...enCache }, origen: "cache" };
    }
    return { examenes: { ...examenesLocales }, origen: "local" };
  }
}
