import { supabase } from "@/lib/supabase";
import type {
  Abono,
  AplicacionAbono,
  Cliente,
  NuevoAbonoInput,
  NuevoPrestamoInput,
  NuevoPrestamoSimuladoInput,
  PlanCuota,
  Prestamo,
} from "@/types";
import {
  aplicarAbono,
  construirPlanCuotasFijas,
  construirPlanCuotasManual,
  construirPrimeraCuotaInteres,
} from "@/lib/calculations";
import { planDesdeSimulacion, simularCredito } from "@/lib/loan-simulator";

function mapCliente(row: Record<string, unknown>): Cliente {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    telefono: String(row.telefono ?? ""),
    descripcion: String(row.descripcion ?? ""),
    fecha_registro: String(row.fecha_registro).slice(0, 10),
    activo: row.activo !== false,
  };
}

function leerFrecuencia(row: Record<string, unknown>): Prestamo["frecuencia"] {
  const val = row.frecuencia ?? row.frecuencia_pago;
  return (String(val ?? "mensual") as Prestamo["frecuencia"]);
}

function calcularDeudaTotal(payload: Record<string, unknown>): number {
  if (payload.deuda_total != null) return Number(payload.deuda_total);
  if (payload.total_pagar != null) return Number(payload.total_pagar);
  const monto = Number(payload.monto_prestado ?? 0);
  const valorCuota = Number(payload.valor_cuota ?? 0);
  const totalCuotas = Number(payload.total_cuotas ?? 0);
  if (valorCuota > 0 && totalCuotas > 0) {
    return Math.round(valorCuota * totalCuotas);
  }
  return monto;
}

function calcularSaldoInteres(
  payload: Record<string, unknown>,
  deudaTotal: number
): number {
  if (payload.saldo_interes != null) return Number(payload.saldo_interes);
  if (payload.total_intereses != null) return Number(payload.total_intereses);
  const monto = Number(payload.monto_prestado ?? 0);
  return Math.max(0, deudaTotal - monto);
}

function inferirTipoInteres(payload: Record<string, unknown>): string {
  if (payload.tipo_interes != null && String(payload.tipo_interes).trim() !== "") {
    return String(payload.tipo_interes);
  }
  if (payload.tipo_prestamo === "cuotas_fijas") return "compuesto_bancario";
  if (payload.tipo_prestamo === "solo_interes") return "cada_cuota";
  return "capital_inicial";
}

function mapLegacyPrestamoFields(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };

  if (out.saldo_capital === undefined && out.monto_prestado !== undefined) {
    out.saldo_capital = out.monto_prestado;
  }
  if (out.frecuencia !== undefined) {
    out.frecuencia_pago = out.frecuencia;
  }
  if (out.fecha_inicio !== undefined) {
    out.fecha_credito = out.fecha_inicio;
  }
  if (out.tasa_interes != null) {
    out.porcentaje_interes = out.tasa_interes;
  }
  if (out.valor_cuota != null) {
    out.cuota_deseada = out.valor_cuota;
  }
  if (out.estado == null) {
    out.estado = "pendiente";
  }
  out.tipo_interes = inferirTipoInteres(out);

  return out;
}

/** Solo para INSERT — rellena columnas NOT NULL de BD legacy */
function prestamoInsertCompat(payload: Record<string, unknown>): Record<string, unknown> {
  const {
    total_pagar: totalPagar,
    total_intereses: totalIntereses,
    valor_cuota_deseada: valorCuotaDeseada,
    ...rest
  } = payload;

  const out = mapLegacyPrestamoFields(rest);
  if (out.cuota_deseada == null && valorCuotaDeseada != null) {
    out.cuota_deseada = valorCuotaDeseada;
  }

  const deudaTotal = calcularDeudaTotal({ ...out, total_pagar: totalPagar });
  out.deuda_total = deudaTotal;
  out.saldo_interes = calcularSaldoInteres(
    { ...out, total_intereses: totalIntereses },
    deudaTotal
  );

  return out;
}

