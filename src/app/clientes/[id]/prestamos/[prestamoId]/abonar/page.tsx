"use client";

import { use } from "react";
import { AbonoAvanzadoForm } from "@/components/prestamos/AbonoAvanzadoForm";
import { LoadingState } from "@/components/shared/LoadingState";
import { useDataStore } from "@/context/DataStoreContext";

export default function AbonarPage({
  params,
}: {
  params: Promise<{ id: string; prestamoId: string }>;
}) {
  const { id, prestamoId } = use(params);
  const { loading } = useDataStore();

  if (loading) {
    return <LoadingState message="Cargando..." fullPage />;
  }

  return <AbonoAvanzadoForm clienteId={id} prestamoId={prestamoId} />;
}
