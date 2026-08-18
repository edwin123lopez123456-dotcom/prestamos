import type {
  Abono,
  FrecuenciaPago,
  InfoMora,
  PlanCuota,
  Prestamo,
  SemaforoMora,
  TipoAbono,
} from "@/types";

/** Suma periodos según frecuencia de pago a una fecha base */
export function sumarPeriodo(
  fecha: Date,
  frecuencia: FrecuenciaPago,
  periodos: number
): Date {
  const result = new Date(fecha);
  switch (frecuencia) {
    case "diario":
      result.setDate(result.getDate() + periodos);
      break;
    case "semanal":
      result.setDate(result.getDate() + periodos * 7);
      break;
    case "quincenal":
      result.setDate(result.getDate() + periodos * 15);
      break;
    case "mensual":
      result.setMonth(result.getMonth() + periodos);
      break;
  }
  return result;
}

export function toIsoDate(fecha: Date): string {
  return fecha.toISOString().split("T")[0];
}

function normalizarFecha(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function determinarSemaforo(diasAtraso: number): SemaforoMora {
  if (diasAtraso <= 0) return "verde";
  if (diasAtraso <= 7) return "amarillo";
  return "rojo";
}

/** Saldo pendiente de una cuota del plan */
export function saldoCuotaPlan(cuota: PlanCuota): number {
  return Math.max(0, cuota.monto_cuota - cuota.monto_pagado);
}

/** Interés aún pendiente de la cuota (según interes_cuota del plan) */
export function interesPendienteCuota(cuota: PlanCuota): number {
  if (cuota.interes_cuota > 0) {
    return Math.max(
      0,
      cuota.interes_cuota - Math.min(cuota.monto_pagado, cuota.interes_cuota)
    );
  }
  if (cuota.tipo_cuota === "interes") {
    return saldoCuotaPlan(cuota);
  }
  return 0;
}

/** Suma de interés pendiente en todas las cuotas no pagadas del plan */
export function totalInteresesPendientesPlan(planCuotas: PlanCuota[]): number {
  return planCuotas
    .filter((c) => c.estado !== "pagada")
    .reduce((sum, c) => sum + interesPendienteCuota(c), 0);
}

/** Cuántas cuotas se pueden seleccionar para cobrar */
export function maxCuotasSeleccionables(
  prestamo: Prestamo,
  planCuotas: PlanCuota[]
): number {
  const pendientes = cuotasPendientes(planCuotas);
  const pagadas = planCuotas.filter((c) => c.estado === "pagada").length;
  const desdePrestamo =
    prestamo.total_cuotas != null
      ? Math.max(0, prestamo.total_cuotas - pagadas)
      : pendientes.length;
  return Math.max(1, pendientes.length, desdePrestamo);
}

/** Monto fijo de interés por período (modalidad solo intereses) */
export function obtenerMontoInteresPeriodo(prestamo: Prestamo): number {
  return prestamo.valor_cuota ?? 0;
}

/** @deprecated Usar obtenerMontoInteresPeriodo para solo_interes con monto fijo */
export function calcularInteresPeriodo(
  saldoCapital: number,
  tasaInteres: number
): number {
  return Math.round(saldoCapital * (tasaInteres / 100));
}

/** Total a pagar en cuotas fijas = valor_cuota × total_cuotas */
export function calcularTotalCuotasFijas(
  valorCuota: number,
  totalCuotas: number
): number {
  return valorCuota * totalCuotas;
}

/** Cuotas pendientes o parciales ordenadas por vencimiento */
export function cuotasPendientes(planCuotas: PlanCuota[]): PlanCuota[] {
  return [...planCuotas]
    .filter((c) => c.estado !== "pagada")
    .sort(
      (a, b) =>
        new Date(a.fecha_vencimiento).getTime() -
        new Date(b.fecha_vencimiento).getTime()
    );
}

/** Cuota pendiente más antigua */
export function cuotaPendienteMasAntigua(
  planCuotas: PlanCuota[]
): PlanCuota | null {
  return cuotasPendientes(planCuotas)[0] ?? null;
}

/** Saldo total pendiente según tipo de préstamo */
export function calcularSaldoPendiente(
  prestamo: Prestamo,
  planCuotas: PlanCuota[]
): number {
  if (prestamo.estado === "pagado") return 0;

  if (prestamo.tipo_prestamo === "solo_interes") {
    const interesPendiente = planCuotas
      .filter((c) => c.tipo_cuota === "interes" && c.estado !== "pagada")
      .reduce((sum, c) => sum + saldoCuotaPlan(c), 0);
    return prestamo.saldo_capital + interesPendiente;
  }

  // cuotas_fijas y cuotas_manuales: suma de saldos en plan_cuotas
  return planCuotas
    .filter((c) => c.estado !== "pagada")
    .reduce((sum, c) => sum + saldoCuotaPlan(c), 0);
}

/** Mora basada en cuotas del plan con saldo pendiente vencidas */
export function calcularMora(
  prestamo: Prestamo,
  planCuotas: PlanCuota[],
  fechaReferencia: Date = new Date()
): InfoMora {
  const hoy = normalizarFecha(fechaReferencia);

  if (prestamo.estado === "pagado") {
    return {
      dias_atraso: 0,
      semaforo: "verde",
      fecha_proxima_cuota: toIsoDate(hoy),
    };
  }

  const pendientes = cuotasPendientes(planCuotas);
  const proxima = pendientes[0];

  if (!proxima) {
    return {
      dias_atraso: 0,
      semaforo: "verde",
      fecha_proxima_cuota: toIsoDate(hoy),
    };
  }

  const fechaVencimiento = normalizarFecha(
    new Date(`${proxima.fecha_vencimiento}T00:00:00`)
  );
  const diffMs = hoy.getTime() - fechaVencimiento.getTime();
  const diasAtraso =
    diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;

  return {
    dias_atraso: diasAtraso,
    semaforo: determinarSemaforo(diasAtraso),
    fecha_proxima_cuota: proxima.fecha_vencimiento,
    fecha_ultima_vencida: diasAtraso > 0 ? proxima.fecha_vencimiento : undefined,
  };
}

export function determinarEstado(
  prestamo: Prestamo,
  planCuotas: PlanCuota[],
  mora?: InfoMora
): Prestamo["estado"] {
  if (prestamo.tipo_prestamo === "solo_interes") {
    if (prestamo.saldo_capital <= 0) return "pagado";
  } else {
    const todasPagadas =
      planCuotas.length > 0 &&
      planCuotas.every((c) => c.estado === "pagada");
    if (todasPagadas) return "pagado";
  }

  if (mora && mora.dias_atraso > 0) return "atrasado";
  return "pendiente";
}

/** Cuántas cuotas manuales están completamente pagadas */
export function contarCuotasPagadas(planCuotas: PlanCuota[]): number {
  return planCuotas.filter((c) => c.estado === "pagada").length;
}

function actualizarEstadoCuota(cuota: PlanCuota): PlanCuota {
  const saldo = saldoCuotaPlan(cuota);
  let estado = cuota.estado;
  if (saldo <= 0) estado = "pagada";
  else if (cuota.monto_pagado > 0) estado = "parcial";
  else estado = "pendiente";
  return { ...cuota, estado };
}

/** Aplica monto a una cuota; el excedente se devuelve */
function aplicarMontoACuota(cuota: PlanCuota, monto: number): {
  cuotaActualizada: PlanCuota;
  excedente: number;
} {
  const saldo = saldoCuotaPlan(cuota);
  const aplicado = Math.min(monto, saldo);
  const cuotaActualizada = actualizarEstadoCuota({
    ...cuota,
    monto_pagado: cuota.monto_pagado + aplicado,
  });
  return {
    cuotaActualizada,
    excedente: monto - aplicado,
  };
}

/** Aplica abono en cascada a cuotas pendientes (más antigua primero) */
function aplicarAbonoACuotasPlan(
  planCuotas: PlanCuota[],
  monto: number,
  cuotaInicialId?: string | null
): { planActualizado: PlanCuota[]; cuotaAfectadaId: string | null } {
  let restante = monto;
  let cuotaAfectadaId: string | null = null;
  const pendientes = cuotasPendientes(planCuotas);

  const ordenadas = cuotaInicialId
    ? [
        ...pendientes.filter((c) => c.id === cuotaInicialId),
        ...pendientes.filter((c) => c.id !== cuotaInicialId),
      ]
    : pendientes;

  const mapa = new Map(planCuotas.map((c) => [c.id, { ...c }]));

  for (const cuota of ordenadas) {
    if (restante <= 0) break;
    const actual = mapa.get(cuota.id)!;
    const { cuotaActualizada, excedente } = aplicarMontoACuota(actual, restante);
    mapa.set(cuota.id, cuotaActualizada);
    if (!cuotaAfectadaId && cuotaActualizada.monto_pagado > actual.monto_pagado) {
      cuotaAfectadaId = cuota.id;
    }
    restante = excedente;
  }

  return {
    planActualizado: planCuotas.map((c) => mapa.get(c.id)!),
    cuotaAfectadaId,
  };
}

/** Genera la siguiente cuota de interés */
export function crearCuotaInteres(
  prestamo: Prestamo,
  planCuotas: PlanCuota[],
  fechaBase?: string
): PlanCuota {
  const cuotasInteres = planCuotas.filter((c) => c.tipo_cuota === "interes");
  const numeroCuota =
    cuotasInteres.length > 0
      ? Math.max(...cuotasInteres.map((c) => c.numero_cuota)) + 1
      : 1;

  const ultimaFecha =
    fechaBase ??
    (cuotasInteres.length > 0
      ? cuotasInteres.sort((a, b) => b.numero_cuota - a.numero_cuota)[0]
          .fecha_vencimiento
      : prestamo.fecha_inicio);

  const fechaVencimiento = toIsoDate(
    sumarPeriodo(new Date(`${ultimaFecha}T00:00:00`), prestamo.frecuencia, 1)
  );

  const montoInteres = obtenerMontoInteresPeriodo(prestamo);

  return {
    id: `tmp-${Date.now()}-${numeroCuota}`,
    prestamo_id: prestamo.id,
    numero_cuota: numeroCuota,
    monto_cuota: montoInteres,
    interes_cuota: montoInteres,
    capital_cuota: 0,
    fecha_vencimiento: fechaVencimiento,
    monto_pagado: 0,
    estado: "pendiente",
    tipo_cuota: "interes",
  };
}

/** Asegura que exista al menos una cuota de interés pendiente */
export function asegurarCuotaInteresPendiente(
  prestamo: Prestamo,
  planCuotas: PlanCuota[]
): PlanCuota[] {
  if (prestamo.estado === "pagado" || prestamo.saldo_capital <= 0) {
    return planCuotas;
  }

  const hayPendiente = planCuotas.some(
    (c) => c.tipo_cuota === "interes" && c.estado !== "pagada"
  );

  if (hayPendiente) {
    return planCuotas.map((c) => {
      if (c.tipo_cuota === "interes" && c.estado !== "pagada") {
        const monto = obtenerMontoInteresPeriodo(prestamo);
        return { ...c, monto_cuota: monto };
      }
      return c;
    });
  }

  return [...planCuotas, crearCuotaInteres(prestamo, planCuotas)];
}

export interface ResultadoAbono {
  prestamoActualizado: Prestamo;
  planCuotasActualizado: PlanCuota[];
  abono: Omit<Abono, "id">;
  nuevaCuotaInteres?: PlanCuota | null;
}

/** Aplica un abono según tipo de préstamo y tipo de abono */
export function aplicarAbono(
  prestamo: Prestamo,
  planCuotas: PlanCuota[],
  input: {
    monto_abonado: number;
    fecha_abono: string;
    notas: string;
    tipo_abono: TipoAbono;
    plan_cuota_id?: string | null;
  }
): ResultadoAbono {
  const abonoBase = {
    prestamo_id: prestamo.id,
    monto_abonado: input.monto_abonado,
    fecha_abono: input.fecha_abono,
    notas: input.notas,
    tipo_abono: input.tipo_abono,
    plan_cuota_id: input.plan_cuota_id ?? null,
    metodo_pago: "",
    aplicacion_abono: "interes_y_capital" as const,
  };

  if (
    prestamo.tipo_prestamo === "cuotas_manuales" ||
    prestamo.tipo_prestamo === "cuotas_fijas"
  ) {
    const { planActualizado, cuotaAfectadaId } = aplicarAbonoACuotasPlan(
      planCuotas,
      input.monto_abonado,
      input.plan_cuota_id
    );

    const cuotas_pagadas = contarCuotasPagadas(planActualizado);
    const prestamoTemp: Prestamo = {
      ...prestamo,
      cuotas_pagadas,
    };
    const mora = calcularMora(prestamoTemp, planActualizado);
    const estado = determinarEstado(prestamoTemp, planActualizado, mora);

    return {
      prestamoActualizado: { ...prestamoTemp, estado },
      planCuotasActualizado: planActualizado,
      abono: { ...abonoBase, tipo_abono: "cuota", plan_cuota_id: cuotaAfectadaId },
    };
  }

  if (input.tipo_abono === "capital") {
    const nuevoSaldoCapital = Math.max(
      0,
      prestamo.saldo_capital - input.monto_abonado
    );

    let planActualizado = planCuotas
      .filter((c) => !(c.tipo_cuota === "interes" && c.estado !== "pagada"))
      .map((c) => ({ ...c }));

    const prestamoActualizado: Prestamo = {
      ...prestamo,
      saldo_capital: nuevoSaldoCapital,
      valor_cuota: obtenerMontoInteresPeriodo(prestamo),
    };

    let nuevaCuotaInteres: PlanCuota | null = null;

    if (nuevoSaldoCapital > 0) {
      nuevaCuotaInteres = crearCuotaInteres(prestamoActualizado, planActualizado);
      planActualizado = [...planActualizado, nuevaCuotaInteres];
    }

    const mora = calcularMora(prestamoActualizado, planActualizado);
    const estado = determinarEstado(prestamoActualizado, planActualizado, mora);

    return {
      prestamoActualizado: { ...prestamoActualizado, estado },
      planCuotasActualizado: planActualizado,
      abono: { ...abonoBase, tipo_abono: "capital", plan_cuota_id: null },
      nuevaCuotaInteres,
    };
  }

  const cuotaInteresId =
    input.plan_cuota_id ??
    cuotaPendienteMasAntigua(
      planCuotas.filter((c) => c.tipo_cuota === "interes")
    )?.id;

  const { planActualizado: planConPago, cuotaAfectadaId } =
    aplicarAbonoACuotasPlan(planCuotas, input.monto_abonado, cuotaInteresId);

  let planActualizado = planConPago;
  const prestamoActualizado: Prestamo = { ...prestamo };
  let nuevaCuotaInteres: PlanCuota | null = null;

  const cuotaPagada = cuotaAfectadaId
    ? planActualizado.find((c) => c.id === cuotaAfectadaId)
    : null;

  if (cuotaPagada?.estado === "pagada" && prestamo.saldo_capital > 0) {
    nuevaCuotaInteres = crearCuotaInteres(prestamoActualizado, planActualizado);
    planActualizado = [...planActualizado, nuevaCuotaInteres];
  } else {
    planActualizado = asegurarCuotaInteresPendiente(
      prestamoActualizado,
      planActualizado
    );
  }

  const mora = calcularMora(prestamoActualizado, planActualizado);
  const estado = determinarEstado(prestamoActualizado, planActualizado, mora);

  return {
    prestamoActualizado: { ...prestamoActualizado, estado },
    planCuotasActualizado: planActualizado,
    abono: {
      ...abonoBase,
      tipo_abono: "interes",
      plan_cuota_id: cuotaAfectadaId,
    },
    nuevaCuotaInteres,
  };
}

/** Construye cuotas fijas tradicionales con fechas automáticas */
export function construirPlanCuotasFijas(
  prestamoId: string,
  valorCuota: number,
  totalCuotas: number,
  frecuencia: FrecuenciaPago,
  fechaInicio: string
): Omit<PlanCuota, "id">[] {
  const inicio = new Date(`${fechaInicio}T00:00:00`);
  return Array.from({ length: totalCuotas }, (_, index) => ({
    prestamo_id: prestamoId,
    numero_cuota: index + 1,
    monto_cuota: valorCuota,
    interes_cuota: 0,
    capital_cuota: valorCuota,
    fecha_vencimiento: toIsoDate(sumarPeriodo(inicio, frecuencia, index + 1)),
    monto_pagado: 0,
    estado: "pendiente" as const,
    tipo_cuota: "fija" as const,
  }));
}

/** Construye cuotas manuales para insertar al crear préstamo */
export function construirPlanCuotasManual(
  prestamoId: string,
  cuotas: { monto: number; fecha_vencimiento: string }[]
): Omit<PlanCuota, "id">[] {
  return cuotas.map((c, index) => ({
    prestamo_id: prestamoId,
    numero_cuota: index + 1,
    monto_cuota: c.monto,
    interes_cuota: 0,
    capital_cuota: c.monto,
    fecha_vencimiento: c.fecha_vencimiento,
    monto_pagado: 0,
    estado: "pendiente" as const,
    tipo_cuota: "manual" as const,
  }));
}

/** Primera cuota de interés al crear préstamo solo intereses */
export function construirPrimeraCuotaInteres(
  prestamo: Prestamo
): Omit<PlanCuota, "id"> {
  const montoInteres = obtenerMontoInteresPeriodo(prestamo);
  const fechaVencimiento = toIsoDate(
    sumarPeriodo(
      new Date(`${prestamo.fecha_inicio}T00:00:00`),
      prestamo.frecuencia,
      1
    )
  );

  return {
    prestamo_id: prestamo.id,
    numero_cuota: 1,
    monto_cuota: montoInteres,
    interes_cuota: montoInteres,
    capital_cuota: 0,
    fecha_vencimiento: fechaVencimiento,
    monto_pagado: 0,
    estado: "pendiente",
    tipo_cuota: "interes",
  };
}

const PRIORIDAD_SEMAFORO: Record<SemaforoMora, number> = {
  rojo: 3,
  amarillo: 2,
  verde: 1,
};

export function peorSemaforo(a: SemaforoMora, b: SemaforoMora): SemaforoMora {
  return PRIORIDAD_SEMAFORO[a] >= PRIORIDAD_SEMAFORO[b] ? a : b;
}