function leerFechaInicio(row: Record<string, unknown>): string {
  const val = row.fecha_inicio ?? row.fecha_credito ?? row.created_at;
  return String(val ?? new Date().toISOString().split("T")[0]).slice(0, 10);
}

function mapPrestamo(row: Record<string, unknown>): Prestamo {
  return {
    id: String(row.id),
    cliente_id: String(row.cliente_id),
    tipo_prestamo: (row.tipo_prestamo as Prestamo["tipo_prestamo"]) ?? "cuotas_manuales",
    tipo_interes: (row.tipo_interes as Prestamo["tipo_interes"]) ?? null,
    monto_prestado: Number(row.monto_prestado),
    saldo_capital: Number(row.saldo_capital ?? row.monto_prestado),
    frecuencia: leerFrecuencia(row),
    tasa_interes:
      row.tasa_interes != null
        ? Number(row.tasa_interes)
        : row.porcentaje_interes != null
          ? Number(row.porcentaje_interes)
          : null,
    valor_cuota:
      row.valor_cuota != null
        ? Number(row.valor_cuota)
        : row.cuota_deseada != null
          ? Number(row.cuota_deseada)
          : null,
    total_cuotas: row.total_cuotas != null ? Number(row.total_cuotas) : null,
    cuotas_pagadas: Number(row.cuotas_pagadas ?? 0),
    estado: row.estado as Prestamo["estado"],
    fecha_inicio: leerFechaInicio(row),
    nota: String(row.nota ?? ""),
  };
}

function inferirTipoCuota(
  prestamo: Pick<Prestamo, "tipo_prestamo" | "tipo_interes">,
  row?: Record<string, unknown>
): PlanCuota["tipo_cuota"] {
  if (row?.tipo_cuota != null && String(row.tipo_cuota).trim() !== "") {
    return row.tipo_cuota as PlanCuota["tipo_cuota"];
  }
  if (prestamo.tipo_interes === "compuesto_bancario") return "fija";
  if (prestamo.tipo_prestamo === "cuotas_fijas") return "fija";
  if (prestamo.tipo_prestamo === "solo_interes") return "interes";
  return "manual";
}

/** BD legacy: sin tipo_cuota; requiere interes_cuota y capital_cuota */
function planCuotaInsertRow(
  row: Record<string, unknown>,
  prestamo?: Pick<Prestamo, "tipo_prestamo" | "tipo_interes">
): Record<string, unknown> {
  const { tipo_cuota, capital, interes, ...rest } = row;
  void tipo_cuota;
  const monto = Number(rest.monto_cuota ?? 0);

  let interesCuota =
    rest.interes_cuota != null
      ? Number(rest.interes_cuota)
      : interes != null
        ? Number(interes)
        : null;
  let capitalCuota =
    rest.capital_cuota != null
      ? Number(rest.capital_cuota)
      : capital != null
        ? Number(capital)
        : null;

  if (interesCuota == null && capitalCuota == null) {
    const esSoloInteres =
      prestamo?.tipo_prestamo === "solo_interes" ||
      prestamo?.tipo_interes === "capital_inicial" ||
      prestamo?.tipo_interes === "cada_cuota";

    if (esSoloInteres) {
      interesCuota = monto;
      capitalCuota = 0;
    } else {
      interesCuota = 0;
      capitalCuota = monto;
    }
  } else {
    if (interesCuota == null) {
      interesCuota = Math.max(0, monto - Number(capitalCuota ?? 0));
    }
    if (capitalCuota == null) {
      capitalCuota = Math.max(0, monto - Number(interesCuota ?? 0));
    }
  }

  return {
    ...rest,
    monto_pagado: rest.monto_pagado ?? 0,
    estado: rest.estado ?? "pendiente",
    interes_cuota: interesCuota,
    capital_cuota: capitalCuota,
  };
}

