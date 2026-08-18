"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Minus, Plus, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/shared/BackButton";
import { ReciboPago } from "@/components/prestamos/ReciboPago";
import { useDataStore } from "@/context/DataStoreContext";
import {
  aplicarAbono,
  calcularSaldoPendiente,
  cuotasPendientes,
  interesPendienteCuota,
  maxCuotasSeleccionables,
  saldoCuotaPlan,
  totalInteresesPendientesPlan,
} from "@/lib/calculations";
import {
  formatCurrency,
  formatDate,
  generarComprobanteWhatsAppCobrapp,
  generarEnlaceWhatsApp,
  NEGOCIO_NOMBRE,
} from "@/lib/utils";
import { LABEL_APLICACION_ABONO } from "@/lib/loan-simulator";
import type { AplicacionAbono, TipoAbono } from "@/types";

interface AbonoAvanzadoFormProps {
  clienteId: string;
  prestamoId: string;
}

const APLICACIONES: AplicacionAbono[] = [
  "interes_y_capital",
  "solo_interes",
  "solo_capital",
];

function mapAplicacionToTipo(aplicacion: AplicacionAbono): TipoAbono {
  if (aplicacion === "solo_interes") return "interes";
  if (aplicacion === "solo_capital") return "capital";
  return "cuota";
}

function totalCuotasSeleccionadas(
  pendientes: ReturnType<typeof cuotasPendientes>,
  cantidad: number
): number {
  if (pendientes.length === 0 || cantidad <= 0) return 0;

  const desdePlan = pendientes
    .slice(0, cantidad)
    .reduce((sum, cuota) => sum + saldoCuotaPlan(cuota), 0);

  if (pendientes.length >= cantidad) return desdePlan;

  const valorCuotaReferencia = saldoCuotaPlan(pendientes[0]);
  return valorCuotaReferencia * cantidad;
}

