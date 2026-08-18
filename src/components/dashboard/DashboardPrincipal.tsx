"use client";

import { useMemo, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CalendarClock,
  Percent,
  PiggyBank,
  Download,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ChartSection } from "@/components/dashboard/ChartSection";
import { QuickAlerts } from "@/components/dashboard/QuickAlerts";
import { CarteraPieChart } from "@/components/dashboard/CarteraPieChart";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/context/DataStoreContext";
import { exportarReporteFinancieroExcel } from "@/lib/excel";
import type { FiltroPeriodoDashboard } from "@/types";
import { cn } from "@/lib/utils";

const FILTROS: { id: FiltroPeriodoDashboard; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "todo", label: "Todo" },
];

function inPeriodo(fecha: string, filtro: FiltroPeriodoDashboard): boolean {
  if (filtro === "todo") return true;
  const d = new Date(`${fecha}T00:00:00`);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (filtro === "hoy") return d.getTime() === hoy.getTime();
  if (filtro === "semana") {
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - 7);
    return d >= inicio && d <= hoy;
  }
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return d >= inicioMes && d <= hoy;
}

export function DashboardPrincipal() {
  const {
    metricas,
    alertas,
    datosGrafico,
    estadoCartera,
    prestamosEnriquecidos,
    abonos,
    mutating,
  } = useDataStore();

  const [filtro, setFiltro] = useState<FiltroPeriodoDashboard>("mes");

  const metricasFiltradas = useMemo(() => {
    const abonosF = abonos.filter((a) => inPeriodo(a.fecha_abono, filtro));
    const recaudado = abonosF.reduce((s, a) => s + a.monto_abonado, 0);
    const recaudadoTotal = abonos.reduce((s, a) => s + a.monto_abonado, 0);
    const activos = prestamosEnriquecidos.filter((p) => p.estado !== "pagado");
    const mora = activos.filter((p) => p.mora.dias_atraso > 0);

    const interesesGanados =
      filtro === "todo" || recaudadoTotal === 0
        ? metricas.intereses_ganados
        : Math.round(metricas.intereses_ganados * (recaudado / recaudadoTotal));

    const proximosCobros =
      filtro === "todo"
        ? metricas.proximos_cobros
        : alertas.filter(
            (a) =>
              a.tipo === "proximo" &&
              a.fecha_cobro &&
              inPeriodo(a.fecha_cobro, filtro)
          ).length;

    return {
      ...metricas,
      total_recaudado_hoy: filtro === "hoy" ? metricas.total_recaudado_hoy : recaudado,
      clientes_en_mora: mora.length,
      intereses_ganados: interesesGanados,
      proximos_cobros: proximosCobros,
    };
  }, [abonos, alertas, filtro, metricas, prestamosEnriquecidos]);

  const graficoFiltrado = useMemo(() => {
    if (filtro === "todo") return datosGrafico;
    return datosGrafico.slice(filtro === "hoy" ? -1 : filtro === "semana" ? -7 : -30);
  }, [datosGrafico, filtro]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="page-heading">Dashboard</h1>
          <p className="page-subheading">
            Estado general del negocio con filtros avanzados
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            exportarReporteFinancieroExcel(metricasFiltradas, prestamosEnriquecidos)
          }
          disabled={mutating}
        >
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={cn(
              "filter-pill",
              filtro === f.id ? "filter-pill-active" : "filter-pill-inactive"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Dinero en la Calle"
          value={metricasFiltradas.dinero_en_calle}
          icon={DollarSign}
          trend="Saldo pendiente total"
          variant="default"
        />
        <MetricCard
          title={filtro === "hoy" ? "Recaudado Hoy" : "Recaudado (período)"}
          value={metricasFiltradas.total_recaudado_hoy}
          icon={TrendingUp}
          trend="Abonos del período"
          variant="success"
        />
        <MetricCard
          title="Clientes en Mora"
          value={metricasFiltradas.clientes_en_mora}
          icon={AlertTriangle}
          format="number"
          trend="Requieren seguimiento"
          variant="danger"
        />
        <MetricCard
          title={filtro === "todo" ? "Próximos Cobros" : "Próximos (período)"}
          value={metricasFiltradas.proximos_cobros}
          icon={CalendarClock}
          format="number"
          trend="Al día — vencen en el período"
          variant="warning"
        />
        <MetricCard
          title={filtro === "todo" ? "Intereses Ganados" : "Intereses (período)"}
          value={metricasFiltradas.intereses_ganados}
          icon={Percent}
          trend="Interés ya cobrado"
          variant="success"
        />
        <MetricCard
          title="Intereses por Cobrar"
          value={metricas.intereses_por_cobrar}
          icon={PiggyBank}
          trend="Pendiente en cartera"
          variant="default"
        />
      </div>

      <ChartSection data={graficoFiltrado} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CarteraPieChart estado={estadoCartera} />
        <QuickAlerts alertas={alertas} />
      </div>
    </div>
  );
}
