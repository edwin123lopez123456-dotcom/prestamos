import { supabase } from "@/lib/supabase";
import type { Abono, Cliente, NuevoPrestamoInput, Prestamo } from "@/types";
import { aplicarAbono } from "@/lib/calculations";

function mapCliente(row: Record<string, unknown>): Cliente {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    telefono: String(row.telefono ?? ""),
    descripcion: String(row.descripcion ?? ""),
    fecha_registro: String(row.fecha_registro).slice(0, 10),
  };
}

function mapPrestamo(row: Record<string, unknown>): Prestamo {
  return {
    id: String(row.id),
    cliente_id: String(row.cliente_id),
    monto_prestado: Number(row.monto_prestado),
    frecuencia: row.frecuencia as Prestamo["frecuencia"],
    valor_cuota: Number(row.valor_cuota),
    total_cuotas: Number(row.total_cuotas),
    cuotas_pagadas: Number(row.cuotas_pagadas),
    estado: row.estado as Prestamo["estado"],
    fecha_inicio: String(row.fecha_inicio).slice(0, 10),
  };
}

function mapAbono(row: Record<string, unknown>): Abono {
  return {
    id: String(row.id),
    prestamo_id: String(row.prestamo_id),
    monto_abonado: Number(row.monto_abonado),
    fecha_abono: String(row.fecha_abono).slice(0, 10),
    notas: String(row.notas ?? ""),
  };
}

function throwIfError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export interface AppData {
  clientes: Cliente[];
  prestamos: Prestamo[];
  abonos: Abono[];
}

/** Carga todas las tablas en paralelo */
export async function fetchAllData(): Promise<AppData> {
  const [clientesRes, prestamosRes, abonosRes] = await Promise.all([
    supabase.from("clientes").select("*").order("fecha_registro", { ascending: false }),
    supabase.from("prestamos").select("*").order("fecha_inicio", { ascending: false }),
    supabase.from("abonos").select("*").order("fecha_abono", { ascending: false }),
  ]);

  throwIfError(clientesRes.error, "Error al cargar clientes");
  throwIfError(prestamosRes.error, "Error al cargar préstamos");
  throwIfError(abonosRes.error, "Error al cargar abonos");

  return {
    clientes: (clientesRes.data ?? []).map(mapCliente),
    prestamos: (prestamosRes.data ?? []).map(mapPrestamo),
    abonos: (abonosRes.data ?? []).map(mapAbono),
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

export async function insertPrestamo(input: NuevoPrestamoInput): Promise<Prestamo> {
  const { data: row, error } = await supabase
    .from("prestamos")
    .insert({
      cliente_id: input.cliente_id,
      monto_prestado: input.monto_prestado,
      frecuencia: input.frecuencia,
      valor_cuota: input.valor_cuota,
      total_cuotas: input.total_cuotas,
      cuotas_pagadas: 0,
      estado: "pendiente",
      fecha_inicio: input.fecha_inicio,
    })
    .select("*")
    .single();

  throwIfError(error, "Error al crear préstamo");
  return mapPrestamo(row);
}

export async function updatePrestamoDb(
  id: string,
  data: Partial<Prestamo>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.monto_prestado !== undefined) payload.monto_prestado = data.monto_prestado;
  if (data.frecuencia !== undefined) payload.frecuencia = data.frecuencia;
  if (data.valor_cuota !== undefined) payload.valor_cuota = data.valor_cuota;
  if (data.total_cuotas !== undefined) payload.total_cuotas = data.total_cuotas;
  if (data.cuotas_pagadas !== undefined) payload.cuotas_pagadas = data.cuotas_pagadas;
  if (data.estado !== undefined) payload.estado = data.estado;
  if (data.fecha_inicio !== undefined) payload.fecha_inicio = data.fecha_inicio;

  const { error } = await supabase.from("prestamos").update(payload).eq("id", id);
  throwIfError(error, "Error al actualizar préstamo");
}

export async function deletePrestamoDb(id: string): Promise<void> {
  const { error } = await supabase.from("prestamos").delete().eq("id", id);
  throwIfError(error, "Error al eliminar préstamo");
}

export async function registrarAbonoDb(
  prestamo: Prestamo,
  abonos: Abono[],
  nuevoAbono: Omit<Abono, "id">
): Promise<{ prestamoActualizado: Prestamo; abono: Abono }> {
  const { prestamoActualizado } = aplicarAbono(prestamo, abonos, nuevoAbono);

  const { data: abonoRow, error: abonoError } = await supabase
    .from("abonos")
    .insert({
      prestamo_id: nuevoAbono.prestamo_id,
      monto_abonado: nuevoAbono.monto_abonado,
      fecha_abono: nuevoAbono.fecha_abono,
      notas: nuevoAbono.notas,
    })
    .select("*")
    .single();

  throwIfError(abonoError, "Error al registrar abono");

  const { error: prestamoError } = await supabase
    .from("prestamos")
    .update({
      cuotas_pagadas: prestamoActualizado.cuotas_pagadas,
      estado: prestamoActualizado.estado,
    })
    .eq("id", prestamo.id);

  throwIfError(prestamoError, "Error al actualizar préstamo tras abono");

  return {
    prestamoActualizado,
    abono: mapAbono(abonoRow),
  };
}
