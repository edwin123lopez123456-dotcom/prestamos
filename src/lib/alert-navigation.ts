import type { AlertaRapida } from "@/types";

/** Ruta para abrir el crédito desde una alerta (atrasados → abonar). */
export function rutaAlertaPrestamo(alerta: AlertaRapida): string {
  const base = `/clientes/${alerta.cliente_id}/prestamos/${alerta.prestamo_id}`;
  return alerta.tipo === "atrasado" ? `${base}/abonar` : base;
}
