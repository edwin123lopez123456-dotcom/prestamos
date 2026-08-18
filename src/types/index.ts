/**
 * Tipos del dominio — mapeo 1:1 con tablas Supabase.
 */

export type FrecuenciaPago = "diario" | "semanal" | "quincenal" | "mensual";

export type TipoPrestamo = "cuotas_fijas" | "cuotas_manuales" | "solo_interes";

export type TipoInteres = "capital_inicial" | "cada_cuota" | "compuesto_bancario";

export type AplicacionAbono = "interes_y_capital" | "solo_interes" | "solo_capital";

export type FiltroPeriodoDashboard = "hoy" | "semana" | "mes" | "todo";

export type EstadoPrestamo = "pendiente" | "pagado" | "atrasado";

export type EstadoPlanCuota = "pendiente" | "parcial" | "pagada" | "anulada";

export type TipoCuota = "manual" | "interes" | "fija";

export type TipoAbono = "cuota" | "interes" | "capital";

/** Semáforo visual de mora: verde (al día), amarillo (1-7 días), rojo (>7 días) */
export type SemaforoMora = "verde" | "amarillo" | "rojo";

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  descripcion: string;
  fecha_registro: string;
  activo: boolean;
}

export interface PlanCuota {
  id: string;
  prestamo_id: string;
  numero_cuota: number;
  monto_cuota: number;
  interes_cuota: number;
  capital_cuota: number;
  fecha_vencimiento: string;
  monto_pagado: number;
  /** Desglose en memoria (opcional). Si falta, se infiere asumiendo prioridad interés→capital */
  monto_pagado_interes?: number;
  monto_pagado_capital?: number;
  estado: EstadoPlanCuota;
  tipo_cuota: TipoCuota;
}

export interface Prestamo {
  id: string;
  cliente_id: string;
  tipo_prestamo: TipoPrestamo;
  tipo_interes: TipoInteres | null;
  monto_prestado: number;
  saldo_capital: number;
  frecuencia: FrecuenciaPago;
  tasa_interes: number | null;
  valor_cuota: number | null;
  total_cuotas: number | null;
  cuotas_pagadas: number;
  estado: EstadoPrestamo;
  fecha_inicio: string;
  nota: string;
}

export interface Abono {
  id: string;
  prestamo_id: string;
  monto_abonado: number;
  fecha_abono: string;
  notas: string;
  tipo_abono: TipoAbono;
  plan_cuota_id: string | null;
  metodo_pago: string;
  aplicacion_abono: AplicacionAbono;
}

export interface CuotaSimulada {
  numero: number;
  fecha_vencimiento: string;
  capital: number;
  interes: number;
  cuota_total: number;
  saldo_restante: number;
}

export interface SimulacionCredito {
  cuotas: CuotaSimulada[];
  total_intereses: number;
  total_pagar: number;
  valor_cuota: number;
  tasa_efectiva: number;
}

export interface NuevoPrestamoSimuladoInput {
  cliente_id: string;
  monto_prestado: number;
  tipo_interes: TipoInteres;
  tasa_interes: number;
  valor_cuota_deseada: number | null;
  total_cuotas: number;
  frecuencia: FrecuenciaPago;
  fecha_inicio: string;
  nota: string;
}

export interface NuevoAbonoAvanzadoInput extends NuevoAbonoInput {
  metodo_pago: string;
  aplicacion_abono: AplicacionAbono;
  cuotas_a_pagar: number;
  incluir_intereses: boolean;
  incluir_deuda: boolean;
}

export interface InfoMora {
  dias_atraso: number;
  semaforo: SemaforoMora;
  fecha_proxima_cuota: string;
  fecha_ultima_vencida?: string;
}

export interface PrestamoConCliente extends Prestamo {
  cliente: Cliente;
  saldo_pendiente: number;
  total_abonado: number;
  mora: InfoMora;
  plan_cuotas: PlanCuota[];
  proxima_cuota: PlanCuota | null;
  interes_periodo: number | null;
}

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
  tipo_prestamo: TipoPrestamo;
}

export interface DatoGrafico {
  label: string;
  recaudado: number;
  prestado: number;
}

export interface CuotaManualInput {
  monto: number;
  fecha_vencimiento: string;
}

export interface NuevoPrestamoFijasInput {
  tipo_prestamo: "cuotas_fijas";
  cliente_id: string;
  monto_prestado: number;
  valor_cuota: number;
  total_cuotas: number;
  frecuencia: FrecuenciaPago;
  fecha_inicio: string;
}

export interface NuevoPrestamoManualInput {
  tipo_prestamo: "cuotas_manuales";
  cliente_id: string;
  monto_prestado: number;
  fecha_inicio: string;
  cuotas: CuotaManualInput[];
}

export interface NuevoPrestamoInteresInput {
  tipo_prestamo: "solo_interes";
  cliente_id: string;
  monto_prestado: number;
  /** Monto fijo del interés por período (ej: $100 mensuales) */
  valor_interes_periodo: number;
  frecuencia: FrecuenciaPago;
  fecha_inicio: string;
}

export type NuevoPrestamoInput =
  | NuevoPrestamoFijasInput
  | NuevoPrestamoManualInput
  | NuevoPrestamoInteresInput;

export interface NuevoAbonoInput {
  prestamo_id: string;
  monto_abonado: number;
  fecha_abono: string;
  notas: string;
  tipo_abono: TipoAbono;
  plan_cuota_id?: string | null;
}

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
