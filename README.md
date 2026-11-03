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
- `nube/firestore.indexes.json` ya no está vacío (ver la sección de autoría más abajo): tiene el
  índice compuesto que necesita el panel para la cola de revisión. Las consultas de la galería del
  dashboard siguen sin necesitar ninguno (rango simple en un solo campo). Si el navegador muestra un
  error con un enlace para crear un índice que falte, ese enlace ya hace el trabajo -- después
  conviene exportar ese índice nuevo a este archivo para que quede versionado.
- Los eventos escritos ANTES de este cambio no tienen `examenId`/`nie` propios, así que no van a
  aparecer en los filtros de la consola (sí van a seguir viéndose en el panel en vivo de siempre,
  que no depende de esos campos). Es un costo aceptado, no un bug: no tiene sentido reescribir
  eventos viejos solo para esto.

## Plataforma de autoría (`autoria/`, `functions/`)

Un docente crea un examen con sus propias preguntas (selección simple/múltiple, interpretación,
respuesta completa, o una pizarra para dibujar/escribir a mano) en vez de apuntar a una URL externa
-- `evaluacionsv.com/autoria`. El estudiante sigue sin ver nada distinto para entrar: código + NIE,
igual que siempre; colegio/grado/sección/docentes quedan en la configuración del examen, no los
escribe el estudiante.

**Quién calcula la nota, y por qué importa:** el navegador del estudiante NUNCA califica ni manda su
propia nota -- manda la respuesta cruda, y una Cloud Function (`functions/index.js`, con permisos de
administrador) es quien compara contra la clave real y escribe la calificación. La clave de
respuesta y la rúbrica viven en `examenes/{codigo}/claves/{itemId}`, un documento separado de la
pregunta que el estudiante SÍ puede leer (`examenes/{codigo}/items/{itemId}`) -- sin esa separación,
cualquiera con las herramientas de desarrollador del navegador podría leer la respuesta correcta
antes de contestar, o escribirse el puntaje máximo directamente en Firestore.

**Selección simple/múltiple:** se califica sola, sin IA, todo o nada (sin crédito parcial en
selección múltiple todavía -- la fórmula queda pendiente de que el stakeholder la defina).

**Interpretación / respuesta completa:** Claude sugiere un puntaje y una justificación a partir de
la rúbrica del docente, pero **no es la nota final** -- por indicación directa (2026-11-03): la
evidencia (estudios de LLM calificando respuestas de estudiantes de 5-16 años) muestra que los
modelos califican cerca del nivel humano en respuestas cerradas, pero peor en las abiertas/
subjetivas. El docente confirma o corrige desde el panel en vivo (`docente/index.html`, sección
"Respuestas por revisar") antes de que cuente.

**Pizarra:** sin calificación automática ni de IA -- no hay reconocimiento de letra manuscrita
confiable para niños en este alcance. Se captura como una foto (mismo mecanismo que la evidencia de
cámara: JPEG chico en base64) y queda directo para que el docente la revise y ponga la nota.

**Medios (imagen/video/link):** fase 1 solo admite **links embebidos** (una imagen ya alojada en
algún lado, un video de YouTube/Vimeo o un archivo de video directo) -- todavía no hay botón de
"subir archivo". Subir el archivo real necesitaría Firebase Storage, una pieza de infraestructura
nueva que no se activó en esta fase. Un video se incrusta siempre dentro de la misma página (nunca
en pestaña/ventana nueva): abrir una pestaña nueva dispararía la detección de evasión del
proctoring para algo que el estudiante hizo bien.

**Generación de imagen/video por IA:** deliberadamente fuera de esta fase. Claude no genera
imágenes ni video -- hace falta un proveedor aparte (p. ej. Gemini/Imagen, Synthesia), que es una
integración, un costo y una revisión legal propios. Se evalúa después de probar esto en producción.

### Qué hace falta desplegar, y que NO se puede hacer desde este entorno

Tres cosas, todas gatilladas por el mismo motivo: necesitan credenciales/decisiones que un agente no
debe tomar ni manipular sin que alguien lo vea.

1. **Habilitar el plan de pago (Blaze) del proyecto `evaluacionsv`.** Cloud Functions no corre en el
   plan gratuito. Esto es lo mismo que ya bloqueaba el TTL de 90 días de las fotos (ver nota en
   `docs/project_evaluacion_mined_web` del repositorio de memoria) -- conviene resolver las dos
   cosas en la misma visita a la consola de Firebase.
2. **Darle a la función la clave de la API de Claude**, sin que quede escrita en ningún archivo del
   repositorio:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY --project evaluacionsv
   ```
3. **Desplegar reglas, índices y la función**, con una cuenta que tenga login interactivo de Google
   (el CLI no acepta credenciales de servicio sin ese paso la primera vez):
   ```bash
   cd apps/cliente-web
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,firestore:indexes,functions --project evaluacionsv
   ```

Antes de activarlo con estudiantes reales: confirmar el ID exacto del modelo de Claude en
`functions/claudeClient.js` contra la documentación vigente de Anthropic (se dejó sin la fecha de
snapshot a propósito, porque inventarla desde acá habría sido adivinar).

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
