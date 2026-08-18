"use client";

import { use } from "react";
import { ClienteDetalleView } from "@/components/clientes/ClienteDetalleView";
import { LoadingState } from "@/components/shared/LoadingState";
import { useDataStore } from "@/context/DataStoreContext";

export default function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { loading } = useDataStore();

  if (loading) {
    return <LoadingState message="Cargando cliente..." fullPage />;
  }

  return <ClienteDetalleView clienteId={id} />;
}
