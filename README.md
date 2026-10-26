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
- Fotos de evidencia (decisión institucional del 29/07/2026, vigente en las tres plataformas).
- Micrófono: no se pide el permiso en ningún momento.

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
