/**
 * Evaluador de expresiones aritméticas para las calculadoras básica/
 * científica del examen (2026-11-03). Deliberadamente NO usa eval() -- nunca
 * se evalúa texto como código en este proyecto. Recursivo descendente
 * simple: + - * / ^, paréntesis, funciones trigonométricas EN GRADOS (más
 * natural para un estudiante de educación básica que radianes), log/ln/sqrt,
 * y las constantes pi/e. Pura, para poder probarla sin navegador
 * (test/calculadoraLogica.test.js) y para que la calculadora básica y la
 * científica (examen/calculadoras.js) compartan el mismo evaluador -- la
 * básica simplemente no muestra los botones de función.
 */

const FUNCIONES = {
  sin: (x) => Math.sin((x * Math.PI) / 180),
  cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180),
  log: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  sqrt: (x) => Math.sqrt(x),
};

export class ErrorExpresion extends Error {}

function tokenizar(texto) {
  const tokens = [];
  const re = /\s*([A-Za-z]+|\d+(?:\.\d+)?|[+\-*/^()])/g;
  let ultimoIndice = 0;
  let coincidencia;
  while ((coincidencia = re.exec(texto))) {
    if (coincidencia.index !== ultimoIndice) throw new ErrorExpresion("Carácter inesperado");
    tokens.push(coincidencia[1]);
    ultimoIndice = re.lastIndex;
  }
  if (ultimoIndice !== texto.length) throw new ErrorExpresion("Carácter inesperado");
  return tokens;
}

/** Evalúa una expresión como "2 + 3 * sin(30)" y devuelve un número, o lanza
 * ErrorExpresion con un mensaje pensado para mostrarle al estudiante. */
export function evaluarExpresion(texto) {
  const tokens = tokenizar(String(texto ?? "").trim());
  if (!tokens.length) throw new ErrorExpresion("Expresión vacía");
  let pos = 0;
  const siguiente = () => tokens[pos];
  const avanzar = () => tokens[pos++];

  function parsearPrimario() {
    const tok = siguiente();
    if (tok === undefined) throw new ErrorExpresion("Expresión incompleta");
    if (tok === "(") {
      avanzar();
      const valor = parsearSuma();
      if (siguiente() !== ")") throw new ErrorExpresion("Falta un paréntesis de cierre");
      avanzar();
      return valor;
    }
    if (tok === "-") {
      avanzar();
      return -parsearPotencia();
    }
    if (/^[A-Za-z]+$/.test(tok)) {
      avanzar();
      if (tok === "pi") return Math.PI;
      if (tok === "e") return Math.E;
      const fn = FUNCIONES[tok];
      if (!fn) throw new ErrorExpresion(`Función desconocida: ${tok}`);
      if (siguiente() !== "(") throw new ErrorExpresion(`Falta "(" después de ${tok}`);
      avanzar();
      const arg = parsearSuma();
      if (siguiente() !== ")") throw new ErrorExpresion("Falta un paréntesis de cierre");
      avanzar();
      return fn(arg);
    }
    avanzar();
    const n = Number(tok);
    if (!Number.isFinite(n)) throw new ErrorExpresion(`Número inválido: ${tok}`);
    return n;
  }

  function parsearPotencia() {
    const base = parsearPrimario();
    if (siguiente() === "^") {
      avanzar();
      return Math.pow(base, parsearPotencia()); // asociativo a la derecha: 2^3^2 == 2^(3^2)
    }
    return base;
  }

  function parsearProducto() {
    let valor = parsearPotencia();
    while (siguiente() === "*" || siguiente() === "/") {
      const op = avanzar();
      const der = parsearPotencia();
      valor = op === "*" ? valor * der : valor / der;
    }
    return valor;
  }

  function parsearSuma() {
    let valor = parsearProducto();
    while (siguiente() === "+" || siguiente() === "-") {
      const op = avanzar();
      const der = parsearProducto();
      valor = op === "+" ? valor + der : valor - der;
    }
    return valor;
  }

  const resultado = parsearSuma();
  if (pos !== tokens.length) throw new ErrorExpresion("Carácter inesperado al final");
  if (!Number.isFinite(resultado)) throw new ErrorExpresion("Resultado no numérico (¿división por cero?)");
  return resultado;
}
