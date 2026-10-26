/**
 * Port de apps/detector/analisis_sesion.py::alimentar -- traduce las
 * detecciones activas de la cámara en un instante a llamadas del motor de
 * alertas. Única fuente de la correspondencia detección->situación (misma
 * tabla que el .py y que el port Kotlin, no duplicarla en un cuarto lugar):
 *
 *   candidato_ausente     -> situación 1 (encuadre) + 5 (ausencia)
 *   persona_adicional     -> situación 2 (segunda persona, inmediata)
 *   distraccion_facial,
 *   rostro_no_visible     -> situación 3 (mirada fuera, con sensibilidad baja)
 *   dispositivo_adicional -> situación 4 (objeto no permitido)
 *   encuadre_incorrecto   -> ninguna: problema de montaje, se informa, no alerta
 */

const COMO_MIRADA = new Set(["distraccion_facial", "rostro_no_visible"]);

/** Detección de flancos que el llamador conserva entre instantes (equivalente
 * al dict `estado` en Python). Crear una instancia nueva por sesión. */
export function crearEstadoAlimentador() {
  return { objetoPresente: false, miradaPresente: false };
}

export function alimentar(motor, tipos, t, estado) {
  const conjunto = tipos instanceof Set ? tipos : new Set(tipos);
  let acciones = [];

  // 1 y 5: fuera de cuadro / ausencia prolongada (con sus temporizadores)
  acciones = acciones.concat(
    conjunto.has("candidato_ausente") ? motor.sinCandidato(t) : motor.candidatoPresente(t),
  );

  // 2: segunda persona (el motor cuenta 1 vez por episodio continuo)
  acciones = acciones.concat(motor.rostrosDetectados(conjunto.has("persona_adicional") ? 2 : 1, t));

  // 4: objeto no permitido
  const objetoAhora = conjunto.has("dispositivo_adicional");
  if (objetoAhora) {
    acciones = acciones.concat(motor.objetoNoPermitido("celular", t));
  } else if (estado.objetoPresente) {
    motor.objetoRetirado("celular");
  }
  estado.objetoPresente = objetoAhora;

  // 3: mirada fuera -- una "vez" por episodio; alerta a las 5 seguidas
  const miradaAhora = [...conjunto].some((tipo) => COMO_MIRADA.has(tipo));
  if (miradaAhora && !estado.miradaPresente) {
    acciones = acciones.concat(motor.miradaFuera(t));
  }
  estado.miradaPresente = miradaAhora;

  return acciones;
}
