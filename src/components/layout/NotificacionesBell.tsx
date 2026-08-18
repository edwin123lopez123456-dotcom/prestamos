"use client";

import { useState } from "react";
import { Bell, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/context/DataStoreContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MoraSemaforo } from "@/components/shared/MoraSemaforo";
import type { InfoMora } from "@/types";

function moraFromAlerta(alerta: {
  dias_retraso?: number;
  semaforo: InfoMora["semaforo"];
  fecha_cobro?: string;
}): InfoMora {
  return {
    dias_atraso: alerta.dias_retraso ?? 0,
    semaforo: alerta.semaforo,
    fecha_proxima_cuota: alerta.fecha_cobro ?? "",
  };
}

export function NotificacionesBell() {
  const { alertas, loading } = useDataStore();
  const [abierto, setAbierto] = useState(false);

  const atrasados = alertas.filter((a) => a.tipo === "atrasado");
  const proximos = alertas.filter((a) => a.tipo === "proximo");
  const total = atrasados.length;
  const tieneRojo = atrasados.some((a) => a.semaforo === "rojo");

  if (loading) return null;

  return (
    <div className="relative shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-10 w-10 text-white hover:bg-slate-800"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Notificaciones${total ? ` (${total})` : ""}`}
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
              tieneRojo ? "bg-red-500" : "bg-amber-500"
            }`}
          >
            {total > 9 ? "9+" : total}
          </span>
        )}
      </Button>

      {abierto && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setAbierto(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="font-semibold text-slate-900 text-sm">
                Notificaciones
              </p>
              <p className="text-xs text-slate-500">
                {total} en mora · {proximos.length} próximos cobros
              </p>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {atrasados.length === 0 && proximos.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400 text-center">
                  Sin alertas pendientes
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {atrasados.map((alerta) => (
                    <div key={alerta.id} className="px-4 py-3 flex gap-2">
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 mt-0.5 ${
                          alerta.semaforo === "rojo"
                            ? "text-red-500"
                            : "text-amber-500"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {alerta.cliente_nombre}
                        </p>
                        <p className="text-xs text-slate-500">
                          Cuota {formatCurrency(alerta.monto_cuota)} ·{" "}
                          {alerta.dias_retraso ?? 0} días de atraso
                        </p>
                        <MoraSemaforo
                          mora={moraFromAlerta(alerta)}
                          size="sm"
                        />
                      </div>
                    </div>
                  ))}

                  {proximos.slice(0, 5).map((alerta) => (
                    <div key={alerta.id} className="px-4 py-3 flex gap-2">
                      <Clock className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {alerta.cliente_nombre}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatCurrency(alerta.monto_cuota)}
                          {alerta.fecha_cobro &&
                            ` · vence ${formatDate(alerta.fecha_cobro)}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
