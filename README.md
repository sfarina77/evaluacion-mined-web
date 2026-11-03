# Evaluación MINED — cliente web (Chromebooks)

Cliente PWA para Chromebooks, resultado del spike documentado en
`docs/chromebooks_spike.md`. **Leer ese documento primero**: explica por qué este cliente existe
como una PWA en vez de reusar el APK de `apps/cliente-android/` -- en resumen, los Chromebooks del
MINEDUCYT son equipos de uso diario compartido, así que el "Kiosco de una sola app" de ChromeOS (que
sí podría correr el mismo APK Android vía ARC) queda descartado: dedicaría esos Chromebooks
permanentemente al examen, y no se puede.

**Este módulo nunca se ha abierto en un navegador.** Se escribió en un entorno sin Node.js ni
navegador disponibles. A diferencia del cliente Android (que tampoco se compiló, pero al menos el
Kotlin es un lenguaje que conozco bien probar a mano), acá hay dos capas de incertidumbre real: la
lógica del motor de alertas (que sí se puede verificar, ver abajo) y la integración con
TensorFlow.js (que no).

## El nivel de seguridad es distinto al de Android -- esto no es un detalle menor

`kiosco/ModoQuiosco.kt` en Android puede lograr un bloqueo DURO (Lock Task Mode autorizado por un
MDM: inicio, recientes y gestos no hacen nada). **Ningún navegador puede ofrecer eso.** Salir de
pantalla completa con `Escape`, cambiar de pestaña, o cerrar la ventana son cosas que el usuario
SIEMPRE puede hacer en un navegador -- es una protección de seguridad del navegador, no una
limitación de este código, y ninguna API web la puede desactivar.

Por eso el diseño acá es distinto en un punto importante: en Android, la detección de evasión es un
**caso degradado** (pasa solo si el MDM todavía no autorizó el bloqueo). En este cliente web, la
detección de evasión (`examen/examenControlador.js`, eventos `visibilitychange` y
`fullscreenchange`) es **la única defensa real que existe** -- no hay ningún nivel superior al que
degradar. Cualquier salida se cuenta como alerta grave en el mismo contador de 10, igual que en las
otras dos plataformas, pero acá es el mecanismo principal, no el de respaldo.

## Qué SÍ está hecho

| Pieza | Archivo | Equivalente |
|---|---|---|
| Motor de alertas | `src/motor/motorAlertas.js` | `motor_alertas.py` / `MotorAlertas.kt` |
| Debounce y timeline | `src/motor/gestorAlertas.js` | `gestor_alertas.py` / `GestorAlertas.kt` |
| Puente detección→motor | `src/motor/alimentarMotor.js` | `analisis_sesion.py::alimentar` |
| Login y resolución de examen | `src/login/` | `config_examenes.py` / `ExamenConfig.kt` |
| Vista de examen + bloqueo de navegador + evasión | `src/examen/examenControlador.js` | `examen_unificado.py` / `ExamenActivity.kt` (con el nivel de seguridad distinto explicado arriba) |
| Detección por cámara (getUserMedia + ONNX Runtime Web) | `src/deteccion/proctorDetector.js` | `proctor_detector.py` / `ProctorDetector.kt` |
| Sesión local (IndexedDB) + cola de subida | `src/sesion/` | `sesion.py`+`cerrar_sesion.py` / `sesion/*.kt` |

## Tests que SÍ se pueden correr (y verificar de verdad, a diferencia de Android/Kotlin)

```bash
cd apps/cliente-web
npm test
```

Usa `node --test` (viene con Node.js, no hace falta instalar nada) -- así que a diferencia del
cliente Android, **esto sí se puede ejecutar y confirmar** apenas haya Node.js disponible. Los
casos son el mismo espejo que `apps/detector/tests/` y `apps/cliente-android/.../motor/*Test.kt`:
mismos números, mismo orden. Si cambia una regla de negocio, cambia en las TRES plataformas.

## Lo que falta para probar en un Chromebook real

### 1. Modelos ONNX (ya exportados el 26/10/2026)

`public/modelos/yolov8n.onnx` y `yolov8n-pose.onnx` ya están exportados y probados en Chrome
(cámara falsa, ~0.6 s de carga, 2 análisis/seg). Se usa ONNX Runtime Web y no TensorFlow.js porque
ultralytics ≥8.4.83 ya no exporta a TF.js en Windows. Para regenerarlos:

```bash
cd evaluacion-mined-1.0.6
pip install -r apps/detector/requirements.txt   # si no está ya el entorno de apps/detector
python apps/cliente-web/herramientas/exportar_modelos_onnx.py
```

### 1b. Links de examen que no se pueden mostrar

El examen se muestra dentro de un `<iframe>`. Si el sitio del examen envía `X-Frame-Options` o
`frame-ancestors` (por ejemplo wheebox.com/PISA o mined.gob.sv), el navegador se niega a mostrarlo y
no hay nada que este cliente pueda hacer -- en Windows/Android no pasa porque usan un WebView.
Antes de publicar un link nuevo, probarlo en este cliente.

### 2. Servir la app (necesita HTTPS o localhost -- getUserMedia lo exige)

No hay paso de build (a propósito: sin bundler, sin npm install, todo `<script type="module">`
directo). Cualquier servidor estático sirve, por ejemplo:

```bash
npx serve apps/cliente-web
```

`getUserMedia` (la cámara) y los service workers requieren un contexto seguro: `https://` en
producción, o `http://localhost` para pruebas locales -- un `file://` directo NO va a funcionar.

