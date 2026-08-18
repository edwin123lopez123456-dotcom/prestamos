import type { MetricasDashboard, PrestamoConCliente, EstadoCartera } from "@/types";
import { saldoCuotaPlan } from "@/lib/calculations";

export interface MetricasFinancieras extends MetricasDashboard {
  estado_cartera: EstadoCartera;
}
/** Intereses ganados y por cobrar según tipo de préstamo */
export function calcularIntereses(prestamos: PrestamoConCliente[]): {
  intereses_ganados: number;
  intereses_por_cobrar: number;
} {
  let intereses_ganados = 0;
  let intereses_por_cobrar = 0;

  for (const p of prestamos) {
    if (p.tipo_prestamo === "solo_interes") {
      const capitalAbonado = p.monto_prestado - p.saldo_capital;
      const interesPagado = Math.max(0, p.total_abonado - capitalAbonado);
      intereses_ganados += interesPagado;

      if (p.estado !== "pagado") {
        const interesPendiente = p.plan_cuotas
          .filter((c) => c.tipo_cuota === "interes" && c.estado !== "pagada")
          .reduce((s, c) => s + saldoCuotaPlan(c), 0);
        intereses_por_cobrar += interesPendiente;
      }
      continue;
    }

    const totalPlan = p.plan_cuotas.reduce((s, c) => s + c.monto_cuota, 0);
    const interesTotal = Math.max(0, totalPlan - p.monto_prestado);
    if (totalPlan <= 0) continue;

    const pagadoPlan = p.plan_cuotas.reduce((s, c) => s + c.monto_pagado, 0);
    const ratio = Math.min(1, pagadoPlan / totalPlan);
    intereses_ganados += interesTotal * ratio;

    if (p.estado !== "pagado") {
      intereses_por_cobrar += interesTotal * (1 - ratio);
    }
  }

  return {
    intereses_ganados: Math.round(intereses_ganados),
    intereses_por_cobrar: Math.round(intereses_por_cobrar),
  };
}

export function calcularEstadoCartera(
  prestamos: PrestamoConCliente[]
): EstadoCartera {
  const activos = prestamos.filter((p) => p.estado !== "pagado");
  return {
    al_dia: activos.filter((p) => p.mora.semaforo === "verde").length,
    mora_amarilla: activos.filter((p) => p.mora.semaforo === "amarillo").length,
    mora_roja: activos.filter((p) => p.mora.semaforo === "rojo").length,
  };
}

export function calcularRecaudadoHoy(
  abonos: { monto_abonado: number; fecha_abono: string }[],
  fechaReferencia: Date = new Date()
): number {
  const hoy = fechaReferencia.toISOString().split("T")[0];
  return abonos
    .filter((a) => a.fecha_abono === hoy)
    .reduce((s, a) => s + a.monto_abonado, 0);
}
