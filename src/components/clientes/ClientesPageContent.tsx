"use client";

import { ClientesTable } from "@/components/clientes/ClientesTable";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/context/DataStoreContext";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function ClientesPageContent() {
  const { loading, error, refresh, mutating } = useDataStore();

  if (loading) {
    return <LoadingState message="Cargando clientes..." fullPage />;
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
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500 mt-1">
            Administra tu base de clientes y su información de contacto
          </p>
        </div>
        {mutating && (
          <span className="text-xs text-blue-600 font-medium animate-pulse">
            Guardando...
          </span>
        )}
      </div>
      <ClientesTable />
    </div>
  );
}
