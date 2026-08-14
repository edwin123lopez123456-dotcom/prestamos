import type { MetricasDashboard, PrestamoConCliente, EstadoCartera } from "@/types";

export interface MetricasFinancieras extends MetricasDashboard {
  estado_cartera: EstadoCartera;
}

/** Interés total de un préstamo = total cuotas − capital prestado */
export function calcularInteresTotal(prestamo: PrestamoConCliente): number {
  const totalEsperado = prestamo.valor_cuota * prestamo.total_cuotas;
  return Math.max(0, totalEsperado - prestamo.monto_prestado);
}

/** Calcula intereses ganados y por cobrar a partir de préstamos enriquecidos */
export function calcularIntereses(prestamos: PrestamoConCliente[]): {
  intereses_ganados: number;
  intereses_por_cobrar: number;
} {
  let intereses_ganados = 0;
  let intereses_por_cobrar = 0;

  for (const p of prestamos) {
    const totalEsperado = p.valor_cuota * p.total_cuotas;
    if (totalEsperado <= 0) continue;

    const interesTotal = calcularInteresTotal(p);
    const ratioPagado = Math.min(1, p.total_abonado / totalEsperado);

    intereses_ganados += interesTotal * ratioPagado;

    if (p.estado !== "pagado") {
      intereses_por_cobrar += interesTotal * (1 - ratioPagado);
    }
  }

  return {
    intereses_ganados: Math.round(intereses_ganados),
    intereses_por_cobrar: Math.round(intereses_por_cobrar),
  };
}

/** Distribución de préstamos activos por semáforo de mora */
export function calcularEstadoCartera(
  prestamos: PrestamoConCliente[]
): EstadoCartera {
  const activos = prestamos.filter((p) => p.estado !== "pagado");
  return {
    al_dia: activos.filter((p) => p.mora.semaforo === "verde").length,
    mora_amarilla: activos.filter((p) => p.mora.semaforo === "amarillo").length,
    mora_roja: activos.filter((p) => p.mora.semaforo === "rojo").length,
  };
}

/** Total recaudado hoy desde abonos */
export function calcularRecaudadoHoy(
  abonos: { monto_abonado: number; fecha_abono: string }[],
  fechaReferencia: Date = new Date()
): number {
  const hoy = fechaReferencia.toISOString().split("T")[0];
  return abonos
    .filter((a) => a.fecha_abono === hoy)
    .reduce((s, a) => s + a.monto_abonado, 0);
}
