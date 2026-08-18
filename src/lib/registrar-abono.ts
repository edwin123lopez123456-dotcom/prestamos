import type {
  AplicacionAbono,
  NuevoAbonoInput,
  PlanCuota,
  Prestamo,
  TipoAbono,
} from "@/types";
import {
  calcularMora,
  calcularSaldoPendiente,
  contarCuotasPagadas,
  crearCuotaInteres,
  cuotasPendientes,
  determinarEstado,
  totalInteresesPendientesPlan,
} from "@/lib/calculations";
import {
  calcularPendientesCuota,
  distribuirAbono,
  type DistribuirAbonoResult,
} from "@/lib/distribuir-abono";

const APLICACIONES_VALIDAS: AplicacionAbono[] = [
  "interes_y_capital",
  "solo_interes",
  "solo_capital",
];

export class ErrorRegistroAbono extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorRegistroAbono";
  }
}

export type InputRegistroAbono = NuevoAbonoInput & {
  metodo_pago?: string;
  aplicacion_abono?: AplicacionAbono;
  idempotency_key?: string;
};

/** Deriva aplicación del abono cuando solo viene tipo_abono (AbonoModal legacy) */
export function resolverAplicacionAbono(input: InputRegistroAbono): AplicacionAbono {
  if (input.aplicacion_abono) return input.aplicacion_abono;
  if (input.tipo_abono === "interes") return "solo_interes";
  if (input.tipo_abono === "capital") return "solo_capital";
  return "interes_y_capital";
}

export function totalCapitalPendienteEnCuotas(planCuotas: PlanCuota[]): number {
  return cuotasPendientes(planCuotas).reduce(
    (sum, cuota) => sum + calcularPendientesCuota(cuota).capital_pendiente,
    0
  );
}

export function debeAplicarCapitalDirectoAlPrestamo(
  prestamo: Prestamo,
  planCuotas: PlanCuota[],
  aplicacion: AplicacionAbono
): boolean {
  return (
    aplicacion === "solo_capital" &&
    prestamo.saldo_capital > 0 &&
    totalCapitalPendienteEnCuotas(planCuotas) <= 0
  );
}

export function validarPrecondicionesRegistroAbono(
  prestamo: Prestamo | undefined,
  planCuotas: PlanCuota[],
  input: InputRegistroAbono
): asserts prestamo is Prestamo {
  if (!prestamo) {
    throw new ErrorRegistroAbono("El préstamo no existe");
  }

  if (prestamo.id !== input.prestamo_id) {
    throw new ErrorRegistroAbono("El préstamo no coincide con el abono");
  }

  if (prestamo.estado === "pagado") {
    throw new ErrorRegistroAbono("El préstamo ya está pagado");
  }

  if (input.monto_abonado <= 0) {
    throw new ErrorRegistroAbono("El monto debe ser mayor a cero");
  }

  const aplicacion = resolverAplicacionAbono(input);
  if (!APLICACIONES_VALIDAS.includes(aplicacion)) {
    throw new ErrorRegistroAbono("La aplicación del abono no es válida");
  }

  const planDelPrestamo = planCuotas.filter((c) => c.prestamo_id === prestamo.id);

  if (planDelPrestamo.length === 0) {
    throw new ErrorRegistroAbono("El préstamo no tiene cuotas en el plan de pagos");
  }

  const capitalDirectoAlPrestamo = debeAplicarCapitalDirectoAlPrestamo(
    prestamo,
    planDelPrestamo,
    aplicacion
  );

  if (input.plan_cuota_id) {
    const cuota = planDelPrestamo.find((c) => c.id === input.plan_cuota_id);
    if (!cuota) {
      throw new ErrorRegistroAbono("La cuota indicada no pertenece a este préstamo");
    }
  }

  if (!capitalDirectoAlPrestamo) {
    const hayCuotasAplicables = cuotasPendientes(planDelPrestamo).some(
      (c) => calcularPendientesCuota(c).saldo_cuota > 0
    );

    if (!hayCuotasAplicables) {
      throw new ErrorRegistroAbono("No hay cuotas pendientes aplicables");
    }
  }
}

