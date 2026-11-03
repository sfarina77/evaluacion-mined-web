import { CONFIG_FIREBASE, VERSION_SDK } from "./configNube.js";

/**
 * Carga perezosa del SDK de Firebase desde el CDN oficial (gstatic): esta PWA
 * no tiene paso de build, igual que con ONNX Runtime. Una sola instancia por
 * página, compartida por el cliente del estudiante y el panel del docente.
 */

const BASE = `https://www.gstatic.com/firebasejs/${VERSION_SDK}`;
let cargada = null;

export function nubeConfigurada() {
  return CONFIG_FIREBASE !== null;
}

/** { app, auth, db, fns, storage, fa (firebase-auth), fs (firebase-firestore),
 * ffn (firebase-functions), fst (firebase-storage) } */
export function nube() {
  if (!nubeConfigurada()) return Promise.reject(new Error("Firebase sin configurar (src/nube/configNube.js)"));
  cargada ??= (async () => {
    const [fapp, fa, fs, ffn, fst] = await Promise.all([
      import(`${BASE}/firebase-app.js`),
      import(`${BASE}/firebase-auth.js`),
      import(`${BASE}/firebase-firestore.js`),
      // Solo lo usa autoria.js (generarPreguntas, función "callable"); el
      // resto de las páginas no la necesitan, pero cargarla de más no rompe
      // nada -- es perezosa por página igual que las otras tres.
      import(`${BASE}/firebase-functions.js`),
      // Solo lo usa autoria.js (subir imagen/video propio de una pregunta,
      // 2026-11-03, ver nube/storage.rules) -- mismo criterio que arriba.
      import(`${BASE}/firebase-storage.js`),
    ]);
    const app = fapp.initializeApp(CONFIG_FIREBASE);
    return {
      app,
      auth: fa.getAuth(app),
      db: fs.getFirestore(app),
      fns: ffn.getFunctions(app),
      storage: fst.getStorage(app),
      fa,
      fs,
      ffn,
      fst,
    };
  })();
  return cargada;
}
