"use client";

import { DashboardPrincipal } from "@/components/dashboard/DashboardPrincipal";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/context/DataStoreContext";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function HomePage() {
  const { loading, error, refresh, mutating } = useDataStore();

  if (loading) {
    return <LoadingState message="Cargando dashboard..." fullPage />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center px-4">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <p className="font-semibold text-slate-900">Error de conexión</p>
        <p className="text-sm text-slate-500 max-w-md">{error}</p>
        <Button onClick={() => void refresh()} disabled={mutating}>
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
      </div>
    );
  }

  return <DashboardPrincipal />;
}