export function validarResultadoDistribucion(
  distribucion: DistribuirAbonoResult,
  montoRecibido: number
): void {
  if (!distribucion.valido) {
    throw new ErrorRegistroAbono(
      distribucion.errores.join(". ") || "No se pudo distribuir el abono"
    );
  }

  if (distribucion.monto_aplicado <= 0) {
    throw new ErrorRegistroAbono(
      "Ningún monto pudo aplicarse a las cuotas con la modalidad seleccionada"
    );
  }

  if (distribucion.monto_no_aplicado > 0) {
    throw new ErrorRegistroAbono(
      `El monto supera la deuda aplicable por $${distribucion.monto_no_aplicado.toLocaleString("es-CO")}`
    );
  }

  if (
    distribucion.monto_a_interes + distribucion.monto_a_capital !==
    distribucion.monto_aplicado
  ) {
    throw new ErrorRegistroAbono("Inconsistencia interna en la distribución del abono");
  }

  if (distribucion.monto_aplicado + distribucion.monto_no_aplicado !== montoRecibido) {
    throw new ErrorRegistroAbono("Inconsistencia interna entre monto recibido y aplicado");
  }
}

export interface PrestamoTrasAbono {
  cuotas_pagadas: number;
  saldo_capital: number;
  valor_cuota: number;
  estado: Prestamo["estado"];
  deuda_total: number;
  saldo_interes: number;
}

/**
 * Recalcula totales del préstamo a partir del plan actualizado.
 * saldo_capital no se modifica en abonos sobre plan_cuotas (sin RPC).
 * Ver informe: abonos a capital del préstamo (solo_interes clásico) pendiente de paso futuro.
 */
export function calcularPrestamoTrasAbono(
  prestamo: Prestamo,
  planActualizado: PlanCuota[]
): PrestamoTrasAbono {
  const cuotas_pagadas = contarCuotasPagadas(planActualizado);
  const prestamoTemp: Prestamo = { ...prestamo, cuotas_pagadas };
  const mora = calcularMora(prestamoTemp, planActualizado);
  const estado = determinarEstado(prestamoTemp, planActualizado, mora);
  const deuda_total = calcularSaldoPendiente(prestamoTemp, planActualizado);
  const interesesPendientes = totalInteresesPendientesPlan(planActualizado);

  return {
    cuotas_pagadas,
    saldo_capital: prestamo.saldo_capital,
    valor_cuota: prestamo.valor_cuota ?? 0,
    estado,
    deuda_total,
    saldo_interes: interesesPendientes,
  };
}

export interface PreparacionRegistroAbono {
  distribucion: DistribuirAbonoResult;
  planDelPrestamoActualizado: PlanCuota[];
  prestamoTrasAbono: PrestamoTrasAbono;
  abonoInsert: {
    prestamo_id: string;
    monto_abonado: number;
    fecha_abono: string;
    notas: string;
    tipo_abono: TipoAbono;
    plan_cuota_id: string | null;
    metodo_pago: string;
    aplicacion_abono: AplicacionAbono;
  };
  /** Desglose listo para futuras columnas en abonos (no persistido aún) */
  desgloseAbono: {
    monto_interes_aplicado: number;
    monto_capital_aplicado: number;
    monto_aplicado: number;
  };
}

/**
 * Valida, distribuye y prepara datos para persistir un abono.
 * Función pura — no escribe en Supabase.
 */
