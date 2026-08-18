"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Search, UserX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDataStore } from "@/context/DataStoreContext";
import { MoraSemaforo } from "@/components/shared/MoraSemaforo";
import { formatCurrency } from "@/lib/utils";
import type { InfoMora } from "@/types";

const MORA_AL_DIA: InfoMora = {
  dias_atraso: 0,
  semaforo: "verde",
  fecha_proxima_cuota: "",
};

export function ClientesGrid() {
  const router = useRouter();
  const { clientes, moraPorCliente, prestamosEnriquecidos } = useDataStore();
  const [busqueda, setBusqueda] = useState("");

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
        if (!busqueda.trim()) return true;
        const q = busqueda.toLowerCase();
        return (
          item.cliente.nombre.toLowerCase().includes(q) ||
          item.cliente.telefono.includes(q) ||
          item.cliente.descripcion.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.cliente.nombre.localeCompare(b.cliente.nombre, "es"));
  }, [clientes, moraPorCliente, prestamosEnriquecidos, busqueda]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Buscar cliente..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clientesConSaldo.map(({ cliente, saldo, mora, prestamosActivos }) => (
          <button
            key={cliente.id}
            type="button"
            onClick={() => router.push(`/clientes/${cliente.id}`)}
            className="text-left rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="font-bold text-slate-900 leading-tight">{cliente.nombre}</p>
              <MoraSemaforo mora={mora} size="sm" />
            </div>
            {cliente.telefono && (
              <p className="flex items-center gap-1.5 text-sm text-slate-500 mb-1">
                <Phone className="h-3.5 w-3.5" />
                {cliente.telefono}
              </p>
            )}
            {cliente.descripcion && (
              <p className="text-xs text-slate-400 truncate mb-3">{cliente.descripcion}</p>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-sm font-bold text-emerald-700">
                {formatCurrency(saldo)}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {prestamosActivos} crédito{prestamosActivos !== 1 ? "s" : ""}
              </Badge>
            </div>
          </button>
        ))}
      </div>

      {clientesConSaldo.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400">
          <UserX className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No hay clientes que coincidan
        </div>
      )}
    </div>
  );
}
