import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatFrecuencia(frecuencia: string): string {
  const labels: Record<string, string> = {
    diario: "Diario",
    semanal: "Semanal",
    quincenal: "Quincenal",
    mensual: "Mensual",
  };
  return labels[frecuencia] ?? frecuencia;
}

export function formatEstado(estado: string): string {
  const labels: Record<string, string> = {
    pendiente: "Pendiente",
    pagado: "Pagado",
    atrasado: "Atrasado",
  };
  return labels[estado] ?? estado;
}

export function formatTipoPrestamo(tipo: string): string {
  const labels: Record<string, string> = {
    cuotas_fijas: "Cuotas fijas",
    cuotas_manuales: "Cuotas manuales",
    solo_interes: "Solo intereses",
  };
  return labels[tipo] ?? tipo;
}

export function formatTipoAbono(tipo: string): string {
  const labels: Record<string, string> = {
    cuota: "Abono a cuota",
    interes: "Pago de interés",
    capital: "Abono a capital",
  };
  return labels[tipo] ?? tipo;
}

/** Normaliza teléfono colombiano para enlace wa.me (57 + número) */
export function normalizarTelefonoWhatsApp(telefono: string): string {
  const digits = telefono.replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length >= 12) return digits;
  if (digits.startsWith("3") && digits.length === 10) return `57${digits}`;
  return digits;
}

/** Genera enlace de WhatsApp con mensaje preformateado */
export function generarEnlaceWhatsApp(telefono: string, mensaje: string): string {
  const numero = normalizarTelefonoWhatsApp(telefono);
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** Mensaje de recibo para WhatsApp (formato clásico) */
export function generarMensajeReciboWhatsApp(params: {
  negocio: string;
  clienteNombre: string;
  montoAbonado: number;
  fecha: string;
  nuevoSaldo: number;
}): string {
  return (
    `Recibo de Pago de ${params.negocio}: Hola ${params.clienteNombre}, ` +
    `hemos registrado tu abono de ${formatCurrency(params.montoAbonado)} hoy ${params.fecha}. ` +
    `Tu nuevo saldo pendiente es ${formatCurrency(params.nuevoSaldo)}. ¡Gracias por tu pago!`
  );
}

/** Comprobante optimizado para compartir en WhatsApp */
export function generarComprobanteWhatsAppCobrapp(params: {
  negocio: string;
  clienteNombre: string;
  montoAbonado: number;
  nuevoSaldo: number;
}): string {
  return (
    `🧾 COMPROBANTE DE PAGO - ${params.negocio}\n` +
    `Cliente: ${params.clienteNombre}\n` +
    `Abono recibido: ${formatCurrency(params.montoAbonado)}\n` +
    `Saldo Pendiente: ${formatCurrency(params.nuevoSaldo)}\n` +
    `¡Gracias por su puntualidad!`
  );
}

export const NEGOCIO_NOMBRE = "Préstamos E-I";