function inferirInteresCapitalCuota(
  row: Record<string, unknown>,
  prestamo?: Pick<Prestamo, "tipo_prestamo" | "tipo_interes">
): { interes_cuota: number; capital_cuota: number } {
  const monto = Number(row.monto_cuota ?? 0);
  if (row.interes_cuota != null && row.capital_cuota != null) {
    return {
      interes_cuota: Number(row.interes_cuota),
      capital_cuota: Number(row.capital_cuota),
    };
  }
  const tipo = prestamo ? inferirTipoCuota(prestamo, row) : "manual";
  if (tipo === "interes") {
    return { interes_cuota: monto, capital_cuota: 0 };
  }
  return { interes_cuota: 0, capital_cuota: monto };
}

function mapPlanCuota(
  row: Record<string, unknown>,
  prestamo?: Pick<Prestamo, "tipo_prestamo" | "tipo_interes">
): PlanCuota {
  const { interes_cuota, capital_cuota } = inferirInteresCapitalCuota(row, prestamo);
  return {
    id: String(row.id),
    prestamo_id: String(row.prestamo_id),
    numero_cuota: Number(row.numero_cuota),
    monto_cuota: Number(row.monto_cuota),
    interes_cuota,
    capital_cuota,
    fecha_vencimiento: String(row.fecha_vencimiento).slice(0, 10),
    monto_pagado: Number(row.monto_pagado ?? 0),
    estado: row.estado as PlanCuota["estado"],
    tipo_cuota: prestamo
      ? inferirTipoCuota(prestamo, row)
      : ((row.tipo_cuota as PlanCuota["tipo_cuota"]) ?? "manual"),
  };
}

async function insertPlanCuotasDb(
  rows: Array<Record<string, unknown>>,
  prestamo: Prestamo
): Promise<PlanCuota[]> {
  const { data, error } = await supabase
    .from("plan_cuotas")
    .insert(rows.map((row) => planCuotaInsertRow(row, prestamo)))
    .select("*");

  throwIfError(error, "Error al crear plan de cuotas");
  return (data ?? []).map((row) => mapPlanCuota(row, prestamo));
}

async function insertPlanCuotaDb(
  row: Record<string, unknown>,
  prestamo: Prestamo
): Promise<PlanCuota> {
  const { data, error } = await supabase
    .from("plan_cuotas")
    .insert(planCuotaInsertRow(row, prestamo))
    .select("*")
    .single();

  throwIfError(error, "Error al crear cuota de interés");
  return mapPlanCuota(data, prestamo);
}

function mapAbono(row: Record<string, unknown>): Abono {
  return {
    id: String(row.id),
    prestamo_id: String(row.prestamo_id),
    monto_abonado: Number(row.monto_abonado),
    fecha_abono: String(row.fecha_abono).slice(0, 10),
    notas: String(row.notas ?? ""),
    tipo_abono: (row.tipo_abono as Abono["tipo_abono"]) ?? "cuota",
    plan_cuota_id: row.plan_cuota_id ? String(row.plan_cuota_id) : null,
    metodo_pago: String(row.metodo_pago ?? ""),
    aplicacion_abono:
      (row.aplicacion_abono as AplicacionAbono) ?? "interes_y_capital",
  };
}

function throwIfError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export interface AppData {
  clientes: Cliente[];
  prestamos: Prestamo[];
  abonos: Abono[];
  planCuotas: PlanCuota[];
}

