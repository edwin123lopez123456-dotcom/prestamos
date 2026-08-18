"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Calculator, Layers, PenLine, Infinity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Cliente,
  CuotaManualInput,
  FrecuenciaPago,
  NuevoPrestamoInput,
  TipoPrestamo,
} from "@/types";
import { calcularTotalCuotasFijas } from "@/lib/calculations";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface PrestamoFormProps {
  clientes: Cliente[];
  onSubmit: (input: NuevoPrestamoInput) => Promise<void>;
  disabled?: boolean;
}

const frecuencias: FrecuenciaPago[] = ["diario", "semanal", "quincenal", "mensual"];

const modalidades: {
  id: TipoPrestamo;
  titulo: string;
  subtitulo: string;
  icon: typeof Calculator;
}[] = [
  {
    id: "cuotas_fijas",
    titulo: "Cuotas fijas",
    subtitulo: "Ej: $100 → 20 × $6 = $120",
    icon: Calculator,
  },
  {
    id: "cuotas_manuales",
    titulo: "Cuotas manuales",
    subtitulo: "Montos y fechas a medida",
    icon: PenLine,
  },
  {
    id: "solo_interes",
    titulo: "Solo interés",
    subtitulo: "Capital abierto sin fin",
    icon: Infinity,
  },
];

function cuotaVacia(): CuotaManualInput {
  return { monto: 0, fecha_vencimiento: new Date().toISOString().split("T")[0] };
}

