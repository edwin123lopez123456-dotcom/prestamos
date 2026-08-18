"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Pencil, Trash2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/shared/BackButton";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { useDataStore } from "@/context/DataStoreContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import { LABEL_TIPO_INTERES } from "@/lib/loan-simulator";
import { cn } from "@/lib/utils";
import type { PlanCuota } from "@/types";

type FiltroCuota = "todas" | "pendientes" | "pagadas" | "vencidas" | "anuladas";

interface PrestamoDetalleViewProps {
  clienteId: string;
  prestamoId: string;
}

function filtrarCuotas(cuotas: PlanCuota[], filtro: FiltroCuota): PlanCuota[] {
  const hoy = new Date().toISOString().split("T")[0];
  switch (filtro) {
    case "pendientes":
      return cuotas.filter((c) => c.estado === "pendiente" || c.estado === "parcial");
    case "pagadas":
      return cuotas.filter((c) => c.estado === "pagada");
    case "vencidas":
      return cuotas.filter(
        (c) =>
          (c.estado === "pendiente" || c.estado === "parcial") &&
          c.fecha_vencimiento < hoy
      );
    case "anuladas":
      return cuotas.filter((c) => c.estado === "anulada");
    default:
      return cuotas;
  }
}

export function PrestamoDetalleView({
  clienteId,
  prestamoId,
}: PrestamoDetalleViewProps) {
  const router = useRouter();
  const {
    getPrestamoEnriquecido,
    getAbonosByPrestamo,
    deletePrestamo,
  } = useDataStore();

  const prestamo = getPrestamoEnriquecido(prestamoId);
  const abonos = getAbonosByPrestamo(prestamoId);
  const [filtro, setFiltro] = useState<FiltroCuota>("pendientes");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const cuotasFiltradas = useMemo(
    () => (prestamo ? filtrarCuotas(prestamo.plan_cuotas, filtro) : []),
    [prestamo, filtro]
  );

  if (!prestamo) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>Crédito no encontrado</p>
        <BackButton href={`/clientes/${clienteId}`} />
      </div>
    );
  }

  async function handleDelete() {
    await deletePrestamo(prestamoId);
    router.push(`/clientes/${clienteId}`);
  }

  const tabs: { id: FiltroCuota; label: string }[] = [
    { id: "pendientes", label: "Pendientes" },
    { id: "pagadas", label: "Pagadas" },
    { id: "vencidas", label: "Vencidas" },
    { id: "anuladas", label: "Anuladas" },
    { id: "todas", label: "Todas" },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <BackButton href={`/clientes/${clienteId}`} label={prestamo.cliente.nombre} />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Crédito {formatCurrency(prestamo.monto_prestado)}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {prestamo.tipo_interes
              ? LABEL_TIPO_INTERES[prestamo.tipo_interes]
              : prestamo.tipo_prestamo}{" "}
            · {prestamo.tasa_interes ? `${prestamo.tasa_interes}%` : ""} · Inicio{" "}
            {formatDate(prestamo.fecha_inicio)}
          </p>
          {prestamo.nota && (
            <p className="text-sm text-slate-600 mt-2 italic">{prestamo.nota}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              router.push(
                `/clientes/${clienteId}/prestamos/${prestamoId}/abonar`
              )
            }
          >
            <DollarSign className="h-4 w-4" /> Registrar abono
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500">Saldo pendiente</p>
            <p className="text-lg font-bold text-emerald-700">
              {formatCurrency(prestamo.saldo_pendiente)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500">Capital</p>
            <p className="text-lg font-bold">{formatCurrency(prestamo.saldo_capital)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500">Abonado</p>
            <p className="text-lg font-bold">{formatCurrency(prestamo.total_abonado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500">Cuotas pagadas</p>
            <p className="text-lg font-bold">
              {prestamo.cuotas_pagadas}/{prestamo.plan_cuotas.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Plan de pagos
          </CardTitle>
          <div className="flex flex-wrap gap-1 pt-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFiltro(t.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  filtro === t.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Vence</th>
                <th className="py-2 pr-2 text-right">Cuota</th>
                <th className="py-2 pr-2 text-right">Pagado</th>
                <th className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cuotasFiltradas.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="py-2.5">{c.numero_cuota}</td>
                  <td className="py-2.5">{formatDate(c.fecha_vencimiento)}</td>
                  <td className="py-2.5 text-right font-medium">
                    {formatCurrency(c.monto_cuota)}
                  </td>
                  <td className="py-2.5 text-right text-slate-500">
                    {formatCurrency(c.monto_pagado)}
                  </td>
                  <td className="py-2.5">
                    <Badge
                      variant={
                        c.estado === "pagada"
                          ? "default"
                          : c.estado === "anulada"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-[10px] capitalize"
                    >
                      {c.estado}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de abonos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {abonos.length === 0 ? (
            <p className="text-sm text-slate-400">Sin abonos registrados.</p>
          ) : (
            abonos.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{formatCurrency(a.monto_abonado)}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(a.fecha_abono)} · {a.aplicacion_abono}
                    {a.metodo_pago ? ` · ${a.metodo_pago}` : ""}
                  </p>
                </div>
                <Badge variant="secondary">{a.tipo_abono}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="¿Eliminar crédito?"
        description="Se eliminarán cuotas y abonos asociados."
        itemName={formatCurrency(prestamo.monto_prestado)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
