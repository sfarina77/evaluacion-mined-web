/** Port de la validación de NIE de apps/detector/sesion.py. */

// NIE salvadoreño: dígitos. Se acepta también el prefijo de pruebas NIE-...
const PATRON_NIE = /^(?:NIE-[A-Za-z0-9-]{1,32}|\d{4,12})$/;

export function nieValido(valor) {
  return typeof valor === "string" && PATRON_NIE.test(valor.trim());
}
