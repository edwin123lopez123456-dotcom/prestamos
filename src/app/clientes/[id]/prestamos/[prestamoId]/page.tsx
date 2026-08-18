"use client";

import { use } from "react";
import { PrestamoDetalleView } from "@/components/prestamos/PrestamoDetalleView";
import { LoadingState } from "@/components/shared/LoadingState";
import { useDataStore } from "@/context/DataStoreContext";

export default function PrestamoDetallePage({
  params,
}: {
  params: Promise<{ id: string; prestamoId: string }>;
}) {
  const { id, prestamoId } = use(params);
  const { loading } = useDataStore();

  if (loading) {
    return <LoadingState message="Cargando crédito..." fullPage />;
  }

  return <PrestamoDetalleView clienteId={id} prestamoId={prestamoId} />;
}
