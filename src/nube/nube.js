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

/** { app, auth, db, fa (firebase-auth), fs (firebase-firestore) } */
export function nube() {
  if (!nubeConfigurada()) return Promise.reject(new Error("Firebase sin configurar (src/nube/configNube.js)"));
  cargada ??= (async () => {
    const [fapp, fa, fs] = await Promise.all([
      import(`${BASE}/firebase-app.js`),
      import(`${BASE}/firebase-auth.js`),
      import(`${BASE}/firebase-firestore.js`),
    ]);
    const app = fapp.initializeApp(CONFIG_FIREBASE);
    return { app, auth: fa.getAuth(app), db: fs.getFirestore(app), fa, fs };
  })();
  return cargada;
}
