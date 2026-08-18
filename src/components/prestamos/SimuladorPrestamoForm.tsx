"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/shared/BackButton";
import { useDataStore } from "@/context/DataStoreContext";
import {
  LABEL_TIPO_INTERES,
  simularCredito,
} from "@/lib/loan-simulator";
import { formatCurrency, formatFrecuencia } from "@/lib/utils";
import type { FrecuenciaPago, TipoInteres } from "@/types";

interface SimuladorPrestamoFormProps {
  clienteId: string;
}

const FRECUENCIAS: FrecuenciaPago[] = ["diario", "semanal", "quincenal", "mensual"];
const TIPOS_INTERES: TipoInteres[] = [
  "capital_inicial",
  "cada_cuota",
  "compuesto_bancario",
];

export function SimuladorPrestamoForm({ clienteId }: SimuladorPrestamoFormProps) {
  const router = useRouter();
  const { getClienteById, addPrestamoSimulado, mutating } = useDataStore();
  const cliente = getClienteById(clienteId);

  const [monto, setMonto] = useState(500000);
  const [tipoInteres, setTipoInteres] = useState<TipoInteres>("compuesto_bancario");
  const [tasa, setTasa] = useState(5);
  const [cuotaFija, setCuotaFija] = useState(0);
  const [modoCuota, setModoCuota] = useState<"tasa" | "cuota">("tasa");
  const [totalCuotas, setTotalCuotas] = useState(12);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>("semanal");
  const [fechaInicio, setFechaInicio] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [nota, setNota] = useState("");

  const simulacion = useMemo(
    () =>
      simularCredito({
        monto_prestado: monto,
        tipo_interes: tipoInteres,
        tasa_interes: modoCuota === "tasa" ? tasa : 0,
        valor_cuota_deseada: modoCuota === "cuota" ? cuotaFija : null,
        total_cuotas: totalCuotas,
        frecuencia,
        fecha_inicio: fechaInicio,
      }),
    [monto, tipoInteres, tasa, cuotaFija, modoCuota, totalCuotas, frecuencia, fechaInicio]
  );

  const [guardando, setGuardando] = useState(false);

  async function handleGuardar() {
    if (guardando || mutating || !cliente || monto <= 0 || totalCuotas <= 0) return;

    if (simulacion.cuotas.length === 0 || simulacion.valor_cuota <= 0) {
      alert("Revisa la simulación: la cuota debe ser mayor a cero. Ajusta tasa, monto o número de cuotas.");
      return;
    }

    setGuardando(true);
    try {
      const prestamo = await addPrestamoSimulado({
        cliente_id: clienteId,
        monto_prestado: monto,
        tipo_interes: tipoInteres,
        tasa_interes: modoCuota === "tasa" ? tasa : 0,
        valor_cuota_deseada: modoCuota === "cuota" ? cuotaFija : null,
        total_cuotas: totalCuotas,
        frecuencia,
        fecha_inicio: fechaInicio,
        nota,
      });

      if (!prestamo?.id) {
        throw new Error("El crédito se guardó pero no se recibió su identificador.");
      }

      router.replace(`/clientes/${clienteId}/prestamos/${prestamo.id}`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo crear el crédito";
      alert(msg);
    } finally {
      setGuardando(false);
    }
  }

  if (!cliente) {
    return (
      <div className="text-center py-16">
        <p>Cliente no encontrado</p>
        <BackButton href="/clientes" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <BackButton href={`/clientes/${clienteId}`} label={cliente.nombre} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Nuevo crédito</h1>
        <p className="text-sm text-slate-500 mt-1">
          Simula y crea el plan de pagos antes de guardar
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Datos del crédito
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Monto prestado</Label>
            <Input
              type="number"
              value={monto || ""}
              onChange={(e) => setMonto(Number(e.target.value))}
              className="h-11"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Tipo de interés</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {TIPOS_INTERES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoInteres(t)}
                  className={`rounded-xl border p-3 text-left text-sm font-medium transition-colors ${
                    tipoInteres === t
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {LABEL_TIPO_INTERES[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Modo de cálculo</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={modoCuota === "tasa" ? "default" : "outline"}
                size="sm"
                onClick={() => setModoCuota("tasa")}
              >
                Porcentaje (%)
              </Button>
              <Button
                type="button"
                variant={modoCuota === "cuota" ? "default" : "outline"}
                size="sm"
                onClick={() => setModoCuota("cuota")}
              >
                Cuota fija
              </Button>
            </div>
          </div>

          {modoCuota === "tasa" ? (
            <div className="space-y-2">
              <Label>Tasa de interés (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={tasa || ""}
                onChange={(e) => setTasa(Number(e.target.value))}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Cuota fija deseada</Label>
              <Input
                type="number"
                value={cuotaFija || ""}
                onChange={(e) => setCuotaFija(Number(e.target.value))}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Número de cuotas</Label>
            <Input
              type="number"
              min={1}
              value={totalCuotas || ""}
              onChange={(e) => setTotalCuotas(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label>Frecuencia</Label>
            <select
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value as FrecuenciaPago)}
              className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm"
            >
              {FRECUENCIAS.map((f) => (
                <option key={f} value={f}>
                  {formatFrecuencia(f)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Fecha inicio</Label>
            <Input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Nota (opcional)</Label>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader>
          <CardTitle className="text-base">Resumen de simulación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-white p-3 text-center border">
              <p className="text-xs text-slate-500">Cuota</p>
              <p className="font-bold">{formatCurrency(simulacion.valor_cuota)}</p>
            </div>
            <div className="rounded-lg bg-white p-3 text-center border">
              <p className="text-xs text-slate-500">Total intereses</p>
              <p className="font-bold">{formatCurrency(simulacion.total_intereses)}</p>
            </div>
            <div className="rounded-lg bg-white p-3 text-center border">
              <p className="text-xs text-slate-500">Total a pagar</p>
              <p className="font-bold">{formatCurrency(simulacion.total_pagar)}</p>
            </div>
            <div className="rounded-lg bg-white p-3 text-center border">
              <p className="text-xs text-slate-500">Cuotas</p>
              <p className="font-bold">{simulacion.cuotas.length}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Vence</th>
                  <th className="px-3 py-2 font-medium text-right">Capital</th>
                  <th className="px-3 py-2 font-medium text-right">Interés</th>
                  <th className="px-3 py-2 font-medium text-right">Cuota</th>
                  <th className="px-3 py-2 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {simulacion.cuotas.map((c) => (
                  <tr key={c.numero} className="border-b border-slate-50">
                    <td className="px-3 py-2">{c.numero}</td>
                    <td className="px-3 py-2">{c.fecha_vencimiento}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(c.capital)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(c.interes)}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatCurrency(c.cuota_total)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {formatCurrency(c.saldo_restante)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            className="w-full mt-4 h-12 font-bold"
            onClick={() => void handleGuardar()}
            disabled={guardando || mutating || simulacion.cuotas.length === 0}
          >
            <Save className="h-4 w-4" />
            {guardando || mutating ? "Guardando..." : "Guardar crédito"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