export function PrestamoForm({ clientes, onSubmit, disabled }: PrestamoFormProps) {
  const [tipo, setTipo] = useState<TipoPrestamo>("cuotas_fijas");
  const [submitting, setSubmitting] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [montoPrestado, setMontoPrestado] = useState(0);
  const [fechaInicio, setFechaInicio] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [valorCuota, setValorCuota] = useState(0);
  const [totalCuotas, setTotalCuotas] = useState(0);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>("semanal");
  const [cuotas, setCuotas] = useState<CuotaManualInput[]>([cuotaVacia()]);
  const [valorInteresPeriodo, setValorInteresPeriodo] = useState(0);
  const [frecuenciaInteres, setFrecuenciaInteres] = useState<FrecuenciaPago>("mensual");

  const sumaCuotas = cuotas.reduce((s, c) => s + (c.monto || 0), 0);
  const totalFijas = useMemo(
    () => calcularTotalCuotasFijas(valorCuota, totalCuotas),
    [valorCuota, totalCuotas]
  );
  const interesFijas = Math.max(0, totalFijas - montoPrestado);

  function resetForm() {
    setClienteId("");
    setMontoPrestado(0);
    setFechaInicio(new Date().toISOString().split("T")[0]);
    setValorCuota(0);
    setTotalCuotas(0);
    setFrecuencia("semanal");
    setCuotas([cuotaVacia()]);
    setValorInteresPeriodo(0);
    setFrecuenciaInteres("mensual");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!clienteId || montoPrestado <= 0) {
      alert("Seleccione un cliente e ingrese el capital prestado");
      return;
    }

    setSubmitting(true);
    try {
      if (tipo === "cuotas_fijas") {
        if (valorCuota <= 0 || totalCuotas <= 0) {
          alert("Ingrese valor de cuota y cantidad de cuotas");
          return;
        }
        await onSubmit({
          tipo_prestamo: "cuotas_fijas",
          cliente_id: clienteId,
          monto_prestado: montoPrestado,
          valor_cuota: valorCuota,
          total_cuotas: totalCuotas,
          frecuencia,
          fecha_inicio: fechaInicio,
        });
      } else if (tipo === "cuotas_manuales") {
        const cuotasValidas = cuotas.filter((c) => c.monto > 0 && c.fecha_vencimiento);
        if (cuotasValidas.length === 0) {
          alert("Agregue al menos una cuota con monto y fecha");
          return;
        }
        if (sumaCuotas < montoPrestado) {
          alert(
            `La suma de cuotas (${formatCurrency(sumaCuotas)}) debe cubrir el capital (${formatCurrency(montoPrestado)})`
          );
          return;
        }
        await onSubmit({
          tipo_prestamo: "cuotas_manuales",
          cliente_id: clienteId,
          monto_prestado: montoPrestado,
          fecha_inicio: fechaInicio,
          cuotas: cuotasValidas,
        });
      } else {
        if (valorInteresPeriodo <= 0) {
          alert("Ingrese el valor del interés periódico");
          return;
        }
        await onSubmit({
          tipo_prestamo: "solo_interes",
          cliente_id: clienteId,
          monto_prestado: montoPrestado,
          valor_interes_periodo: valorInteresPeriodo,
          frecuencia: frecuenciaInteres,
          fecha_inicio: fechaInicio,
        });
      }
      resetForm();
    } catch {
      alert("No se pudo crear el préstamo. Verifique la conexión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="bg-slate-900 text-white pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-5 w-5 text-emerald-400" />
          Nuevo crédito
        </CardTitle>
        <p className="text-xs text-slate-400 mt-1">
          Elija la modalidad y complete los datos del préstamo
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Selector de modalidad — 3 botones táctiles */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {modalidades.map(({ id, titulo, subtitulo, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTipo(id)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left min-h-[72px] transition-all active:scale-[0.98]",
                  tipo === id
                    ? "border-emerald-600 bg-emerald-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    tipo === id ? "text-emerald-600" : "text-slate-400"
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-bold",
                    tipo === id ? "text-emerald-900" : "text-slate-800"
                  )}
                >
                  {titulo}
                </span>
                <span className="text-[10px] text-slate-500 leading-tight">
                  {subtitulo}
                </span>
              </button>
            ))}
          </div>

          {/* Campos comunes */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="cliente">Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger id="cliente" className="h-12">
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="monto">Capital prestado</Label>
                <Input
                  id="monto"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="100000"
                  value={montoPrestado || ""}
                  onChange={(e) => setMontoPrestado(Number(e.target.value))}
                  className="h-12 text-lg font-semibold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha_inicio">Fecha inicio</Label>
                <Input
                  id="fecha_inicio"
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="h-12"
                />
              </div>
            </div>
          </div>

          {/* Modalidad 1: Cuotas fijas */}
          {tipo === "cuotas_fijas" && (
            <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <p className="text-sm font-semibold text-blue-900">
                Cuotas fijas tradicionales
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="valor_cuota">Valor cada cuota</Label>
                  <Input
                    id="valor_cuota"
                    type="number"
                    min={0}
                    placeholder="6000"
                    value={valorCuota || ""}
                    onChange={(e) => setValorCuota(Number(e.target.value))}
                    className="h-12 font-semibold"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_cuotas">Nº de cuotas</Label>
                  <Input
                    id="total_cuotas"
                    type="number"
                    min={1}
                    placeholder="20"
                    value={totalCuotas || ""}
                    onChange={(e) => setTotalCuotas(Number(e.target.value))}
                    className="h-12 font-semibold"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="frec_fijas">Frecuencia de pago</Label>
                <Select
                  value={frecuencia}
                  onValueChange={(v) => setFrecuencia(v as FrecuenciaPago)}
                >
                  <SelectTrigger id="frec_fijas" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {frecuencias.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {totalFijas > 0 && (
                <div className="rounded-lg bg-white border border-blue-200 p-3 text-sm space-y-1">
                  <p>
                    <span className="text-slate-500">Saldo total desde el inicio:</span>{" "}
                    <strong className="text-blue-900 text-base">
                      {formatCurrency(totalFijas)}
                    </strong>
                  </p>
                  <p className="text-xs text-blue-700">
                    {totalCuotas} cuotas de {formatCurrency(valorCuota)} —{" "}
                    {montoPrestado > 0 && (
                      <>interés {formatCurrency(interesFijas)}</>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Modalidad 2: Cuotas manuales */}
          {tipo === "cuotas_manuales" && (
            <div className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-violet-900">
                  Plan personalizado por día
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() => setCuotas((p) => [...p, cuotaVacia()])}
                >
                  <Plus className="h-4 w-4" />
                  Añadir
                </Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {cuotas.map((cuota, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end bg-white rounded-lg p-2 border border-violet-100"
                  >
                    <div>
                      <Label className="text-[10px]">Monto #{index + 1}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={cuota.monto || ""}
                        onChange={(e) =>
                          setCuotas((prev) =>
                            prev.map((c, i) =>
                              i === index ? { ...c, monto: Number(e.target.value) } : c
                            )
                          )
                        }
                        className="h-11"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Vencimiento</Label>
                      <Input
                        type="date"
                        value={cuota.fecha_vencimiento}
                        onChange={(e) =>
                          setCuotas((prev) =>
                            prev.map((c, i) =>
                              i === index
                                ? { ...c, fecha_vencimiento: e.target.value }
                                : c
                            )
                          )
                        }
                        className="h-11"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-11 text-red-600"
                      onClick={() =>
                        setCuotas((p) => p.filter((_, i) => i !== index))
                      }
                      disabled={cuotas.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {sumaCuotas > 0 && (
                <p
                  className={cn(
                    "text-sm font-medium",
                    sumaCuotas >= montoPrestado ? "text-emerald-700" : "text-amber-700"
                  )}
                >
                  Suma cuotas: {formatCurrency(sumaCuotas)}
                  {montoPrestado > 0 &&
                    (sumaCuotas >= montoPrestado
                      ? ` ✓ cubre capital (+${formatCurrency(sumaCuotas - montoPrestado)})`
                      : ` — faltan ${formatCurrency(montoPrestado - sumaCuotas)}`)}
                </p>
              )}
            </div>
          )}

          {/* Modalidad 3: Solo interés */}
          {tipo === "solo_interes" && (
            <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                Capital abierto — interés fijo periódico
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="interes_fijo">Interés por período ($)</Label>
                  <Input
                    id="interes_fijo"
                    type="number"
                    min={0}
                    placeholder="10000"
                    value={valorInteresPeriodo || ""}
                    onChange={(e) => setValorInteresPeriodo(Number(e.target.value))}
                    className="h-12 font-semibold"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frec_interes">Frecuencia</Label>
                  <Select
                    value={frecuenciaInteres}
                    onValueChange={(v) => setFrecuenciaInteres(v as FrecuenciaPago)}
                  >
                    <SelectTrigger id="frec_interes" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["diario", "semanal", "mensual"] as FrecuenciaPago[]).map((f) => (
                        <SelectItem key={f} value={f}>
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {valorInteresPeriodo > 0 && montoPrestado > 0 && (
                <div className="rounded-lg bg-white border border-amber-200 p-3 text-sm space-y-1">
                  <p>
                    Capital: <strong>{formatCurrency(montoPrestado)}</strong> (se
                    mantiene al cobrar interés)
                  </p>
                  <p>
                    Cobro periódico:{" "}
                    <strong className="text-amber-900">
                      {formatCurrency(valorInteresPeriodo)}
                    </strong>
                  </p>
                  <p className="text-xs text-amber-700">
                    Sin fecha de fin. Use &quot;Liquidar / Abonar a Capital&quot; al
                    registrar abonos cuando el cliente devuelva el capital.
                  </p>
                </div>
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={disabled || submitting}
            className="w-full h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="h-5 w-5" />
            {submitting ? "Creando préstamo..." : "Crear préstamo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