### 3. Resolver la pregunta de la licencia de ChromeOS

Ver `docs/chromebooks_spike.md`: sin una licencia Chrome Education/Enterprise Upgrade (o similar),
ninguna de las opciones de Google Admin (kiosco o sesión de invitado administrada) está disponible,
y este cliente terminaría corriendo en un navegador Chrome normal, sin ninguna restricción de
Google Admin -- el bloqueo de `examenControlador.js` (fullscreen + detección de evasión) sigue
funcionando igual en ese caso, pero es la única defensa, sin ninguna capa de por medio.

### 4. Configurar el backend

Mismo criterio que Android: sin URL/clave de API no hay ninguna quemada en el código. Se configuran
escribiendo en `localStorage` la clave `evaluacion-mined:config` con un JSON
`{"url_examenes": "...", "api_url": "...", "api_key": "..."}` -- hoy no hay una pantalla de ajustes
para esto (pendiente si hace falta una gestión más cómoda que la consola del navegador).

## Qué NO incluye a propósito (mismo criterio que Windows y Android)

- Verificación de identidad por rostro en el cliente (responsabilidad del backend).
- Micrófono: no se pide el permiso en ningún momento (a diferencia de Windows/Android desde
  2026-11-02, ver `docs/motor_alertas_spec.md`; sigue pendiente decidir si este cliente debe
  alinearse).

**Corrección (2026-11-02):** esta sección decía también "Fotos de evidencia (decisión
institucional del 29/07/2026, vigente en las tres plataformas)" -- eso dejó de ser cierto el
27/10/2026 (commit `dbb1888`/`9d8e8c1`): este cliente SÍ toma y guarda una foto pequeña por cada
alerta/advertencia, subida a Firestore con 90 días de retención (`DIAS_RETENCION` en
`src/nube/configNube.js`), visible para el docente/administrador. El texto de consentimiento en
`index.html` ya lo refleja. Lo que quedó desactualizado era solo esta lista -- Windows y Android sí
siguen sin guardar ninguna imagen, ahí la decisión del 29/07 sigue vigente.

## Consola de integridad (`dashboard/`, evaluacionsv.com/dashboard)

Vista de administración, aparte del panel en vivo (`docente/index.html`): mientras el panel muestra
UN examen a la vez para su docente, esta consola cruza TODOS los exámenes para responder la
pregunta de fondo ("¿es fácil copiarse? ¿qué tan seguido? ¿con qué evidencia?"):

- **Galería de evidencia** filtrable por examen, tipo de alerta, NIE y rango de fechas.
- **Ranking de situaciones**: qué tipo de alerta se dispara más seguido (de verdad, no advertencias
  de salir del examen) -- la pregunta de dónde reforzar la vigilancia.
- **Resumen por examen**: cuántos estudiantes, cuántos anulados, tasa de anulación.

Solo para administradores (documento en `admins/{correo}` de Firestore) -- un docente normal sigue
viendo únicamente el panel en vivo de sus propios exámenes asignados, igual que antes.

**Antes de que esto funcione en producción** hay que desplegar dos cosas que no se autodespliegan
solas (ver `firebase.json`/`nube/`):

```bash
cd apps/cliente-web
firebase deploy --only firestore:rules,firestore:indexes --project evaluacionsv
```

- `nube/firestore.rules` cambió: cada evento ahora guarda su propio `examenId`/`nie` (antes solo
  vivían en la sesión padre) para que la consola pueda filtrar con una sola consulta en vez de un
  `get()` por evento, y se agregó la regla `match /{path=**}/eventos/{eventoId}` que exige Firestore
  para permitir una collectionGroup query (sin ella, la consola no puede leer across-sesiones). No
  amplía quién puede ver qué: un admin ya podía leer cualquier evento antes, uno por uno.
- `nube/firestore.indexes.json` existe pero hoy está vacío: las consultas de la consola usan rango
  simple en un solo campo (`inicio`/`ts`) con el mismo campo en `orderBy`, que Firestore indexa
  automáticamente. Si el navegador muestra un error con un enlace para crear un índice (pasa si se
  amplían los filtros más adelante), ese enlace ya hace el trabajo -- después conviene exportar ese
  índice nuevo a este archivo para que quede versionado, no solo en la consola de Firebase.
- Los eventos escritos ANTES de este cambio no tienen `examenId`/`nie` propios, así que no van a
  aparecer en los filtros de la consola (sí van a seguir viéndose en el panel en vivo de siempre,
  que no depende de esos campos). Es un costo aceptado, no un bug: no tiene sentido reescribir
  eventos viejos solo para esto.

## Pendiente, no bloqueante

- **Íconos de la PWA** (`public/icons/PENDIENTE.txt`): son placeholders, hace falta generarlos.
- **ONNX Runtime Web por CDN**: si el despliegue final necesita funcionar sin internet en absoluto,
  hay que vendorizar `onnxruntime-web/dist` en vez de cargarlo de `cdn.jsdelivr.net` (ver el comentario en
  `index.html`).
- **Background Sync** (`public/sw.js`) no es soporte universal entre navegadores -- es soporte de
  Chromium, que es justamente lo que corre en un Chromebook, así que no debería ser un problema
  real para este cliente en particular, pero vale la pena confirmarlo en un dispositivo real.
- **Calibración de umbrales** en una cámara de Chromebook real -- mismos umbrales copiados
  literales de `proctor_detector.py`, van a necesitar su propia ronda de calibración, igual que se
  documentó para Windows y como queda pendiente para Android.
