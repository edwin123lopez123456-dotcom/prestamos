"use client";

import { use } from "react";
import { SimuladorPrestamoForm } from "@/components/prestamos/SimuladorPrestamoForm";
import { LoadingState } from "@/components/shared/LoadingState";
import { useDataStore } from "@/context/DataStoreContext";

export default function NuevoPrestamoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { loading } = useDataStore();

  if (loading) {
    return <LoadingState message="Cargando..." fullPage />;
  }

  return <SimuladorPrestamoForm clienteId={id} />;
}
