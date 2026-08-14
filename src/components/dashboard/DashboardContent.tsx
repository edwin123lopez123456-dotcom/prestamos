"use client";

import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CalendarClock,
  Percent,
  PiggyBank,
  RefreshCw,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ChartSection } from "@/components/dashboard/ChartSection";
import { QuickAlerts } from "@/components/dashboard/QuickAlerts";
import { CarteraPieChart } from "@/components/dashboard/CarteraPieChart";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/context/DataStoreContext";

export function DashboardContent() {
  const { metricas, alertas, datosGrafico, estadoCartera, loading, error, refresh, mutating } =
    useDataStore();

  if (loading) {
    return <LoadingState message="Cargando dashboard..." fullPage />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <div>
          <p className="font-semibold text-slate-900">Error de conexión</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md">{error}</p>
        </div>
        <Button onClick={() => void refresh()} disabled={mutating}>
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Resumen general de tu cartera de préstamos
          </p>
        </div>
        {mutating && (
          <span className="text-xs text-blue-600 font-medium animate-pulse">
            Guardando...
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Dinero en la Calle"
          value={metricas.dinero_en_calle}
          icon={DollarSign}
          trend="Saldo pendiente total"
          variant="default"
        />
        <MetricCard
          title="Total Recaudado Hoy"
          value={metricas.total_recaudado_hoy}
          icon={TrendingUp}
          trend="Abonos registrados hoy"
          variant="success"
        />
        <MetricCard
          title="Clientes en Mora"
          value={metricas.clientes_en_mora}
          icon={AlertTriangle}
          format="number"
          trend="Requieren seguimiento"
          variant="danger"
        />
        <MetricCard
          title="Próximos Cobros"
          value={metricas.proximos_cobros}
          icon={CalendarClock}
          format="number"
          trend="Al día — esta semana"
          variant="warning"
        />
        <MetricCard
          title="Intereses Ganados Totales"
          value={metricas.intereses_ganados}
          icon={Percent}
          trend="Interés ya cobrado proporcionalmente"
          variant="success"
        />
        <MetricCard
          title="Intereses por Cobrar"
          value={metricas.intereses_por_cobrar}
          icon={PiggyBank}
          trend="Interés pendiente en cartera activa"
          variant="default"
        />
      </div>

      <ChartSection data={datosGrafico} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CarteraPieChart estado={estadoCartera} />
        <QuickAlerts alertas={alertas} />
      </div>
    </div>
  );
}
