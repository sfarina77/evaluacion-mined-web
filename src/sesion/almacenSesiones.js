/**
 * Almacenamiento local de sesiones vía IndexedDB -- equivalente web de
 * `rutas.py`/`sesion.py` (carpeta por sesión en `%LOCALAPPDATA%`) y de
 * `Rutas.kt`/`SesionManager.kt` en Android (`context.filesDir`). IndexedDB es
 * la elección correcta acá (no `localStorage`) porque el timeline de una
 * sesión larga puede pesar más de lo que `localStorage` tolera de forma
 * confiable entre navegadores.
 */

const NOMBRE_DB = "evaluacion-mined";
const VERSION_DB = 1;
const ALMACEN = "sesiones";

function abrirDb() {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(NOMBRE_DB, VERSION_DB);
    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: "sesionId" });
      }
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

async function conAlmacen(modo, fn) {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, modo);
    const almacen = tx.objectStore(ALMACEN);
    const resultado = fn(almacen);
    tx.oncomplete = () => resolve(resultado);
    tx.onerror = () => reject(tx.error);
  });
}

/** Guarda (o reemplaza) el registro completo de una sesión. `subida: false`
 * al crearla; `marcarSubida` la actualiza cuando el backend confirma. */
export async function guardarSesion(registro) {
  await conAlmacen("readwrite", (almacen) => almacen.put(registro));
}

export async function marcarSubida(sesionId) {
  await conAlmacen("readwrite", (almacen) => {
    const solicitud = almacen.get(sesionId);
    solicitud.onsuccess = () => {
      const registro = solicitud.result;
      if (registro) {
        registro.subida = true;
        almacen.put(registro);
      }
    };
  });
}

/** Sesiones con `subida: false` -- equivalente al barrido de
 * `subir_pendientes.py` / `EscanearPendientesWorker.kt`. */
export async function listarPendientes() {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, "readonly");
    const solicitud = tx.objectStore(ALMACEN).getAll();
    solicitud.onsuccess = () => resolve(solicitud.result.filter((r) => !r.subida));
    solicitud.onerror = () => reject(solicitud.error);
  });
}
