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
import type { FrecuenciaPago, PrestamoConCliente } from "@/types";
import { formatCurrency } from "@/lib/utils";

const frecuencias: FrecuenciaPago[] = ["diario", "semanal", "quincenal", "mensual"];

interface PrestamoEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestamo: PrestamoConCliente | null;
  onSave: (data: {
    monto_prestado: number;
    frecuencia: FrecuenciaPago;
    valor_cuota: number;
    total_cuotas: number;
    fecha_inicio: string;
  }) => void;
}

export function PrestamoEditModal({
  open,
  onOpenChange,
  prestamo,
  onSave,
}: PrestamoEditModalProps) {
  const [monto, setMonto] = useState(0);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>("semanal");
  const [valorCuota, setValorCuota] = useState(0);
  const [totalCuotas, setTotalCuotas] = useState(0);
  const [fechaInicio, setFechaInicio] = useState("");

  useEffect(() => {
    if (open && prestamo) {
      setMonto(prestamo.monto_prestado);
      setFrecuencia(prestamo.frecuencia);
      setValorCuota(prestamo.valor_cuota);
      setTotalCuotas(prestamo.total_cuotas);
      setFechaInicio(prestamo.fecha_inicio);
    }
  }, [open, prestamo]);

  if (!prestamo) return null;

  const totalEsperado = valorCuota * totalCuotas;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (monto <= 0 || valorCuota <= 0 || totalCuotas <= 0) {
      alert("Complete todos los campos con valores válidos");
      return;
    }

    onSave({
      monto_prestado: monto,
      frecuencia,
      valor_cuota: valorCuota,
      total_cuotas: totalCuotas,
      fecha_inicio: fechaInicio,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Préstamo</DialogTitle>
          <DialogDescription>
            Cliente: <strong>{prestamo.cliente.nombre}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit_monto">Monto Prestado</Label>
            <Input
              id="edit_monto"
              type="number"
              min={1}
              value={monto || ""}
              onChange={(e) => setMonto(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_frecuencia">Frecuencia</Label>
            <Select value={frecuencia} onValueChange={(v) => setFrecuencia(v as FrecuenciaPago)}>
              <SelectTrigger id="edit_frecuencia">
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
          <div className="space-y-2">
            <Label htmlFor="edit_cuotas">Número de Cuotas</Label>
            <Input
              id="edit_cuotas"
              type="number"
              min={1}
              value={totalCuotas || ""}
              onChange={(e) => setTotalCuotas(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_valor_cuota">Valor de Cuota</Label>
            <Input
              id="edit_valor_cuota"
              type="number"
              min={1}
              value={valorCuota || ""}
              onChange={(e) => setValorCuota(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="edit_fecha">Fecha de Inicio</Label>
            <Input
              id="edit_fecha"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>

          {totalEsperado > 0 && (
            <div className="sm:col-span-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">
              Total a pagar: <strong>{formatCurrency(totalEsperado)}</strong>
              {monto > 0 && (
                <span className="ml-2 text-blue-600">
                  (Interés: {formatCurrency(totalEsperado - monto)})
                </span>
              )}
            </div>
          )}

          <DialogFooter className="sm:col-span-2">
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
