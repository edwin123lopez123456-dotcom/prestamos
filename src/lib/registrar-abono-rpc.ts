import type {
  Abono,
  AplicacionAbono,
  PlanCuota,
  Prestamo,
  TipoAbono,
} from "@/types";
import { resolverAplicacionAbono, type InputRegistroAbono } from "@/lib/registrar-abono";

export interface RegistrarAbonoRpcResponse {
  ok: boolean;
  idempotent_replay: boolean;
  abono: Record<string, unknown>;
  prestamo: Record<string, unknown>;
  plan_cuotas: Record<string, unknown>[];
  desglose: {
    monto_aplicado: number;
    monto_interes_aplicado: number;
    monto_capital_aplicado: number;
    monto_no_aplicado: number;
  };
}

export function buildRegistrarAbonoRpcParams(
  input: InputRegistroAbono,
  idempotencyKey: string
): Record<string, unknown> {
  const aplicacion = resolverAplicacionAbono(input);
  return {
    p_prestamo_id: input.prestamo_id,
    p_monto_abonado: input.monto_abonado,
    p_fecha_abono: input.fecha_abono,
    p_notas: input.notas ?? "",
    p_tipo_abono: input.tipo_abono,
    p_aplicacion_abono: aplicacion,
    p_plan_cuota_id: input.plan_cuota_id ?? null,
    p_metodo_pago: input.metodo_pago ?? "",
    p_idempotency_key: idempotencyKey,
  };
}

export function parseRpcAbono(row: Record<string, unknown>): Abono {
  return {
    id: String(row.id),
    prestamo_id: String(row.prestamo_id),
    monto_abonado: Number(row.monto_abonado),
    fecha_abono: String(row.fecha_abono).slice(0, 10),
    notas: String(row.notas ?? ""),
    tipo_abono: (row.tipo_abono as TipoAbono) ?? "cuota",
    plan_cuota_id: row.plan_cuota_id ? String(row.plan_cuota_id) : null,
    metodo_pago: String(row.metodo_pago ?? ""),
    aplicacion_abono:
      (row.aplicacion_abono as AplicacionAbono) ?? "interes_y_capital",
  };
}

export function parseRpcPlanCuota(
  row: Record<string, unknown>,
  prestamo: Pick<Prestamo, "tipo_prestamo" | "tipo_interes">
): PlanCuota {
  const interes = Number(row.interes_cuota ?? 0);
  const capital = Number(row.capital_cuota ?? 0);
  const monto = Number(row.monto_cuota ?? 0);

  let interes_cuota = interes;
  let capital_cuota = capital;

  if (interes === 0 && capital === 0 && monto > 0) {
    if (prestamo.tipo_prestamo === "solo_interes") {
      interes_cuota = monto;
      capital_cuota = 0;
    } else {
      interes_cuota = 0;
      capital_cuota = monto;
    }
  }

  return {
    id: String(row.id),
    prestamo_id: String(row.prestamo_id),
    numero_cuota: Number(row.numero_cuota),
    monto_cuota: monto,
    interes_cuota,
    capital_cuota,
    fecha_vencimiento: String(row.fecha_vencimiento).slice(0, 10),
    monto_pagado: Number(row.monto_pagado ?? 0),
    monto_pagado_interes: Number(row.monto_pagado_interes ?? 0),
    monto_pagado_capital: Number(row.monto_pagado_capital ?? 0),
    estado: row.estado as PlanCuota["estado"],
    tipo_cuota: (row.tipo_cuota as PlanCuota["tipo_cuota"]) ?? "manual",
  };
}

export function parseRegistrarAbonoRpcResponse(
  data: RegistrarAbonoRpcResponse,
  prestamoBase: Prestamo,
  otrosPlanes: PlanCuota[]
): {
  prestamoActualizado: Prestamo;
  planCuotasActualizado: PlanCuota[];
  abono: Abono;
  idempotentReplay: boolean;
} {
  const prestamoRpc = data.prestamo;
  const prestamoActualizado: Prestamo = {
    ...prestamoBase,
    cuotas_pagadas: Number(prestamoRpc.cuotas_pagadas ?? prestamoBase.cuotas_pagadas),
    saldo_capital: Number(prestamoRpc.saldo_capital ?? prestamoBase.saldo_capital),
    valor_cuota:
      prestamoRpc.valor_cuota != null
        ? Number(prestamoRpc.valor_cuota)
        : prestamoBase.valor_cuota,
    estado: (prestamoRpc.estado as Prestamo["estado"]) ?? prestamoBase.estado,
  };

  const planDelPrestamo = (data.plan_cuotas ?? []).map((row) =>
    parseRpcPlanCuota(row, prestamoActualizado)
  );

  return {
    prestamoActualizado,
    planCuotasActualizado: [...otrosPlanes, ...planDelPrestamo],
    abono: parseRpcAbono(data.abono),
    idempotentReplay: Boolean(data.idempotent_replay),
  };
}

export function extractRpcErrorMessage(error: { message?: string } | null): string {
  const raw = error?.message ?? "Error al registrar abono";
  const match = raw.match(/RAE\d{3}:\s*(.+)/);
  return match?.[1]?.trim() ?? raw;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
