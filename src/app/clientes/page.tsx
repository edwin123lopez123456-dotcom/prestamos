"use client";

import { ClientesGrid } from "@/components/clientes/ClientesGrid";
import { ClientesTable } from "@/components/clientes/ClientesTable";
import { ClientesActionsPanel } from "@/components/clientes/ClientesActionsPanel";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/context/DataStoreContext";
import { AlertTriangle, LayoutGrid, List, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function ClientesPage() {
  const { loading, error, refresh, mutating } = useDataStore();
  const [vista, setVista] = useState<"grid" | "tabla">("grid");

  if (loading) {
    return <LoadingState message="Cargando clientes..." fullPage />;
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-heading">Clientes</h1>
          <p className="page-subheading">
            Toca un cliente para ver su ficha completa
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1 rounded-xl border border-slate-200/80 bg-white p-1 shadow-sm">
            <Button
              variant={vista === "grid" ? "default" : "outline"}
              size="icon"
              onClick={() => setVista("grid")}
              aria-label="Vista tarjetas"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={vista === "tabla" ? "default" : "outline"}
              size="icon"
              onClick={() => setVista("tabla")}
              aria-label="Vista tabla"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          {vista === "grid" && <ClientesActionsPanel />}
        </div>
      </div>

      {vista === "grid" ? <ClientesGrid /> : <ClientesTable />}
    </div>
  );
}
