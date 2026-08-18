"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FrecuenciaPago, Prestamo, PrestamoConCliente } from "@/types";
import { formatCurrency, formatFrecuencia, formatTipoPrestamo } from "@/lib/utils";

const frecuenciasInteres: FrecuenciaPago[] = ["diario", "semanal", "mensual"];

interface PrestamoEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamo: PrestamoConCliente | null;
  onSave: (data: Partial<Prestamo>) => void;
}

export function PrestamoEditModal({
  open,
  onOpenChange,
  prestamo,
  onSave,
}: PrestamoEditModalProps) {
  const [valorInteres, setValorInteres] = useState(0);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>("mensual");
  const [fechaInicio, setFechaInicio] = useState("");

  useEffect(() => {
    if (open && prestamo) {
      setValorInteres(prestamo.valor_cuota ?? 0);
      setFrecuencia(prestamo.frecuencia);
      setFechaInicio(prestamo.fecha_inicio);
    }
  }, [open, prestamo]);

  if (!prestamo) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prestamo) return;

    if (prestamo.tipo_prestamo === "solo_interes") {
      if (valorInteres <= 0) {
        alert("Ingrese un valor de interés válido");
        return;
      }
      onSave({
        valor_cuota: valorInteres,
        frecuencia,
        fecha_inicio: fechaInicio,
      });
    } else {
      onSave({ fecha_inicio: fechaInicio });
    }

    onOpenChange(false);
  }

  const esPlanFijo =
    prestamo.tipo_prestamo === "cuotas_manuales" ||
    prestamo.tipo_prestamo === "cuotas_fijas";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Préstamo</DialogTitle>
          <DialogDescription>
            Cliente: <strong>{prestamo.cliente.nombre}</strong> —{" "}
            {formatTipoPrestamo(prestamo.tipo_prestamo)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {esPlanFijo ? (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600">
              <p>
                Capital: <strong>{formatCurrency(prestamo.monto_prestado)}</strong>
              </p>
              <p className="mt-1">
                Saldo pendiente:{" "}
                <strong>{formatCurrency(prestamo.saldo_pendiente)}</strong>
              </p>
              {prestamo.tipo_prestamo === "cuotas_fijas" && prestamo.valor_cuota && (
                <p className="mt-1">
                  {prestamo.total_cuotas} cuotas de{" "}
                  {formatCurrency(prestamo.valor_cuota)} —{" "}
                  {formatFrecuencia(prestamo.frecuencia)}
                </p>
              )}
              {prestamo.tipo_prestamo === "cuotas_manuales" && (
                <p className="mt-1">
                  {prestamo.plan_cuotas.length} cuotas — {prestamo.cuotas_pagadas}{" "}
                  pagadas
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                El plan de cuotas no se edita aquí para preservar el historial.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Capital vigente</Label>
                  <Input value={formatCurrency(prestamo.saldo_capital)} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_interes">Interés por período ($)</Label>
                  <Input
                    id="edit_interes"
                    type="number"
                    min={0}
                    value={valorInteres || ""}
                    onChange={(e) => setValorInteres(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit_frecuencia">Frecuencia de cobro</Label>
                  <Select
                    value={frecuencia}
                    onValueChange={(v) => setFrecuencia(v as FrecuenciaPago)}
                  >
                    <SelectTrigger id="edit_frecuencia">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {frecuenciasInteres.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit_fecha">Fecha de Inicio</Label>
            <Input
              id="edit_fecha"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Guardar cambios</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