export function AbonoAvanzadoForm({ clienteId, prestamoId }: AbonoAvanzadoFormProps) {
  const router = useRouter();
  const { getPrestamoEnriquecido, registrarAbonoAvanzado, mutating } = useDataStore();
  const prestamo = getPrestamoEnriquecido(prestamoId);
  const reciboRef = useRef<HTMLDivElement>(null);

  const pendientes = useMemo(
    () => (prestamo ? cuotasPendientes(prestamo.plan_cuotas) : []),
    [prestamo]
  );

  const cuotaActual = pendientes[0] ?? null;
  const montoCuotaActual = cuotaActual
    ? saldoCuotaPlan(cuotaActual)
    : (prestamo?.valor_cuota ?? 0);

  const interesCuotaActual = cuotaActual ? interesPendienteCuota(cuotaActual) : 0;

  const maxCuotas = prestamo
    ? maxCuotasSeleccionables(prestamo, prestamo.plan_cuotas)
    : Math.max(1, pendientes.length);

  const interesPendiente = useMemo(() => {
    if (!prestamo) return 0;
    return totalInteresesPendientesPlan(prestamo.plan_cuotas);
  }, [prestamo]);

  const [cuotasAPagar, setCuotasAPagar] = useState(1);
  const [valorPagar, setValorPagar] = useState(montoCuotaActual);
  const [aplicacion, setAplicacion] = useState<AplicacionAbono>("interes_y_capital");
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [fechaAbono, setFechaAbono] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notas, setNotas] = useState("");
  const [mostrarRecibo, setMostrarRecibo] = useState(false);
  const [ultimoAbono, setUltimoAbono] = useState<{
    monto: number;
    nuevoSaldo: number;
  } | null>(null);

  function seleccionarCuotas(cantidad: number) {
    const n = Math.min(Math.max(1, cantidad), maxCuotas);
    setCuotasAPagar(n);
    setValorPagar(totalCuotasSeleccionadas(pendientes, n));
  }

  function pagarSoloInteresCuota() {
    if (!cuotaActual || interesCuotaActual <= 0) return;
    setCuotasAPagar(1);
    setAplicacion("solo_interes");
    setValorPagar(interesCuotaActual);
  }

  if (!prestamo) {
    return (
      <div className="text-center py-16">
        <p>Crédito no encontrado</p>
        <BackButton href={`/clientes/${clienteId}`} />
      </div>
    );
  }

  async function handleGuardar() {
    if (!prestamo || valorPagar <= 0) return;

    const tipoAbono = mapAplicacionToTipo(aplicacion);
    const input = {
      prestamo_id: prestamoId,
      monto_abonado: valorPagar,
      fecha_abono: fechaAbono,
      notas,
      tipo_abono: tipoAbono,
      plan_cuota_id: cuotaActual?.id ?? null,
      metodo_pago: metodoPago,
      aplicacion_abono: aplicacion,
      cuotas_a_pagar: cuotasAPagar,
      incluir_intereses: false,
      incluir_deuda: false,
    };

    const preview = aplicarAbono(prestamo, prestamo.plan_cuotas, input);
    const nuevoSaldo = calcularSaldoPendiente(
      preview.prestamoActualizado,
      preview.planCuotasActualizado
    );

    try {
      await registrarAbonoAvanzado(prestamoId, input);
      setUltimoAbono({ monto: valorPagar, nuevoSaldo });
      setMostrarRecibo(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo registrar el abono");
    }
  }

  const mensajeWhatsApp =
    ultimoAbono &&
    generarComprobanteWhatsAppCobrapp({
      negocio: NEGOCIO_NOMBRE,
      clienteNombre: prestamo.cliente.nombre,
      montoAbonado: ultimoAbono.monto,
      nuevoSaldo: ultimoAbono.nuevoSaldo,
    });

  const totalAutomatico = totalCuotasSeleccionadas(pendientes, cuotasAPagar);

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <BackButton
        href={`/clientes/${clienteId}/prestamos/${prestamoId}`}
        label="Detalle crédito"
      />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Registrar abono</h1>
        <p className="text-sm text-slate-500">{prestamo.cliente.nombre}</p>
      </div>

      <Card className="border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-white overflow-hidden">
        <CardContent className="pt-6 pb-5 text-center space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Monto de la cuota actual
          </p>
          <p className="text-4xl sm:text-5xl font-black text-slate-900 tabular-nums">
            {formatCurrency(montoCuotaActual)}
          </p>
          {cuotaActual ? (
            <p className="text-sm text-slate-600">
              Cuota {cuotaActual.numero_cuota}
              {cuotaActual.fecha_vencimiento &&
                ` · vence ${formatDate(cuotaActual.fecha_vencimiento)}`}
            </p>
          ) : (
            <p className="text-sm text-amber-700">Sin cuotas pendientes en el plan</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cuotas a pagar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full"
              disabled={cuotasAPagar <= 1}
              onClick={() => seleccionarCuotas(cuotasAPagar - 1)}
              aria-label="Menos cuotas"
            >
              <Minus className="h-5 w-5" />
            </Button>
            <div className="text-center min-w-[5rem]">
              <p className="text-3xl font-bold tabular-nums">{cuotasAPagar}</p>
              <p className="text-xs text-slate-500">
                {cuotasAPagar === 1 ? "cuota" : "cuotas"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full"
              disabled={cuotasAPagar >= maxCuotas}
              onClick={() => seleccionarCuotas(cuotasAPagar + 1)}
              aria-label="Más cuotas"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {Array.from({ length: Math.min(maxCuotas, 6) }, (_, i) => i + 1).map((n) => (
              <Button
                key={n}
                type="button"
                variant={cuotasAPagar === n ? "default" : "outline"}
                size="sm"
                onClick={() => seleccionarCuotas(n)}
              >
                {n} {n === 1 ? "cuota" : "cuotas"}
              </Button>
            ))}
          </div>

          {maxCuotas > 1 && (
            <p className="text-center text-xs text-slate-500">
              {pendientes.length === 1
                ? "1 cuota pendiente en el plan"
                : `${pendientes.length} cuotas pendientes en el plan`}
              {maxCuotas > pendientes.length
                ? ` · puedes cobrar hasta ${maxCuotas} períodos`
                : ""}
            </p>
          )}

          {cuotasAPagar > 1 && (
            <p className="text-center text-sm text-slate-600">
              Total de {cuotasAPagar} cuotas:{" "}
              <strong>{formatCurrency(totalAutomatico)}</strong>
            </p>
          )}

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={!cuotaActual || interesCuotaActual <= 0}
              onClick={pagarSoloInteresCuota}
              className={`w-full min-h-[3.25rem] h-auto py-3 px-4 text-left justify-between gap-3 rounded-xl border-2 font-semibold transition-colors ${
                aplicacion === "solo_interes"
                  ? "border-amber-500 bg-amber-50 text-amber-950"
                  : "border-amber-200 bg-amber-50/80 text-amber-900 hover:bg-amber-100 hover:border-amber-400"
              }`}
            >
              <span className="text-sm leading-snug">
                Pagar solo interés de la cuota
              </span>
              <span className="text-base font-black tabular-nums shrink-0">
                {formatCurrency(interesCuotaActual)}
              </span>
            </Button>

            <div className="space-y-2">
              <Label htmlFor="valor_pagar">Valor a pagar</Label>
            <Input
              id="valor_pagar"
              type="number"
              min={0}
              value={valorPagar || ""}
              onChange={(e) => setValorPagar(Number(e.target.value))}
              className="h-14 text-2xl font-bold text-center tabular-nums"
            />
            <p className="text-xs text-slate-500 text-center">
              Prellenado con{" "}
              {cuotasAPagar === 1
                ? "la cuota actual"
                : `las ${cuotasAPagar} cuotas seleccionadas`}
              . Puedes cambiarlo si el cliente paga otro monto.
            </p>
            {valorPagar !== totalAutomatico && totalAutomatico > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-emerald-700"
                onClick={() => setValorPagar(totalAutomatico)}
              >
                Restablecer a {formatCurrency(totalAutomatico)}
              </Button>
            )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium uppercase text-slate-500 mb-2">
          Referencia del crédito
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-slate-500">Deuda total</p>
            <p className="font-semibold text-slate-800">
              {formatCurrency(prestamo.saldo_pendiente)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Intereses pendientes</p>
            <p className="font-semibold text-slate-800">
              {formatCurrency(interesPendiente)}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>Aplicación del abono</Label>
            <div className="grid gap-2">
              {APLICACIONES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAplicacion(a)}
                  className={`rounded-xl border p-3 text-left text-sm font-medium ${
                    aplicacion === a
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200"
                  }`}
                >
                  {LABEL_APLICACION_ABONO[a]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Método de pago</Label>
            <Input
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
              placeholder="Efectivo, Nequi, transferencia..."
            />
          </div>

          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input
              type="date"
              value={fechaAbono}
              onChange={(e) => setFechaAbono(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Nota</Label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        {mensajeWhatsApp && prestamo.cliente.telefono && (
          <Button
            asChild
            variant="outline"
            className="h-12 border-[#25D366] text-[#128C7E]"
          >
            <a
              href={generarEnlaceWhatsApp(prestamo.cliente.telefono, mensajeWhatsApp)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="h-4 w-4" />
              Compartir por WhatsApp
            </a>
          </Button>
        )}

        {mostrarRecibo && ultimoAbono && (
          <div ref={reciboRef}>
            <ReciboPago
              data={{
                negocio: NEGOCIO_NOMBRE,
                cliente_nombre: prestamo.cliente.nombre,
                cliente_telefono: prestamo.cliente.telefono,
                monto_abonado: ultimoAbono.monto,
                saldo_anterior: prestamo.saldo_pendiente,
                nuevo_saldo: ultimoAbono.nuevoSaldo,
                fecha_hora: new Date().toISOString(),
                notas: `${metodoPago}${notas ? ` — ${notas}` : ""}`,
              }}
            />
          </div>
        )}

        <Button
          variant="outline"
          className="h-12"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" /> Imprimir recibo
        </Button>

        <Button
          className="h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-700"
          onClick={() => void handleGuardar()}
          disabled={mutating || valorPagar <= 0}
        >
          <Save className="h-5 w-5" />
          Guardar cuota
        </Button>

        {mostrarRecibo && (
          <Button
            variant="ghost"
            onClick={() =>
              router.push(`/clientes/${clienteId}/prestamos/${prestamoId}`)
            }
          >
            Volver al crédito
          </Button>
        )}
      </div>
    </div>
  );
}