export async function fetchAllData(): Promise<AppData> {
  const [clientesRes, prestamosRes, abonosRes, planCuotasRes] = await Promise.all([
    supabase.from("clientes").select("*").order("fecha_registro", { ascending: false }),
    supabase.from("prestamos").select("*").order("fecha_inicio", { ascending: false }),
    supabase.from("abonos").select("*").order("fecha_abono", { ascending: false }),
    supabase.from("plan_cuotas").select("*").order("numero_cuota", { ascending: true }),
  ]);

  throwIfError(clientesRes.error, "Error al cargar clientes");
  throwIfError(prestamosRes.error, "Error al cargar préstamos");
  throwIfError(abonosRes.error, "Error al cargar abonos");
  throwIfError(planCuotasRes.error, "Error al cargar plan de cuotas");

  const prestamos = (prestamosRes.data ?? []).map(mapPrestamo);
  const prestamoById = new Map(prestamos.map((p) => [p.id, p]));

  return {
    clientes: (clientesRes.data ?? []).map(mapCliente),
    prestamos,
    abonos: (abonosRes.data ?? []).map(mapAbono),
    planCuotas: (planCuotasRes.data ?? []).map((row) =>
      mapPlanCuota(row, prestamoById.get(String(row.prestamo_id)))
    ),
  };
}

export async function insertCliente(data: Omit<Cliente, "id">): Promise<Cliente> {
  const { data: row, error } = await supabase
    .from("clientes")
    .insert({
      nombre: data.nombre,
      telefono: data.telefono,
      descripcion: data.descripcion,
      fecha_registro: data.fecha_registro,
      activo: data.activo ?? true,
    })
    .select("*")
    .single();

  throwIfError(error, "Error al crear cliente");
  return mapCliente(row);
}

export async function insertClientesBulk(
  items: Omit<Cliente, "id">[]
): Promise<Cliente[]> {
  if (items.length === 0) return [];

  const { data, error } = await supabase
    .from("clientes")
    .insert(
      items.map((c) => ({
        nombre: c.nombre,
        telefono: c.telefono,
        descripcion: c.descripcion,
        fecha_registro: c.fecha_registro,
        activo: c.activo ?? true,
      }))
    )
    .select("*");

  throwIfError(error, "Error al importar clientes");
  return (data ?? []).map(mapCliente);
}

export async function updateClienteDb(
  id: string,
  data: Partial<Omit<Cliente, "id">>
): Promise<void> {
  const { error } = await supabase.from("clientes").update(data).eq("id", id);
  throwIfError(error, "Error al actualizar cliente");
}

export async function deleteClienteDb(id: string): Promise<void> {
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  throwIfError(error, "Error al eliminar cliente");
}

export async function setClienteActivoDb(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("clientes").update({ activo }).eq("id", id);
  throwIfError(error, "Error al actualizar estado del cliente");
}

/** Crea crédito desde simulador CobrApp */
export async function insertPrestamoSimulado(
  input: NuevoPrestamoSimuladoInput
): Promise<{ prestamo: Prestamo; planCuotas: PlanCuota[] }> {
  const simulacion = simularCredito({
    monto_prestado: input.monto_prestado,
    tipo_interes: input.tipo_interes,
    tasa_interes: input.tasa_interes,
    valor_cuota_deseada: input.valor_cuota_deseada,
    total_cuotas: input.total_cuotas,
    frecuencia: input.frecuencia,
    fecha_inicio: input.fecha_inicio,
  });

  const esCompuesto = input.tipo_interes === "compuesto_bancario";
  const tipoPrestamo = esCompuesto ? "cuotas_fijas" : "solo_interes";

  const { data: row, error } = await supabase
    .from("prestamos")
    .insert(
      prestamoInsertCompat(
        {
          cliente_id: input.cliente_id,
          tipo_prestamo: tipoPrestamo,
          tipo_interes: input.tipo_interes,
          monto_prestado: input.monto_prestado,
          saldo_capital: input.monto_prestado,
          frecuencia: input.frecuencia,
          tasa_interes: input.tasa_interes,
          valor_cuota: simulacion.valor_cuota,
          total_cuotas: input.total_cuotas,
          cuotas_pagadas: 0,
          estado: "pendiente",
          fecha_inicio: input.fecha_inicio,
          nota: input.nota,
          total_pagar: simulacion.total_pagar,
          total_intereses: simulacion.total_intereses,
          valor_cuota_deseada: input.valor_cuota_deseada,
        }
      )
    )
    .select("*")
    .single();

  throwIfError(error, "Error al crear crédito");

  const prestamo = mapPrestamo(row);
  const planRows = planDesdeSimulacion(prestamo.id, simulacion, input.tipo_interes);

  try {
    const planCuotas = await insertPlanCuotasDb(planRows, prestamo);
    return { prestamo, planCuotas };
  } catch (err) {
    await supabase.from("prestamos").delete().eq("id", prestamo.id);
    throw err;
  }
}

