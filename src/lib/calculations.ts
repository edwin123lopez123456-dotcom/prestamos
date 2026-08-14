import type { Abono, FrecuenciaPago, InfoMora, Prestamo, SemaforoMora } from "@/types";

/** Calcula el saldo pendiente de un préstamo según abonos registrados */
export function calcularSaldoPendiente(
  prestamo: Prestamo,
  abonos: Abono[]
): number {
  const totalEsperado = prestamo.valor_cuota * prestamo.total_cuotas;
  const totalAbonado = abonos
    .filter((a) => a.prestamo_id === prestamo.id)
    .reduce((sum, a) => sum + a.monto_abonado, 0);
  return Math.max(0, totalEsperado - totalAbonado);
}

/** Calcula cuántas cuotas equivalen al total abonado */
export function calcularCuotasEquivalentes(
  prestamo: Prestamo,
  totalAbonado: number
): number {
  if (prestamo.valor_cuota <= 0) return 0;
  return Math.floor(totalAbonado / prestamo.valor_cuota);
}

/** Suma periodos según frecuencia de pago a una fecha base */
function sumarPeriodo(fecha: Date, frecuencia: FrecuenciaPago, cuotas: number): Date {
  const result = new Date(fecha);
  switch (frecuencia) {
    case "diario":
      result.setDate(result.getDate() + cuotas);
      break;
    case "semanal":
      result.setDate(result.getDate() + cuotas * 7);
      break;
    case "quincenal":
      result.setDate(result.getDate() + cuotas * 15);
      break;
    case "mensual":
      result.setMonth(result.getMonth() + cuotas);
      break;
  }
  return result;
}

/** Fecha de vencimiento de la cuota N (1-indexed) */
export function calcularFechaVencimientoCuota(
  prestamo: Prestamo,
  numeroCuota: number
): Date {
  const inicio = new Date(`${prestamo.fecha_inicio}T00:00:00`);
  return sumarPeriodo(inicio, prestamo.frecuencia, numeroCuota);
}

function toIsoDate(fecha: Date): string {
  return fecha.toISOString().split("T")[0];
}

function normalizarFecha(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Determina el semáforo según días de atraso */
export function determinarSemaforo(diasAtraso: number): SemaforoMora {
  if (diasAtraso <= 0) return "verde";
  if (diasAtraso <= 7) return "amarillo";
  return "rojo";
}

/**
 * Calcula los días de atraso basándose en la fecha de la última cuota
 * vencida no pagada (primera cuota pendiente cuya fecha ya pasó).
 */
export function calcularMora(
  prestamo: Prestamo,
  fechaReferencia: Date = new Date()
): InfoMora {
  const hoy = normalizarFecha(fechaReferencia);

  if (
    prestamo.estado === "pagado" ||
    prestamo.cuotas_pagadas >= prestamo.total_cuotas
  ) {
    return {
      dias_atraso: 0,
      semaforo: "verde",
      fecha_proxima_cuota: hoy.toISOString().split("T")[0],
    };
  }

  const numeroCuotaPendiente = prestamo.cuotas_pagadas + 1;
  const fechaVencimiento = normalizarFecha(
    calcularFechaVencimientoCuota(prestamo, numeroCuotaPendiente)
  );

  const diffMs = hoy.getTime() - fechaVencimiento.getTime();
  const diasAtraso = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;

  return {
    dias_atraso: diasAtraso,
    semaforo: determinarSemaforo(diasAtraso),
    fecha_proxima_cuota: toIsoDate(fechaVencimiento),
    fecha_ultima_vencida: diasAtraso > 0 ? toIsoDate(fechaVencimiento) : undefined,
  };
}

/** Determina el estado del préstamo según cuotas pagadas y mora */
export function determinarEstado(
  prestamo: Prestamo,
  cuotasEquivalentes: number,
  mora?: InfoMora
): Prestamo["estado"] {
  if (cuotasEquivalentes >= prestamo.total_cuotas) return "pagado";
  if (mora && mora.dias_atraso > 0) return "atrasado";
  return "pendiente";
}

/** Aplica un abono y retorna el préstamo actualizado */
export function aplicarAbono(
  prestamo: Prestamo,
  abonos: Abono[],
  nuevoAbono: Omit<Abono, "id">
): { prestamoActualizado: Prestamo; abonosActualizados: Abono[] } {
  const abonoConId: Abono = {
    ...nuevoAbono,
    id: `abo-${Date.now()}`,
  };

  const abonosActualizados = [...abonos, abonoConId];
  const totalAbonado = abonosActualizados
    .filter((a) => a.prestamo_id === prestamo.id)
    .reduce((sum, a) => sum + a.monto_abonado, 0);

  const cuotasEquivalentes = calcularCuotasEquivalentes(prestamo, totalAbonado);
  const cuotas_pagadas = Math.min(cuotasEquivalentes, prestamo.total_cuotas);

  const prestamoTemp = { ...prestamo, cuotas_pagadas };
  const mora = calcularMora(prestamoTemp);
  const estado = determinarEstado(prestamo, cuotasEquivalentes, mora);

  return {
    prestamoActualizado: {
      ...prestamo,
      cuotas_pagadas,
      estado,
    },
    abonosActualizados,
  };
}

/** Compara dos semáforos y retorna el peor (rojo > amarillo > verde) */
const PRIORIDAD_SEMAFORO: Record<SemaforoMora, number> = {
  rojo: 3,
  amarillo: 2,
  verde: 1,
};

export function peorSemaforo(a: SemaforoMora, b: SemaforoMora): SemaforoMora {
  return PRIORIDAD_SEMAFORO[a] >= PRIORIDAD_SEMAFORO[b] ? a : b;
}
