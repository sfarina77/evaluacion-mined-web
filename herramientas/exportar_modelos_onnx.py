"""Exporta los modelos de visión del detector Windows (apps/detector/modelos/)
a ONNX para que proctorDetector.js los cargue en el navegador con ONNX
Runtime Web.

Por qué ONNX y no TensorFlow.js (el plan original): desde ultralytics 8.4.83
`format="tfjs"` está deprecado y se redirige a LiteRT, que solo exporta en
Linux x86 y macOS -- en Windows falla. ONNX exporta en cualquier sistema, con
NMS embebido, y es el mismo runtime (onnxruntime) que ya usa el detector de
Windows.

Uso (mismo entorno que ya tiene ultralytics instalado, ver
apps/detector/requirements.txt):

    cd evaluacion-mined-1.0.6
    python apps/cliente-web/herramientas/exportar_modelos_onnx.py

Deja `yolov8n.onnx` y `yolov8n-pose.onnx` en apps/cliente-web/public/modelos/,
listos para servir como archivos estáticos junto con el resto de la PWA.

Formas verificadas el 26/10/2026 con ultralytics 8.4.190 (las que asume
proctorDetector.js): entrada `images` [1, 3, 640, 640]; salida `output0`
[1, 300, 6] para detección y [1, 300, 57] para pose (caja 4 + conf + clase +
17 keypoints x,y,conf), coordenadas en píxeles de la imagen de 640. Si una
versión futura de ultralytics cambia esto, el script falla en vez de dejar
modelos que el navegador interpretaría mal.
"""

from pathlib import Path
import shutil

from ultralytics import YOLO

RAIZ = Path(__file__).resolve().parents[3]  # evaluacion-mined-1.0.6/
MODELOS_ORIGEN = RAIZ / "apps" / "detector" / "modelos"
DESTINO = Path(__file__).resolve().parent.parent / "public" / "modelos"

IMGSZ = 640  # mismo tamaño que usan proctor_detector.py y el export de Android


def exportar(nombre_pt: str, columnas_esperadas: int) -> None:
    origen = MODELOS_ORIGEN / nombre_pt
    if not origen.exists():
        raise FileNotFoundError(
            f"no se encontró {origen}. Este script asume que ya existen los .pt "
            "de apps/detector/modelos/ (los mismos que usa el cliente Windows)."
        )
    print(f"[export] cargando {origen.name}...")
    modelo = YOLO(str(origen))
    print(f"[export] exportando a ONNX (imgsz={IMGSZ}, nms=True)...")
    ruta_exportada = Path(modelo.export(format="onnx", imgsz=IMGSZ, nms=True))

    verificar_forma(ruta_exportada, columnas_esperadas)

    DESTINO.mkdir(parents=True, exist_ok=True)
    destino_final = DESTINO / ruta_exportada.name
    shutil.move(str(ruta_exportada), destino_final)
    print(f"[export] listo: {destino_final}")


def verificar_forma(ruta: Path, columnas_esperadas: int) -> None:
    import onnxruntime as ort

    sesion = ort.InferenceSession(str(ruta))
    entrada = sesion.get_inputs()[0]
    salida = sesion.get_outputs()[0]
    if entrada.name != "images" or list(entrada.shape) != [1, 3, IMGSZ, IMGSZ]:
        raise RuntimeError(f"entrada inesperada en {ruta.name}: {entrada.name} {entrada.shape}")
    if len(salida.shape) != 3 or salida.shape[2] != columnas_esperadas:
        raise RuntimeError(
            f"salida inesperada en {ruta.name}: {salida.shape} (se esperaba [1, N, {columnas_esperadas}]) "
            "-- revisar src/deteccion/proctorDetector.js antes de usar este modelo"
        )


def main() -> None:
    exportar("yolov8n.pt", 6)
    exportar("yolov8n-pose.pt", 6 + 17 * 3)


if __name__ == "__main__":
    main()
