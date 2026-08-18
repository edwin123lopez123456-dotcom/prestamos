import type {
  AplicacionAbono,
  EstadoPlanCuota,
  PlanCuota,
  Prestamo,
  TipoAbono,
} from "@/types";
import { cuotasPendientes } from "@/lib/calculations";

/** Cómo se interpretó el desglose interés/capital de una cuota */
export type ModoDesgloseCuota = "desglose" | "legacy_solo_interes" | "legacy_solo_capital";

export interface ComponentesCuota {
  interes_cuota: number;
  capital_cuota: number;
  modo: ModoDesgloseCuota;
}

export interface PendientesCuota {
  interes_pendiente: number;
  capital_pendiente: number;
  saldo_cuota: number;
}

export interface DistribuirAbonoInput {
  prestamo: Prestamo;
  plan_cuotas: PlanCuota[];
  monto: number;
  aplicacion_abono: AplicacionAbono;
  plan_cuota_id?: string | null;
}

export interface DetalleAplicacionCuota {
  cuota_id: string;
  numero_cuota: number;
  monto_interes: number;
  monto_capital: number;
  monto_total: number;
  interes_pendiente_antes: number;
  capital_pendiente_antes: number;
  interes_pendiente_despues: number;
  capital_pendiente_despues: number;
  estado_antes: EstadoPlanCuota;
  estado_despues: EstadoPlanCuota;
  modo_desglose: ModoDesgloseCuota;
}

export interface DistribuirAbonoResult {
  valido: boolean;
  errores: string[];
  plan_cuotas: PlanCuota[];
  monto_recibido: number;
  monto_aplicado: number;
  monto_a_interes: number;
  monto_a_capital: number;
  monto_no_aplicado: number;
  detalle: DetalleAplicacionCuota[];
  /** Primera cuota del plan que recibió dinero */
  cuota_afectada_id: string | null;
  /** Cuota usada como punto de inicio (puede no recibir dinero si ya estaba pagada) */
  plan_cuota_id_solicitado: string | null;
  /** Datos listos para construir el registro de abono (sin persistir) */
  abono_sugerido: {
    prestamo_id: string;
    monto_abonado: number;
    tipo_abono: TipoAbono;
    plan_cuota_id: string | null;
    aplicacion_abono: AplicacionAbono;
    monto_interes_aplicado: number;
    monto_capital_aplicado: number;
  } | null;
}

function clampNoNegativo(n: number): number {
  return Math.max(0, n);
}

/**
 * Resuelve interés/capital de una cuota.
 * Si no hay desglose válido, aplica estrategia legacy (sin inventar montos arbitrarios):
 * - tipo_cuota "interes" → todo el monto_cuota es interés
 * - otro caso → todo el monto_cuota es capital
 */
export function resolverComponentesCuota(cuota: PlanCuota): ComponentesCuota {
  const monto = cuota.monto_cuota;
  const sumaDesglose = cuota.interes_cuota + cuota.capital_cuota;

  if (
    cuota.interes_cuota > 0 &&
    cuota.capital_cuota >= 0 &&
    sumaDesglose === monto
  ) {
    return {
      interes_cuota: cuota.interes_cuota,
      capital_cuota: cuota.capital_cuota,
      modo: "desglose",
    };
  }

  if (cuota.tipo_cuota === "interes" && cuota.capital_cuota === 0) {
    return {
      interes_cuota: monto,
      capital_cuota: 0,
      modo: "legacy_solo_interes",
    };
  }

  return {
    interes_cuota: 0,
    capital_cuota: monto,
    modo: "legacy_solo_capital",
  };
}

/** Cuánto del monto_pagado corresponde a interés y capital */
export function obtenerPagadoDesglosado(
  cuota: PlanCuota,
  componentes: ComponentesCuota
): { pagado_interes: number; pagado_capital: number } {
  if (
    cuota.monto_pagado_interes != null &&
    cuota.monto_pagado_capital != null
  ) {
    return {
      pagado_interes: cuota.monto_pagado_interes,
      pagado_capital: cuota.monto_pagado_capital,
    };
  }

  /**
   * Legacy: sin desglose guardado, se asume que pagos previos siguieron
   * la regla interés → capital (equivalente a interes_y_capital).
   */
  const pagado_interes = Math.min(cuota.monto_pagado, componentes.interes_cuota);
  const pagado_capital = Math.min(
    Math.max(0, cuota.monto_pagado - componentes.interes_cuota),
    componentes.capital_cuota
  );

  return { pagado_interes, pagado_capital };
}

