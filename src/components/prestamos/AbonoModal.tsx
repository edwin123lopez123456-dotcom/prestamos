"use client";

import { useState } from "react";
import { DollarSign } from "lucide-react";
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
import type { Abono, PrestamoConCliente, ReciboPagoData } from "@/types";
import { formatCurrency, NEGOCIO_NOMBRE } from "@/lib/utils";

interface AbonoModalProps {
  prestamo: PrestamoConCliente;
  onAbono: (abono: Omit<Abono, "id">) => Promise<void>;
  disabled?: boolean;
}

type PasoModal = "formulario" | "recibo";

export function AbonoModal({ prestamo, onAbono, disabled }: AbonoModalProps) {
  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState<PasoModal>("formulario");
  const [monto, setMonto] = useState(prestamo.valor_cuota);
  const [notas, setNotas] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [reciboData, setReciboData] = useState<ReciboPagoData | null>(null);
  const [guardando, setGuardando] = useState(false);

  const diferencia = monto - prestamo.valor_cuota;

  function resetFormulario() {
    setPaso("formulario");
    setMonto(prestamo.valor_cuota);
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

    const notasFinal =
      notas ||
      (diferencia === 0
        ? "Cuota completa"
        : diferencia > 0
          ? "Abono mayor a cuota"
          : "Abono parcial");

    const saldoAnterior = prestamo.saldo_pendiente;
    const nuevoSaldo = Math.max(0, saldoAnterior - monto);
    const fechaHora = new Date().toISOString();

    setGuardando(true);
    try {
      await onAbono({
        prestamo_id: prestamo.id,
        monto_abonado: monto,
        fecha_abono: fecha,
        notas: notasFinal,
      });

      setReciboData({
        negocio: NEGOCIO_NOMBRE,
        cliente_nombre: prestamo.cliente.nombre,
        cliente_telefono: prestamo.cliente.telefono,
        monto_abonado: monto,
        saldo_anterior: saldoAnterior,
        nuevo_saldo: nuevoSaldo,
        fecha_hora: fechaHora,
        notas: notasFinal,
      });

      setPaso("recibo");
    } catch {
      alert("No se pudo registrar el abono.");
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
                Cliente: <strong>{prestamo.cliente.nombre}</strong> — Cuota
                estándar: {formatCurrency(prestamo.valor_cuota)}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <p>
                  Saldo pendiente:{" "}
                  <strong className="text-slate-900">
                    {formatCurrency(prestamo.saldo_pendiente)}
                  </strong>
                </p>
                <p className="text-slate-500">
                  Cuotas pagadas: {prestamo.cuotas_pagadas} /{" "}
                  {prestamo.total_cuotas}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="monto_abono">Monto del Abono</Label>
                <Input
                  id="monto_abono"
                  type="number"
                  min={1}
                  value={monto || ""}
                  onChange={(e) => setMonto(Number(e.target.value))}
                />
                {diferencia !== 0 && (
                  <p
                    className={`text-xs ${
                      diferencia > 0 ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {diferencia > 0
                      ? `+${formatCurrency(diferencia)} sobre la cuota estándar`
                      : `${formatCurrency(Math.abs(diferencia))} menos que la cuota estándar (abono parcial)`}
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
                  placeholder="Ej: Pago en efectivo, abono parcial..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
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
                  Abono registrado exitosamente. Puede imprimir o compartir el
                  recibo.
                </DialogDescription>
              </DialogHeader>
              <ReciboPago
                data={reciboData}
                onClose={() => setOpen(false)}
              />
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
