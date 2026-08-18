"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Search, UserX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDataStore } from "@/context/DataStoreContext";
import { useAppContext } from "@/components/layout/MainLayout";
import { MoraSemaforo } from "@/components/shared/MoraSemaforo";
import { formatCurrency } from "@/lib/utils";
import type { InfoMora } from "@/types";

const MORA_AL_DIA: InfoMora = {
  dias_atraso: 0,
  semaforo: "verde",
  fecha_proxima_cuota: "",
};

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function ClientesGrid() {
  const router = useRouter();
  const { searchQuery } = useAppContext();
  const { clientes, moraPorCliente, prestamosEnriquecidos } = useDataStore();
  const [busqueda, setBusqueda] = useState("");

  const query = busqueda || searchQuery;

  const clientesConSaldo = useMemo(() => {
    return clientes
      .filter((c) => c.activo !== false)
      .map((cliente) => {
        const prestamos = prestamosEnriquecidos.filter(
          (p) => p.cliente_id === cliente.id && p.estado !== "pagado"
        );
        const saldo = prestamos.reduce((s, p) => s + p.saldo_pendiente, 0);
        const mora = moraPorCliente.get(cliente.id)?.mora ?? MORA_AL_DIA;
        return { cliente, saldo, mora, prestamosActivos: prestamos.length };
      })
      .filter((item) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          item.cliente.nombre.toLowerCase().includes(q) ||
          item.cliente.telefono.includes(q) ||
          item.cliente.descripcion.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.cliente.nombre.localeCompare(b.cliente.nombre, "es"));
  }, [clientes, moraPorCliente, prestamosEnriquecidos, query]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Buscar cliente..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="pl-10 h-12 rounded-2xl"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {clientesConSaldo.map(({ cliente, saldo, mora, prestamosActivos }) => (
          <button
            key={cliente.id}
            type="button"
            onClick={() => router.push(`/clientes/${cliente.id}`)}
            className="app-card app-card-interactive text-left p-4 active:scale-[0.99]"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="avatar-circle h-11 w-11 shrink-0 text-sm">
                {iniciales(cliente.nombre) || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-900 leading-tight truncate">
                    {cliente.nombre}
                  </p>
                  <MoraSemaforo mora={mora} size="sm" />
                </div>
                {cliente.telefono && (
                  <p className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{cliente.telefono}</span>
                  </p>
                )}
              </div>
            </div>
            {cliente.descripcion && (
              <p className="text-xs text-slate-400 truncate mb-3 pl-14">
                {cliente.descripcion}
              </p>
            )}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-base font-bold text-emerald-700">
                {formatCurrency(saldo)}
              </span>
              <Badge variant="secondary" className="text-[10px] rounded-lg">
                {prestamosActivos} crédito{prestamosActivos !== 1 ? "s" : ""}
              </Badge>
            </div>
          </button>
        ))}
      </div>

      {clientesConSaldo.length === 0 && (
        <div className="app-card border-dashed p-12 text-center text-slate-400">
          <UserX className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay clientes que coincidan</p>
        </div>
      )}
    </div>
  );
}
