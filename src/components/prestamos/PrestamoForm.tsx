"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
import type { Cliente, FrecuenciaPago, NuevoPrestamoInput } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface PrestamoFormProps {
  clientes: Cliente[];
  onSubmit: (input: NuevoPrestamoInput) => Promise<void>;
  disabled?: boolean;
}

const frecuencias: FrecuenciaPago[] = ["diario", "semanal", "quincenal", "mensual"];

export function PrestamoForm({ clientes, onSubmit, disabled }: PrestamoFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<NuevoPrestamoInput>({
    cliente_id: "",
    monto_prestado: 0,
    frecuencia: "semanal",
    valor_cuota: 0,
    total_cuotas: 0,
    fecha_inicio: new Date().toISOString().split("T")[0],
  });

  const totalEsperado = form.valor_cuota * form.total_cuotas;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cliente_id || form.monto_prestado <= 0 || form.valor_cuota <= 0 || form.total_cuotas <= 0) {
      alert("Complete todos los campos requeridos");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(form);
      setForm({
        cliente_id: "",
        monto_prestado: 0,
        frecuencia: "semanal",
        valor_cuota: 0,
        total_cuotas: 0,
        fecha_inicio: new Date().toISOString().split("T")[0],
      });
    } catch {
      alert("No se pudo crear el préstamo. Verifique la conexión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-5 w-5 text-blue-600" />
          Registrar Nuevo Préstamo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cliente">Cliente</Label>
            <Select
              value={form.cliente_id}
              onValueChange={(v) => setForm({ ...form, cliente_id: v })}
            >
              <SelectTrigger id="cliente">
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

          <div className="space-y-2">
            <Label htmlFor="monto">Monto Prestado</Label>
            <Input
              id="monto"
              type="number"
              min={0}
              placeholder="500000"
              value={form.monto_prestado || ""}
              onChange={(e) =>
                setForm({ ...form, monto_prestado: Number(e.target.value) })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="frecuencia">Frecuencia de Pago</Label>
            <Select
              value={form.frecuencia}
              onValueChange={(v) =>
                setForm({ ...form, frecuencia: v as FrecuenciaPago })
              }
            >
              <SelectTrigger id="frecuencia">
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
            <Label htmlFor="cuotas">Número de Cuotas</Label>
            <Input
              id="cuotas"
              type="number"
              min={1}
              placeholder="12"
              value={form.total_cuotas || ""}
              onChange={(e) =>
                setForm({ ...form, total_cuotas: Number(e.target.value) })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor_cuota">Valor de Cada Cuota</Label>
            <Input
              id="valor_cuota"
              type="number"
              min={0}
              placeholder="55000"
              value={form.valor_cuota || ""}
              onChange={(e) =>
                setForm({ ...form, valor_cuota: Number(e.target.value) })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha_inicio">Fecha de Inicio</Label>
            <Input
              id="fecha_inicio"
              type="date"
              value={form.fecha_inicio}
              onChange={(e) =>
                setForm({ ...form, fecha_inicio: e.target.value })
              }
            />
          </div>

          {/* Resumen calculado */}
          {totalEsperado > 0 && (
            <div className="sm:col-span-2 rounded-lg bg-blue-50 border border-blue-100 p-4 space-y-1">
              <p className="text-sm font-medium text-blue-900">Resumen del préstamo</p>
              <p className="text-sm text-blue-700">
                Total a pagar: <strong>{formatCurrency(totalEsperado)}</strong>
              </p>
              <p className="text-sm text-blue-700">
                {form.total_cuotas} cuotas de {formatCurrency(form.valor_cuota)} —{" "}
                {form.frecuencia}
              </p>
              {form.monto_prestado > 0 && (
                <p className="text-xs text-blue-600">
                  Interés estimado:{" "}
                  {formatCurrency(totalEsperado - form.monto_prestado)} (
                  {(((totalEsperado - form.monto_prestado) / form.monto_prestado) * 100).toFixed(1)}%)
                </p>
              )}
            </div>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" className="w-full sm:w-auto" disabled={disabled || submitting}>
              <Plus className="h-4 w-4" />
              {submitting ? "Guardando..." : "Crear Préstamo"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