export async function insertPrestamo(
  input: NuevoPrestamoInput
): Promise<{ prestamo: Prestamo; planCuotas: PlanCuota[] }> {
  if (input.tipo_prestamo === "cuotas_fijas") {
    if (input.valor_cuota <= 0 || input.total_cuotas <= 0) {
      throw new Error("Valor de cuota y número de cuotas deben ser mayores a cero");
    }

    const { data: row, error } = await supabase
      .from("prestamos")
      .insert(
        prestamoInsertCompat({
          cliente_id: input.cliente_id,
          tipo_prestamo: "cuotas_fijas",
          monto_prestado: input.monto_prestado,
          saldo_capital: input.monto_prestado,
          frecuencia: input.frecuencia,
          tasa_interes: null,
          valor_cuota: input.valor_cuota,
          total_cuotas: input.total_cuotas,
          cuotas_pagadas: 0,
          estado: "pendiente",
          fecha_inicio: input.fecha_inicio,
        })
      )
      .select("*")
      .single();

    throwIfError(error, "Error al crear préstamo");

    const prestamo = mapPrestamo(row);
    const planRows = construirPlanCuotasFijas(
      prestamo.id,
      input.valor_cuota,
      input.total_cuotas,
      input.frecuencia,
      input.fecha_inicio
    );

    try {
      const planCuotas = await insertPlanCuotasDb(planRows, prestamo);
      return { prestamo, planCuotas };
    } catch (err) {
      await supabase.from("prestamos").delete().eq("id", prestamo.id);
      throw err;
    }
  }

  if (input.tipo_prestamo === "cuotas_manuales") {
    const sumaCuotas = input.cuotas.reduce((s, c) => s + c.monto, 0);
    if (sumaCuotas < input.monto_prestado) {
      throw new Error("La suma de cuotas debe ser igual o mayor al capital prestado");
    }

    const { data: row, error } = await supabase
      .from("prestamos")
      .insert(
        prestamoInsertCompat({
          cliente_id: input.cliente_id,
          tipo_prestamo: "cuotas_manuales",
          monto_prestado: input.monto_prestado,
          saldo_capital: input.monto_prestado,
          frecuencia: "mensual",
          tasa_interes: null,
          valor_cuota: null,
          total_cuotas: input.cuotas.length,
          cuotas_pagadas: 0,
          estado: "pendiente",
          fecha_inicio: input.fecha_inicio,
          total_pagar: sumaCuotas,
          total_intereses: Math.max(0, sumaCuotas - input.monto_prestado),
        })
      )
      .select("*")
      .single();

    throwIfError(error, "Error al crear préstamo");

    const prestamo = mapPrestamo(row);
    const planRows = construirPlanCuotasManual(prestamo.id, input.cuotas);

    try {
      const planCuotas = await insertPlanCuotasDb(planRows, prestamo);
      return { prestamo, planCuotas };
    } catch (err) {
      await supabase.from("prestamos").delete().eq("id", prestamo.id);
      throw err;
    }
  }

  const { data: row, error } = await supabase
    .from("prestamos")
    .insert(
      prestamoInsertCompat({
        cliente_id: input.cliente_id,
        tipo_prestamo: "solo_interes",
        monto_prestado: input.monto_prestado,
        saldo_capital: input.monto_prestado,
        frecuencia: input.frecuencia,
        tasa_interes: null,
        valor_cuota: input.valor_interes_periodo,
        total_cuotas: null,
        cuotas_pagadas: 0,
        estado: "pendiente",
        fecha_inicio: input.fecha_inicio,
      })
    )
    .select("*")
    .single();

  throwIfError(error, "Error al crear préstamo");

  const prestamo = mapPrestamo(row);
  const primeraCuota = construirPrimeraCuotaInteres(prestamo);

  try {
    const planCuotas = [await insertPlanCuotaDb(primeraCuota, prestamo)];
    return { prestamo, planCuotas };
  } catch (err) {
    await supabase.from("prestamos").delete().eq("id", prestamo.id);
    throw err;
  }
}

