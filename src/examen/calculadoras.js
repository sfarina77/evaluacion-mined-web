/**
 * Calculadoras de apoyo durante un examen (2026-11-03): básica, científica
 * (ambas con calculadoraLogica.js, sin eval()) y gráfica (Desmos, embebida
 * -- ningún navegador la sabe dibujar por su cuenta y reconstruirla a mano
 * de verdad habría quedado muy por debajo de lo que un estudiante ya conoce
 * de Desmos en el colegio). Siempre vive DENTRO de la página (nunca una
 * ventana/pestaña nueva, mismo motivo que los videos: no debe disparar la
 * detección de evasión).
 */

import { evaluarExpresion } from "./calculadoraLogica.js";

// Clave pública de demostración que Desmos publica en su propia
// documentación para evaluar la API de embeber -- funciona para probar esto
// de inmediato, pero antes de un uso real a escala del MINEDUCYT hay que
// pedir una clave propia (gratis) en https://www.desmos.com/api, sus
// términos de uso son para eso. Cambiar solo esta constante cuando llegue.
const DESMOS_API_KEY = "dcb31709b452b1cf9dc26972add0fda6";
let desmosPromesa = null;

function cargarDesmos() {
  if (window.Desmos) return Promise.resolve(window.Desmos);
  desmosPromesa ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.desmos.com/api/v1.9/calculator.js?apiKey=${DESMOS_API_KEY}`;
    script.addEventListener("load", () => resolve(window.Desmos));
    script.addEventListener("error", () => reject(new Error("No se pudo cargar Desmos")));
    document.head.append(script);
  });
  return desmosPromesa;
}

function el(etiqueta, { clase, texto } = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  nodo.append(...hijos);
  return nodo;
}

const FILAS_NUMERICAS = [
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "=", "+"],
];

// Cada función ya trae el "(" para que al tocarla quede lista para el
// argumento -- un estudiante de básica no tiene por qué saber que hay que
// escribir el paréntesis aparte.
const BOTONES_FUNCIONES = ["sin(", "cos(", "tan(", "√(", "log(", "ln(", "^", "(", ")", "π", "e"];
// Lo que de verdad entiende evaluarExpresion detrás de cada símbolo "bonito".
const ALIAS = { "√(": "sqrt(", π: "pi" };

/** Calculadora básica o científica -- misma pantalla y teclado numérico, la
 * científica agrega una fila de funciones arriba. */
export function crearCalculadoraBotones(cientifica) {
  const pantalla = el("div", { clase: "calculadora-pantalla", texto: "0" });
  let expresion = "";

  function refrescar() {
    pantalla.textContent = expresion || "0";
  }

  function presionar(simbolo, valorReal) {
    if (simbolo === "C") {
      expresion = "";
    } else if (simbolo === "⌫") {
      expresion = expresion.slice(0, -1);
    } else if (simbolo === "=") {
      try {
        const resultado = evaluarExpresion(expresion);
        // Redondeo para no mostrar basura de punto flotante (0.1+0.2).
        expresion = String(Math.round(resultado * 1e10) / 1e10);
      } catch {
        expresion = "Error";
      }
    } else {
      expresion = expresion === "Error" ? "" : expresion;
      expresion += valorReal ?? simbolo;
    }
    refrescar();
  }

  const botonesControl = el("div", { clase: "calculadora-fila" });
  for (const texto of ["C", "⌫"]) {
    const boton = el("button", { clase: "calculadora-control", texto });
    boton.type = "button";
    boton.addEventListener("click", () => presionar(texto));
    botonesControl.append(boton);
  }

  const contenedor = el("div", { clase: "calculadora" }, pantalla);

  if (cientifica) {
    const filaFunciones = el("div", { clase: "calculadora-fila calculadora-funciones" });
    for (const simbolo of BOTONES_FUNCIONES) {
      const boton = el("button", { texto: simbolo });
      boton.type = "button";
      boton.addEventListener("click", () => presionar(simbolo, ALIAS[simbolo]));
      filaFunciones.append(boton);
    }
    contenedor.append(filaFunciones);
  }

  contenedor.append(botonesControl);
  for (const fila of FILAS_NUMERICAS) {
    const filaEl = el("div", { clase: "calculadora-fila" });
    for (const simbolo of fila) {
      const boton = el("button", { clase: simbolo === "=" ? "calculadora-igual" : "", texto: simbolo });
      boton.type = "button";
      boton.addEventListener("click", () => presionar(simbolo));
      filaEl.append(boton);
    }
    contenedor.append(filaEl);
  }

  return contenedor;
}

/**
 * Botón "Calculadora" + panel flotante que se arma la primera vez que se
 * toca (perezoso: la gráfica en particular descarga el script de Desmos, no
 * tiene sentido pagar ese costo si nunca se abre). El panel vive DENTRO del
 * envoltorio devuelto, así que cuando reproductor.js reemplaza el cuerpo de
 * la pregunta al pasar a la siguiente, se limpia solo -- no hace falta
 * destruirlo a mano.
 */
export function crearBotonCalculadora(herramienta) {
  const envoltorio = el("div", { clase: "envoltorio-calculadora" });
  const boton = el("button", { clase: "boton boton-secundario boton-calculadora", texto: "🧮 Calculadora" });
  boton.type = "button";
  let panel = null;

  boton.addEventListener("click", async () => {
    if (panel) {
      panel.remove();
      panel = null;
      return;
    }
    panel = el("div", { clase: "panel-calculadora" });
    const botonCerrar = el("button", { clase: "boton-texto panel-calculadora-cerrar", texto: "Cerrar ✕" });
    botonCerrar.type = "button";
    botonCerrar.addEventListener("click", () => {
      panel?.remove();
      panel = null;
    });
    panel.append(botonCerrar);
    envoltorio.append(panel);

    if (herramienta === "calculadora_grafica") {
      const lienzo = el("div", { clase: "calculadora-grafica" });
      panel.append(lienzo);
      try {
        await cargarDesmos();
        window.Desmos.GraphingCalculator(lienzo, { expressionsCollapsed: true, border: false });
      } catch {
        lienzo.replaceChildren(
          el("p", { clase: "mensaje-error", texto: "No se pudo cargar la calculadora gráfica. Revisa tu conexión." }),
        );
      }
    } else {
      panel.append(crearCalculadoraBotones(herramienta === "calculadora_cientifica"));
    }
  });

  envoltorio.append(boton);
  return envoltorio;
}
