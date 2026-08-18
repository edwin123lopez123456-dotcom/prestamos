import type {
  CuotaSimulada,
  FrecuenciaPago,
  SimulacionCredito,
  TipoInteres,
} from "@/types";
import { sumarPeriodo, toIsoDate } from "@/lib/calculations";

export interface ParametrosSimulacion {
  monto_prestado: number;
  tipo_interes: TipoInteres;
  tasa_interes: number;
  valor_cuota_deseada: number | null;
  total_cuotas: number;
  frecuencia: FrecuenciaPago;
  fecha_inicio: string;
}

function redondear(n: number): number {
  return Math.round(n);
}

/** Cuota fija tipo banco: PMT = P * r(1+r)^n / ((1+r)^n - 1) */
function calcularCuotaFija(capital: number, tasaPeriodo: number, periodos: number): number {
  if (tasaPeriodo <= 0) return redondear(capital / periodos);
  const factor = Math.pow(1 + tasaPeriodo, periodos);
  return redondear((capital * tasaPeriodo * factor) / (factor - 1));
}

function simularCompuestoBancario(params: ParametrosSimulacion): CuotaSimulada[] {
  const tasa = params.tasa_interes / 100;
  const n = params.total_cuotas;
  const cuota =
    params.valor_cuota_deseada && params.valor_cuota_deseada > 0
      ? params.valor_cuota_deseada
      : calcularCuotaFija(params.monto_prestado, tasa, n);

  const inicio = new Date(`${params.fecha_inicio}T00:00:00`);
  let saldo = params.monto_prestado;
  const cuotas: CuotaSimulada[] = [];

  for (let i = 0; i < n; i++) {
    const interes = redondear(saldo * tasa);
    let abonoCapital = redondear(cuota - interes);
    if (i === n - 1) abonoCapital = saldo;
    const cuotaTotal = redondear(abonoCapital + interes);
    saldo = Math.max(0, saldo - abonoCapital);

    cuotas.push({
      numero: i + 1,
      fecha_vencimiento: toIsoDate(sumarPeriodo(inicio, params.frecuencia, i + 1)),
      capital: abonoCapital,
      interes,
      cuota_total: cuotaTotal,
      saldo_restante: saldo,
    });
  }

  return cuotas;
}

function simularInteresPeriodico(
  params: ParametrosSimulacion,
  sobreSaldoActual: boolean
): CuotaSimulada[] {
  const tasa = params.tasa_interes / 100;
  const n = params.total_cuotas;
  const inicio = new Date(`${params.fecha_inicio}T00:00:00`);
  const saldo = params.monto_prestado;
  const cuotas: CuotaSimulada[] = [];

  for (let i = 0; i < n; i++) {
    const base = sobreSaldoActual ? saldo : params.monto_prestado;
    const interes =
      params.valor_cuota_deseada && params.valor_cuota_deseada > 0
        ? params.valor_cuota_deseada
        : redondear(base * tasa);

    cuotas.push({
      numero: i + 1,
      fecha_vencimiento: toIsoDate(sumarPeriodo(inicio, params.frecuencia, i + 1)),
      capital: 0,
      interes,
      cuota_total: interes,
      saldo_restante: saldo,
    });

    if (sobreSaldoActual && i < n - 1) {
      // saldo se mantiene hasta abono a capital
    }
  }

  return cuotas;
}

export function simularCredito(params: ParametrosSimulacion): SimulacionCredito {
  if (params.monto_prestado <= 0 || params.total_cuotas <= 0) {
    return {
      cuotas: [],
      total_intereses: 0,
      total_pagar: 0,
      valor_cuota: 0,
      tasa_efectiva: params.tasa_interes,
    };
  }

  let cuotas: CuotaSimulada[];

  switch (params.tipo_interes) {
    case "compuesto_bancario":
      cuotas = simularCompuestoBancario(params);
      break;
    case "cada_cuota":
      cuotas = simularInteresPeriodico(params, true);
      break;
    case "capital_inicial":
    default:
      cuotas = simularInteresPeriodico(params, false);
      break;
  }

  const totalIntereses = cuotas.reduce((s, c) => s + c.interes, 0);
  const totalPagar =
    params.tipo_interes === "compuesto_bancario"
      ? cuotas.reduce((s, c) => s + c.cuota_total, 0)
      : params.monto_prestado + totalIntereses;

  return {
    cuotas,
    total_intereses: totalIntereses,
    total_pagar: totalPagar,
    valor_cuota: cuotas[0]?.cuota_total ?? 0,
    tasa_efectiva: params.tasa_interes,
  };
}

export function planDesdeSimulacion(
  prestamoId: string,
  simulacion: SimulacionCredito,
  tipoInteres: TipoInteres
) {
  return simulacion.cuotas.map((c) => ({
    prestamo_id: prestamoId,
    numero_cuota: c.numero,
    monto_cuota: c.cuota_total,
    interes_cuota: c.interes,
    capital_cuota: c.capital,
    fecha_vencimiento: c.fecha_vencimiento,
    monto_pagado: 0,
    estado: "pendiente" as const,
    tipo_cuota: (tipoInteres === "compuesto_bancario" ? "fija" : "interes") as
      | "fija"
      | "interes",
  }));
}

export const LABEL_TIPO_INTERES: Record<TipoInteres, string> = {
  capital_inicial: "Sobre capital inicial",
  cada_cuota: "Sobre cada cuota (saldo)",
  compuesto_bancario: "Compuesto bancario",
};

export const LABEL_APLICACION_ABONO = {
  interes_y_capital: "Interés y capital",
  solo_interes: "Solo interés",
  solo_capital: "Solo capital",
} as const;
