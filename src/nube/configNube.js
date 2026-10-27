/**
 * Configuración web del proyecto Firebase que guarda las sesiones en vivo y
 * sirve el panel del docente (evaluacionsv.com/docente). Estos valores NO son
 * secretos -- Firebase los diseña para ir en el código del navegador; lo que
 * protege los datos son las reglas de firestore.rules.
 *
 * Con `null` la supervisión funciona igual, solo que nada sale del equipo
 * (la sesión queda en IndexedDB como antes).
 */
export const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDBGvMvacsobeQ92foQ5yz7GlqNdwvTJGo",
  authDomain: "evaluacionsv.firebaseapp.com",
  projectId: "evaluacionsv",
  storageBucket: "evaluacionsv.firebasestorage.app",
  messagingSenderId: "353470998604",
  appId: "1:353470998604:web:e01773d16422d67d58ece9",
};

/** Días que se conservan sesiones, eventos y fotos antes de que la política
 * TTL de Firestore los borre (campo `expira`). */
export const DIAS_RETENCION = 90;

export const VERSION_SDK = "12.19.0";