export async function updatePrestamoDb(
  id: string,
  data: Partial<Prestamo>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.monto_prestado !== undefined) payload.monto_prestado = data.monto_prestado;
  if (data.saldo_capital !== undefined) {
    payload.saldo_capital = data.saldo_capital;
  }
  if (data.tasa_interes !== undefined) {
    payload.tasa_interes = data.tasa_interes;
    payload.porcentaje_interes = data.tasa_interes;
  }
  if (data.frecuencia !== undefined) {
    payload.frecuencia = data.frecuencia;
    payload.frecuencia_pago = data.frecuencia;
  }
  if (data.valor_cuota !== undefined) {
    payload.valor_cuota = data.valor_cuota;
    payload.cuota_deseada = data.valor_cuota;
  }
  if (data.total_cuotas !== undefined) payload.total_cuotas = data.total_cuotas;
  if (data.cuotas_pagadas !== undefined) payload.cuotas_pagadas = data.cuotas_pagadas;
  if (data.estado !== undefined) payload.estado = data.estado;
  if (data.fecha_inicio !== undefined) {
    payload.fecha_inicio = data.fecha_inicio;
    payload.fecha_credito = data.fecha_inicio;
  }
  if (data.nota !== undefined) payload.nota = data.nota;
  if (data.tipo_interes !== undefined) payload.tipo_interes = data.tipo_interes;

  const finalPayload = mapLegacyPrestamoFields(payload);
  const { error } = await supabase.from("prestamos").update(finalPayload).eq("id", id);
  throwIfError(error, "Error al actualizar préstamo");

  if (data.valor_cuota !== undefined) {
    const { data: prestamoRow, error: prestamoFetchError } = await supabase
      .from("prestamos")
      .select("tipo_prestamo, tipo_interes")
      .eq("id", id)
      .single();

    throwIfError(prestamoFetchError, "Error al cargar préstamo");

    const prestamoRef = {
      tipo_prestamo: (prestamoRow?.tipo_prestamo as Prestamo["tipo_prestamo"]) ?? "solo_interes",
      tipo_interes: (prestamoRow?.tipo_interes as Prestamo["tipo_interes"]) ?? null,
    };

    const { data: cuotas, error: fetchError } = await supabase
      .from("plan_cuotas")
      .select("id, estado")
      .eq("prestamo_id", id)
      .neq("estado", "pagada");

    throwIfError(fetchError, "Error al cargar cuotas del plan");

    const ids = (cuotas ?? [])
      .filter((c) => inferirTipoCuota(prestamoRef, c) === "interes")
      .map((c) => String(c.id));

    if (ids.length > 0) {
      const { error: planError } = await supabase
        .from("plan_cuotas")
        .update({ monto_cuota: data.valor_cuota })
        .in("id", ids);

      throwIfError(planError, "Error al actualizar cuotas de interés");
    }
  }
}

export async function deletePrestamoDb(id: string): Promise<void> {
  const { error } = await supabase.from("prestamos").delete().eq("id", id);
  throwIfError(error, "Error al eliminar préstamo");
}