/** Calcula interés/capital/saldo pendiente según fórmulas del dominio */
export function calcularPendientesCuota(
  cuota: PlanCuota,
  componentes?: ComponentesCuota
): PendientesCuota {
  const comp = componentes ?? resolverComponentesCuota(cuota);
  const { pagado_interes, pagado_capital } = obtenerPagadoDesglosado(cuota, comp);

  const interes_pendiente = clampNoNegativo(comp.interes_cuota - pagado_interes);
  const capital_pendiente = clampNoNegativo(comp.capital_cuota - pagado_capital);

  return {
    interes_pendiente,
    capital_pendiente,
    saldo_cuota: interes_pendiente + capital_pendiente,
  };
}

function actualizarEstadoCuota(cuota: PlanCuota): EstadoPlanCuota {
  const saldo = clampNoNegativo(cuota.monto_cuota - cuota.monto_pagado);
  if (saldo <= 0) return "pagada";
  if (cuota.monto_pagado > 0) return "parcial";
  return "pendiente";
}

function mapAplicacionToTipoAbono(aplicacion: AplicacionAbono): TipoAbono {
  if (aplicacion === "solo_interes") return "interes";
  if (aplicacion === "solo_capital") return "capital";
  return "cuota";
}

function ordenarCuotasParaAplicacion(
  planCuotas: PlanCuota[],
  planCuotaId?: string | null
): PlanCuota[] {
  const pendientes = cuotasPendientes(planCuotas);

  if (!planCuotaId) return pendientes;

  const inicial = pendientes.filter((c) => c.id === planCuotaId);
  const resto = pendientes.filter((c) => c.id !== planCuotaId);
  return [...inicial, ...resto];
}

function aplicarMontoACuotaSegunRegla(
  cuota: PlanCuota,
  montoDisponible: number,
  aplicacion: AplicacionAbono,
  componentes: ComponentesCuota,
  pendientesAntes: PendientesCuota
): {
  cuotaActualizada: PlanCuota;
  monto_interes: number;
  monto_capital: number;
  monto_aplicado: number;
} {
  if (montoDisponible <= 0 || pendientesAntes.saldo_cuota <= 0) {
    return {
      cuotaActualizada: cuota,
      monto_interes: 0,
      monto_capital: 0,
      monto_aplicado: 0,
    };
  }

  let montoInteres = 0;
  let montoCapital = 0;
  let restante = montoDisponible;

  if (aplicacion === "solo_interes") {
    montoInteres = Math.min(restante, pendientesAntes.interes_pendiente);
  } else if (aplicacion === "solo_capital") {
    montoCapital = Math.min(restante, pendientesAntes.capital_pendiente);
  } else {
    montoInteres = Math.min(restante, pendientesAntes.interes_pendiente);
    restante -= montoInteres;
    montoCapital = Math.min(restante, pendientesAntes.capital_pendiente);
  }

  const montoAplicado = montoInteres + montoCapital;
  const pagadoPrevio = obtenerPagadoDesglosado(cuota, componentes);
  const nuevoPagadoInteres = pagadoPrevio.pagado_interes + montoInteres;
  const nuevoPagadoCapital = pagadoPrevio.pagado_capital + montoCapital;
  const nuevoMontoPagado = nuevoPagadoInteres + nuevoPagadoCapital;

  const cuotaActualizada: PlanCuota = {
    ...cuota,
    monto_pagado: nuevoMontoPagado,
    monto_pagado_interes: nuevoPagadoInteres,
    monto_pagado_capital: nuevoPagadoCapital,
    estado: actualizarEstadoCuota({
      ...cuota,
      monto_pagado: nuevoMontoPagado,
    }),
  };

  return {
    cuotaActualizada,
    monto_interes: montoInteres,
    monto_capital: montoCapital,
    monto_aplicado: montoAplicado,
  };
}

