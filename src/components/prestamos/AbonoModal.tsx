"use client";

import { useEffect, useState } from "react";
import { DollarSign, Landmark, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReciboPago } from "./ReciboPago";
import type { NuevoAbonoInput, PrestamoConCliente, ReciboPagoData, TipoAbono } from "@/types";
import { saldoCuotaPlan } from "@/lib/calculations";
import { formatCurrency, formatDate, NEGOCIO_NOMBRE } from "@/lib/utils";

interface AbonoModalProps {
  prestamo: PrestamoConCliente;
  onAbono: (abono: NuevoAbonoInput) => Promise<void>;
  disabled?: boolean;
}

type PasoModal = "formulario" | "recibo";

export function AbonoModal({ prestamo, onAbono, disabled }: AbonoModalProps) {
  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState<PasoModal>("formulario");
  const [tipoAbono, setTipoAbono] = useState<TipoAbono>(
    prestamo.tipo_prestamo === "solo_interes" ? "interes" : "cuota"
  );
  const [monto, setMonto] = useState(0);
  const [notas, setNotas] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [reciboData, setReciboData] = useState<ReciboPagoData | null>(null);
  const [guardando, setGuardando] = useState(false);

  const proximaCuota = prestamo.proxima_cuota;
  const saldoProximaCuota = proximaCuota ? saldoCuotaPlan(proximaCuota) : 0;
  const montoSugerido =
    prestamo.tipo_prestamo === "solo_interes"
      ? tipoAbono === "capital"
        ? prestamo.saldo_capital
        : prestamo.interes_periodo ?? saldoProximaCuota
      : saldoProximaCuota;

  useEffect(() => {
    if (open) {
      setMonto(montoSugerido);
    }
  }, [open, montoSugerido]);

  function resetFormulario() {
    setPaso("formulario");
    setTipoAbono(prestamo.tipo_prestamo === "solo_interes" ? "interes" : "cuota");
    setMonto(montoSugerido);
    setNotas("");
    setFecha(new Date().toISOString().split("T")[0]);
    setReciboData(null);
  }

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) resetFormulario();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (monto <= 0) {
      alert("El monto debe ser mayor a cero");
      return;
    }

    if (tipoAbono === "capital" && monto > prestamo.saldo_capital) {
      alert(`El abono a capital no puede superar ${formatCurrency(prestamo.saldo_capital)}`);
      return;
    }

    let notasFinal = notas;
    if (!notasFinal) {
      if (prestamo.tipo_prestamo === "solo_interes") {
        notasFinal =
          tipoAbono === "capital"
            ? monto >= prestamo.saldo_capital
              ? "Liquidación de capital"
              : "Abono a capital"
            : monto >= saldoProximaCuota
              ? "Pago de interés completo"
              : "Pago parcial de interés";
      } else {
        notasFinal =
          monto >= saldoProximaCuota
            ? "Cuota completa"
            : "Abono parcial a cuota";
      }
    }

    const saldoAnterior = prestamo.saldo_pendiente;
    const nuevoSaldo =
      tipoAbono === "capital"
        ? Math.max(0, saldoAnterior - monto)
        : Math.max(0, saldoAnterior - monto);

    setGuardando(true);
    try {
      await onAbono({
        prestamo_id: prestamo.id,
        monto_abonado: monto,
        fecha_abono: fecha,
        notas: notasFinal,
        tipo_abono: tipoAbono,
        plan_cuota_id: proximaCuota?.id ?? null,
      });

      setReciboData({
        negocio: NEGOCIO_NOMBRE,
        cliente_nombre: prestamo.cliente.nombre,
        cliente_telefono: prestamo.cliente.telefono,
        monto_abonado: monto,
        saldo_anterior: saldoAnterior,
        nuevo_saldo: nuevoSaldo,
        fecha_hora: new Date().toISOString(),
        notas: notasFinal,
      });

      setPaso("recibo");
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo registrar el abono.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled || guardando}>
          <DollarSign className="h-4 w-4" />
          Abonar
        </Button>
      </DialogTrigger>
      <DialogContent className={paso === "recibo" ? "sm:max-w-md" : undefined}>
        {paso === "formulario" ? (
          <>
            <DialogHeader>
              <DialogTitle>Registrar Abono</DialogTitle>
              <DialogDescription>
                Cliente: <strong>{prestamo.cliente.nombre}</strong>
                {prestamo.tipo_prestamo === "solo_interes" && (
                  <>
                    {" "}
                    — Capital vigente: {formatCurrency(prestamo.saldo_capital)}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              {prestamo.tipo_prestamo === "solo_interes" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTipoAbono("interes");
                      setMonto(prestamo.interes_periodo ?? saldoProximaCuota);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
                      tipoAbono === "interes"
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    <Percent className="h-4 w-4" />
                    Pagar interés
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTipoAbono("capital");
                      setMonto(prestamo.saldo_capital);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
                      tipoAbono === "capital"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    <Landmark className="h-4 w-4" />
                    Liquidar / Abonar a Capital
                  </button>
                </div>
              )}

              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <p>
                  Saldo pendiente total:{" "}
                  <strong>{formatCurrency(prestamo.saldo_pendiente)}</strong>
                </p>
                {proximaCuota && tipoAbono !== "capital" && (
                  <p className="text-slate-500">
                    Próxima cuota (#{proximaCuota.numero_cuota}):{" "}
                    {formatCurrency(saldoProximaCuota)} — vence{" "}
                    {formatDate(proximaCuota.fecha_vencimiento)}
                    {proximaCuota.estado === "parcial" && " (parcial)"}
                  </p>
                )}
                {prestamo.tipo_prestamo !== "solo_interes" && (
                  <p className="text-slate-500">
                    Cuotas pagadas: {prestamo.cuotas_pagadas} /{" "}
                    {prestamo.plan_cuotas.length}
                  </p>
                )}
                {tipoAbono === "capital" && (
                  <p className="text-emerald-700">
                    Capital actual: {formatCurrency(prestamo.saldo_capital)} — nuevo
                    interés se recalcula automáticamente
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="monto_abono">Monto del Abono</Label>
                <Input
                  id="monto_abono"
                  type="number"
                  min={1}
                  max={tipoAbono === "capital" ? prestamo.saldo_capital : undefined}
                  value={monto || ""}
                  onChange={(e) => setMonto(Number(e.target.value))}
                />
                {tipoAbono !== "capital" && monto > 0 && monto < saldoProximaCuota && (
                  <p className="text-xs text-amber-600">
                    Abono parcial — quedará saldo en la cuota
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fecha_abono">Fecha del Abono</Label>
                <Input
                  id="fecha_abono"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notas">Notas (opcional)</Label>
                <Input
                  id="notas"
                  placeholder="Ej: Pago en efectivo..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={guardando || disabled}>
                  <DollarSign className="h-4 w-4" />
                  {guardando ? "Guardando..." : "Registrar Abono"}
                </Button>
              </div>
            </form>
          </>
        ) : (
          reciboData && (
            <>
              <DialogHeader>
                <DialogTitle>Recibo de Pago</DialogTitle>
                <DialogDescription>
                  Abono registrado exitosamente.
                </DialogDescription>
              </DialogHeader>
              <ReciboPago data={reciboData} onClose={() => setOpen(false)} />
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