async function syncPlanCuotas(planCuotas: PlanCuota[], prestamo: Prestamo): Promise<void> {
  for (const cuota of planCuotas) {
    if (cuota.id.startsWith("tmp-")) {
      const inserted = await insertPlanCuotaDb(
        {
          prestamo_id: cuota.prestamo_id,
          numero_cuota: cuota.numero_cuota,
          monto_cuota: cuota.monto_cuota,
          fecha_vencimiento: cuota.fecha_vencimiento,
          monto_pagado: cuota.monto_pagado,
          estado: cuota.estado,
          tipo_cuota: cuota.tipo_cuota,
        },
        prestamo
      );
      cuota.id = inserted.id;
    } else {
      const { error } = await supabase
        .from("plan_cuotas")
        .update({
          monto_cuota: cuota.monto_cuota,
          monto_pagado: cuota.monto_pagado,
          estado: cuota.estado,
          fecha_vencimiento: cuota.fecha_vencimiento,
        })
        .eq("id", cuota.id);

      throwIfError(error, "Error al actualizar cuota del plan");
    }
  }
}

export async function registrarAbonoDb(
  prestamo: Prestamo,
  planCuotas: PlanCuota[],
  abonos: Abono[],
  input: NuevoAbonoInput & {
    metodo_pago?: string;
    aplicacion_abono?: AplicacionAbono;
  }
): Promise<{
  prestamoActualizado: Prestamo;
  planCuotasActualizado: PlanCuota[];
  abono: Abono;
}> {
  const planDelPrestamo = planCuotas.filter((c) => c.prestamo_id === prestamo.id);

  const resultado = aplicarAbono(prestamo, planDelPrestamo, {
    monto_abonado: input.monto_abonado,
    fecha_abono: input.fecha_abono,
    notas: input.notas,
    tipo_abono: input.tipo_abono,
    plan_cuota_id: input.plan_cuota_id,
  });

  await syncPlanCuotas(resultado.planCuotasActualizado, prestamo);

  const abonoInsert = {
    prestamo_id: input.prestamo_id,
    monto_abonado: input.monto_abonado,
    fecha_abono: input.fecha_abono,
    notas: input.notas,
    tipo_abono: resultado.abono.tipo_abono,
    plan_cuota_id: resultado.abono.plan_cuota_id,
    metodo_pago: input.metodo_pago ?? "",
    aplicacion_abono: input.aplicacion_abono ?? "interes_y_capital",
  };

  const { data: abonoRow, error: abonoError } = await supabase
    .from("abonos")
    .insert(abonoInsert)
    .select("*")
    .single();

  throwIfError(abonoError, "Error al registrar abono");

  const saldoCap = resultado.prestamoActualizado.saldo_capital;
  const deudaPendiente = resultado.planCuotasActualizado.reduce(
    (s, c) => s + Math.max(0, c.monto_cuota - c.monto_pagado),
    0
  );

  const { error: prestamoError } = await supabase
    .from("prestamos")
    .update(
      mapLegacyPrestamoFields({
        cuotas_pagadas: resultado.prestamoActualizado.cuotas_pagadas,
        saldo_capital: saldoCap,
        valor_cuota: resultado.prestamoActualizado.valor_cuota,
        estado: resultado.prestamoActualizado.estado,
        deuda_total: deudaPendiente,
        saldo_interes: Math.max(0, deudaPendiente - saldoCap),
      })
    )
    .eq("id", prestamo.id);

  throwIfError(prestamoError, "Error al actualizar préstamo tras abono");

  const otrosPlanes = planCuotas.filter((c) => c.prestamo_id !== prestamo.id);
  const planFinal = [...otrosPlanes, ...resultado.planCuotasActualizado];

  return {
    prestamoActualizado: resultado.prestamoActualizado,
    planCuotasActualizado: planFinal,
    abono: mapAbono(abonoRow),
  };
}