function resultadoInvalido(
  input: DistribuirAbonoInput,
  errores: string[]
): DistribuirAbonoResult {
  return {
    valido: false,
    errores,
    plan_cuotas: input.plan_cuotas.map((c) => ({ ...c })),
    monto_recibido: input.monto,
    monto_aplicado: 0,
    monto_a_interes: 0,
    monto_a_capital: 0,
    monto_no_aplicado: input.monto > 0 ? input.monto : 0,
    detalle: [],
    cuota_afectada_id: null,
    plan_cuota_id_solicitado: input.plan_cuota_id ?? null,
    abono_sugerido: null,
  };
}

/**
 * Motor puro de distribución de abonos sobre plan_cuotas.
 * No persiste en base de datos.
 */
export function distribuirAbono(input: DistribuirAbonoInput): DistribuirAbonoResult {
  const errores: string[] = [];

  if (input.monto < 0) {
    return resultadoInvalido(input, ["El monto no puede ser negativo"]);
  }

  if (input.monto === 0) {
    return resultadoInvalido(input, ["El monto debe ser mayor a cero"]);
  }

  if (input.prestamo.estado === "pagado") {
    return resultadoInvalido(input, ["El préstamo ya está pagado"]);
  }

  if (input.plan_cuota_id) {
    const existe = input.plan_cuotas.some((c) => c.id === input.plan_cuota_id);
    if (!existe) {
      return resultadoInvalido(input, ["La cuota indicada no existe en el plan"]);
    }
  }

  const mapa = new Map(input.plan_cuotas.map((c) => [c.id, { ...c }]));
  const ordenadas = ordenarCuotasParaAplicacion(input.plan_cuotas, input.plan_cuota_id);

  let restante = input.monto;
  let montoAInteres = 0;
  let montoACapital = 0;
  let cuotaAfectadaId: string | null = null;
  const detalle: DetalleAplicacionCuota[] = [];

  for (const cuotaRef of ordenadas) {
    if (restante <= 0) break;

    const cuota = mapa.get(cuotaRef.id)!;
    const componentes = resolverComponentesCuota(cuota);
    const pendientesAntes = calcularPendientesCuota(cuota, componentes);

    if (pendientesAntes.saldo_cuota <= 0) continue;

    const {
      cuotaActualizada,
      monto_interes,
      monto_capital,
      monto_aplicado,
    } = aplicarMontoACuotaSegunRegla(
      cuota,
      restante,
      input.aplicacion_abono,
      componentes,
      pendientesAntes
    );

    if (monto_aplicado <= 0) continue;

    mapa.set(cuota.id, cuotaActualizada);
    restante -= monto_aplicado;
    montoAInteres += monto_interes;
    montoACapital += monto_capital;

    if (!cuotaAfectadaId) {
      cuotaAfectadaId = cuota.id;
    }

    const pendientesDespues = calcularPendientesCuota(cuotaActualizada, componentes);

    detalle.push({
      cuota_id: cuota.id,
      numero_cuota: cuota.numero_cuota,
      monto_interes,
      monto_capital,
      monto_total: monto_aplicado,
      interes_pendiente_antes: pendientesAntes.interes_pendiente,
      capital_pendiente_antes: pendientesAntes.capital_pendiente,
      interes_pendiente_despues: pendientesDespues.interes_pendiente,
      capital_pendiente_despues: pendientesDespues.capital_pendiente,
      estado_antes: cuota.estado,
      estado_despues: cuotaActualizada.estado,
      modo_desglose: componentes.modo,
    });
  }

  const montoAplicado = montoAInteres + montoACapital;
  const montoNoAplicado = restante;

  const planActualizado = input.plan_cuotas.map((c) => mapa.get(c.id)!);

  return {
    valido: true,
    errores,
    plan_cuotas: planActualizado,
    monto_recibido: input.monto,
    monto_aplicado: montoAplicado,
    monto_a_interes: montoAInteres,
    monto_a_capital: montoACapital,
    monto_no_aplicado: montoNoAplicado,
    detalle,
    cuota_afectada_id: cuotaAfectadaId,
    plan_cuota_id_solicitado: input.plan_cuota_id ?? null,
    abono_sugerido: {
      prestamo_id: input.prestamo.id,
      monto_abonado: input.monto,
      tipo_abono: mapAplicacionToTipoAbono(input.aplicacion_abono),
      plan_cuota_id: cuotaAfectadaId,
      aplicacion_abono: input.aplicacion_abono,
      monto_interes_aplicado: montoAInteres,
      monto_capital_aplicado: montoACapital,
    },
  };
}
