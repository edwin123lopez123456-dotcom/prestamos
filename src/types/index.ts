/**
 * Tipos del dominio — preparados para mapear 1:1 con tablas Supabase.
 * Nombres en snake_case reflejan columnas futuras de la BD.
 */

export type FrecuenciaPago = "diario" | "semanal" | "quincenal" | "mensual";

export type EstadoPrestamo = "pendiente" | "pagado" | "atrasado";

/** Semáforo visual de mora: verde (al día), amarillo (1-7 días), rojo (>7 días) */
export type SemaforoMora = "verde" | "amarillo" | "rojo";

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  descripcion: string;
  fecha_registro: string;
}

export interface Prestamo {
  id: string;
  cliente_id: string;
  monto_prestado: number;
  frecuencia: FrecuenciaPago;
  valor_cuota: number;
  total_cuotas: number;
  cuotas_pagadas: number;
  estado: EstadoPrestamo;
  fecha_inicio: string;
}

export interface Abono {
  id: string;
  prestamo_id: string;
  monto_abonado: number;
  fecha_abono: string;
  notas: string;
}

/** Resultado del cálculo de mora para un préstamo */
export interface InfoMora {
  dias_atraso: number;
  semaforo: SemaforoMora;
  /** Fecha de la próxima cuota pendiente (ISO) */
  fecha_proxima_cuota: string;
  /** Fecha de la última cuota vencida no pagada (ISO), solo si hay atraso */
  fecha_ultima_vencida?: string;
}

/** Vista enriquecida para UI — join cliente + préstamo */
export interface PrestamoConCliente extends Prestamo {
  cliente: Cliente;
  saldo_pendiente: number;
  total_abonado: number;
  mora: InfoMora;
}

/** Resumen de mora agregado por cliente (peor estado entre sus préstamos) */
export interface MoraCliente {
  cliente_id: string;
  mora: InfoMora;
  prestamo_id: string;
}

export interface MetricasDashboard {
  dinero_en_calle: number;
  total_recaudado_hoy: number;
  clientes_en_mora: number;
  proximos_cobros: number;
  intereses_ganados: number;
  intereses_por_cobrar: number;
}

export interface EstadoCartera {
  al_dia: number;
  mora_amarilla: number;
  mora_roja: number;
}

export interface AlertaRapida {
  id: string;
  tipo: "atrasado" | "proximo";
  cliente_nombre: string;
  prestamo_id: string;
  monto_cuota: number;
  dias_retraso?: number;
  fecha_cobro?: string;
  semaforo: SemaforoMora;
}

export interface DatoGrafico {
  label: string;
  recaudado: number;
  prestado: number;
}

/** Payload para crear préstamo desde formulario */
export interface NuevoPrestamoInput {
  cliente_id: string;
  monto_prestado: number;
  frecuencia: FrecuenciaPago;
  valor_cuota: number;
  total_cuotas: number;
  fecha_inicio: string;
}

/** Payload para registrar abono parcial */
export interface NuevoAbonoInput {
  prestamo_id: string;
  monto_abonado: number;
  fecha_abono: string;
  notas: string;
}

/** Datos para el recibo de pago térmico */
export interface ReciboPagoData {
  negocio: string;
  cliente_nombre: string;
  cliente_telefono: string;
  monto_abonado: number;
  saldo_anterior: number;
  nuevo_saldo: number;
  fecha_hora: string;
  notas?: string;
}