function prepararAbonoCapitalDirecto(
  prestamo: Prestamo,
  planCuotas: PlanCuota[],
  input: InputRegistroAbono,
  aplicacion: AplicacionAbono
): PreparacionRegistroAbono {
  if (input.monto_abonado > prestamo.saldo_capital) {
    const excedente = input.monto_abonado - prestamo.saldo_capital;
    throw new ErrorRegistroAbono(
      `El monto supera la deuda aplicable por $${excedente.toLocaleString("es-CO")}`
    );
  }

  const nuevoSaldoCapital = Math.max(0, prestamo.saldo_capital - input.monto_abonado);
  const prestamoActualizado: Prestamo = {
    ...prestamo,
    saldo_capital: nuevoSaldoCapital,
    valor_cuota: prestamo.valor_cuota ?? 0,
  };

  let planDelPrestamoActualizado = planCuotas
    .filter((c) => c.prestamo_id === prestamo.id)
    .filter((c) => !(c.tipo_cuota === "interes" && c.estado !== "pagada"))
    .map((c) => ({ ...c }));

  if (nuevoSaldoCapital > 0) {
    planDelPrestamoActualizado = [
      ...planDelPrestamoActualizado,
      crearCuotaInteres(prestamoActualizado, planDelPrestamoActualizado),
    ];
  }

  const distribucion: DistribuirAbonoResult = {
    valido: true,
    errores: [],
    plan_cuotas: planDelPrestamoActualizado,
    monto_recibido: input.monto_abonado,
    monto_aplicado: input.monto_abonado,
    monto_a_interes: 0,
    monto_a_capital: input.monto_abonado,
    monto_no_aplicado: 0,
    detalle: [],
    cuota_afectada_id: null,
    plan_cuota_id_solicitado: input.plan_cuota_id ?? null,
    abono_sugerido: {
      prestamo_id: input.prestamo_id,
      monto_abonado: input.monto_abonado,
      tipo_abono: "capital",
      plan_cuota_id: null,
      aplicacion_abono: aplicacion,
      monto_interes_aplicado: 0,
      monto_capital_aplicado: input.monto_abonado,
    },
  };

  return {
    distribucion,
    planDelPrestamoActualizado,
    prestamoTrasAbono: calcularPrestamoTrasAbono(prestamoActualizado, planDelPrestamoActualizado),
    abonoInsert: {
      prestamo_id: input.prestamo_id,
      monto_abonado: input.monto_abonado,
      fecha_abono: input.fecha_abono,
      notas: input.notas,
      tipo_abono: "capital",
      plan_cuota_id: null,
      metodo_pago: input.metodo_pago ?? "",
      aplicacion_abono: aplicacion,
    },
    desgloseAbono: {
      monto_interes_aplicado: 0,
      monto_capital_aplicado: input.monto_abonado,
      monto_aplicado: input.monto_abonado,
    },
  };
}

export function prepararRegistroAbono(
  prestamo: Prestamo | undefined,
  planCuotas: PlanCuota[],
  input: InputRegistroAbono
): PreparacionRegistroAbono {
  validarPrecondicionesRegistroAbono(prestamo, planCuotas, input);

  const planDelPrestamo = planCuotas.filter((c) => c.prestamo_id === prestamo.id);
  const aplicacion = resolverAplicacionAbono(input);

  if (debeAplicarCapitalDirectoAlPrestamo(prestamo, planDelPrestamo, aplicacion)) {
    return prepararAbonoCapitalDirecto(prestamo, planCuotas, input, aplicacion);
  }

  const distribucion = distribuirAbono({
    prestamo,
    plan_cuotas: planDelPrestamo,
    monto: input.monto_abonado,
    aplicacion_abono: aplicacion,
    plan_cuota_id: input.plan_cuota_id,
  });

  validarResultadoDistribucion(distribucion, input.monto_abonado);

  const prestamoTrasAbono = calcularPrestamoTrasAbono(
    prestamo,
    distribucion.plan_cuotas
  );

  const sugerido = distribucion.abono_sugerido!;

  return {
    distribucion,
    planDelPrestamoActualizado: distribucion.plan_cuotas,
    prestamoTrasAbono,
    abonoInsert: {
      prestamo_id: input.prestamo_id,
      monto_abonado: input.monto_abonado,
      fecha_abono: input.fecha_abono,
      notas: input.notas,
      tipo_abono: sugerido.tipo_abono,
      plan_cuota_id: sugerido.plan_cuota_id,
      metodo_pago: input.metodo_pago ?? "",
      aplicacion_abono: aplicacion,
    },
    desgloseAbono: {
      monto_interes_aplicado: distribucion.monto_a_interes,
      monto_capital_aplicado: distribucion.monto_a_capital,
      monto_aplicado: distribucion.monto_aplicado,
    },
  };
}
