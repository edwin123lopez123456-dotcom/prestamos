import { AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoraSemaforo, getSemaforoBorderClass } from "@/components/shared/MoraSemaforo";
import type { AlertaRapida, InfoMora } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";

interface QuickAlertsProps {
  alertas: AlertaRapida[];
}

function moraFromAlerta(alerta: AlertaRapida): InfoMora {
  return {
    dias_atraso: alerta.dias_retraso ?? 0,
    semaforo: alerta.semaforo,
    fecha_proxima_cuota: alerta.fecha_cobro ?? "",
  };
}

export function QuickAlerts({ alertas }: QuickAlertsProps) {
  const atrasados = alertas.filter((a) => a.tipo === "atrasado");
  const proximos = alertas.filter((a) => a.tipo === "proximo");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-base">Alertas Rápidas</CardTitle>
          <div className="flex flex-wrap gap-2">
            <MoraSemaforo mora={{ dias_atraso: 0, semaforo: "verde", fecha_proxima_cuota: "" }} size="sm" />
            <MoraSemaforo mora={{ dias_atraso: 3, semaforo: "amarillo", fecha_proxima_cuota: "" }} size="sm" />
            <MoraSemaforo mora={{ dias_atraso: 10, semaforo: "rojo", fecha_proxima_cuota: "" }} size="sm" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {atrasados.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-700">
                Cuotas atrasadas ({atrasados.length})
              </span>
            </div>
            <div className="space-y-2">
              {atrasados.map((alerta) => (
                <div
                  key={alerta.id}
                  className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border p-3 ${getSemaforoBorderClass(alerta.semaforo)}`}
                >
                  <div className="flex items-start gap-2">
                    <MoraSemaforo mora={moraFromAlerta(alerta)} showLabel={false} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {alerta.cliente_nombre}
                      </p>
                      <p className="text-xs text-slate-500">
                        Cuota: {formatCurrency(alerta.monto_cuota)}
                      </p>
                    </div>
                  </div>
                  <MoraSemaforo mora={moraFromAlerta(alerta)} size="sm" />
                </div>
              ))}
            </div>
          </div>
        )}

        {proximos.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-700">
                Próximos cobros ({proximos.length})
              </span>
            </div>
            <div className="space-y-2">
              {proximos.map((alerta) => (
                <div
                  key={alerta.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3"
                >
                  <div className="flex items-start gap-2">
                    <MoraSemaforo mora={moraFromAlerta(alerta)} showLabel={false} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {alerta.cliente_nombre}
                      </p>
                      <p className="text-xs text-slate-500">
                        Cuota: {formatCurrency(alerta.monto_cuota)}
                      </p>
                    </div>
                  </div>
                  <MoraSemaforo
                    mora={{ dias_atraso: 0, semaforo: "verde", fecha_proxima_cuota: alerta.fecha_cobro ?? "" }}
                    size="sm"
                  />
                  {alerta.fecha_cobro && (
                    <span className="text-xs text-emerald-700 font-medium sm:ml-2">
                      Vence: {formatDate(alerta.fecha_cobro)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
