"use client";

import { useMemo, useState } from "react";
import { Download, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AbonoModal } from "./AbonoModal";
import { PrestamoEditModal } from "./PrestamoEditModal";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { MoraSemaforo, MoraDot } from "@/components/shared/MoraSemaforo";
import { useDataStore } from "@/context/DataStoreContext";
import type { NuevoAbonoInput, Prestamo, PrestamoConCliente } from "@/types";
import {
  formatCurrency,
  formatDate,
  formatEstado,
  formatFrecuencia,
  formatTipoPrestamo,
} from "@/lib/utils";
import { exportarPrestamosExcel } from "@/lib/excel";
import { useAppContext } from "@/components/layout/MainLayout";
import { contarCuotasPagadas } from "@/lib/calculations";

interface PrestamosListProps {
  prestamos: PrestamoConCliente[];
  onAbono: (prestamoId: string, abono: NuevoAbonoInput) => Promise<void>;
  disabled?: boolean;
}

function EstadoBadge({ estado }: { estado: Prestamo["estado"] }) {
  const variants: Record<Prestamo["estado"], "success" | "warning" | "destructive"> = {
    pagado: "success",
    pendiente: "warning",
    atrasado: "destructive",
  };
  return <Badge variant={variants[estado]}>{formatEstado(estado)}</Badge>;
}

function calcularProgreso(prestamo: PrestamoConCliente): number {
  if (prestamo.estado === "pagado") return 100;
  if (prestamo.tipo_prestamo === "solo_interes") {
    if (prestamo.monto_prestado <= 0) return 0;
    const capitalPagado = prestamo.monto_prestado - prestamo.saldo_capital;
    return Math.min(100, (capitalPagado / prestamo.monto_prestado) * 100);
  }
  const total = prestamo.plan_cuotas.length || prestamo.total_cuotas || 0;
  if (total === 0) return 0;
  return (contarCuotasPagadas(prestamo.plan_cuotas) / total) * 100;
}

function textoProgreso(prestamo: PrestamoConCliente): string {
  if (prestamo.tipo_prestamo === "solo_interes") {
    return `Capital: ${formatCurrency(prestamo.saldo_capital)} de ${formatCurrency(prestamo.monto_prestado)}`;
  }
  const pagadas = contarCuotasPagadas(prestamo.plan_cuotas);
  const total = prestamo.plan_cuotas.length || prestamo.total_cuotas || 0;
  return `${pagadas}/${total} cuotas`;
}

function textoCuota(prestamo: PrestamoConCliente): string {
  if (prestamo.tipo_prestamo === "solo_interes") {
    return prestamo.valor_cuota
      ? `${formatCurrency(prestamo.valor_cuota)} / ${formatFrecuencia(prestamo.frecuencia)}`
      : "—";
  }
  if (prestamo.tipo_prestamo === "cuotas_fijas" && prestamo.valor_cuota) {
    return `${formatCurrency(prestamo.valor_cuota)} fijas`;
  }
  const prox = prestamo.proxima_cuota;
  return prox ? formatCurrency(prox.monto_cuota) : "—";
}

export function PrestamosList({ prestamos, onAbono, disabled }: PrestamosListProps) {
  const { searchQuery } = useAppContext();
  const { updatePrestamo, deletePrestamo } = useDataStore();
  const [editTarget, setEditTarget] = useState<PrestamoConCliente | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrestamoConCliente | null>(null);

  const prestamosFiltrados = useMemo(() => {
    if (!searchQuery.trim()) return prestamos;
    const q = searchQuery.toLowerCase();
    return prestamos.filter(
      (p) =>
        p.cliente.nombre.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        formatEstado(p.estado).toLowerCase().includes(q) ||
        formatTipoPrestamo(p.tipo_prestamo).toLowerCase().includes(q)
    );
  }, [prestamos, searchQuery]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs">
          <span className="font-medium text-slate-600">Semáforo de mora:</span>
          <MoraSemaforo mora={{ dias_atraso: 0, semaforo: "verde", fecha_proxima_cuota: "" }} size="sm" />
          <MoraSemaforo mora={{ dias_atraso: 3, semaforo: "amarillo", fecha_proxima_cuota: "" }} size="sm" />
          <MoraSemaforo mora={{ dias_atraso: 10, semaforo: "rojo", fecha_proxima_cuota: "" }} size="sm" />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportarPrestamosExcel(prestamos)}
          disabled={disabled}
        >
          <Download className="h-4 w-4" />
          Exportar Excel
        </Button>
      </div>

      <p className="text-sm text-slate-500">
        {prestamosFiltrados.length} préstamo{prestamosFiltrados.length !== 1 ? "s" : ""}
      </p>

      <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left font-medium text-slate-600 w-8"></th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Cliente</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Capital</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Próx. cuota</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Progreso</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Saldo</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Mora</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Estado</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {prestamosFiltrados.map((prestamo) => (
              <tr
                key={prestamo.id}
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <MoraDot mora={prestamo.mora} />
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{prestamo.cliente.nombre}</p>
                  <p className="text-xs text-slate-400">{formatDate(prestamo.fecha_inicio)}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-xs font-normal">
                    {formatTipoPrestamo(prestamo.tipo_prestamo)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {prestamo.tipo_prestamo === "solo_interes"
                    ? formatCurrency(prestamo.saldo_capital)
                    : formatCurrency(prestamo.monto_prestado)}
                </td>
                <td className="px-4 py-3 text-slate-700">{textoCuota(prestamo)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all"
                        style={{ width: `${calcularProgreso(prestamo)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{textoProgreso(prestamo)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {formatCurrency(prestamo.saldo_pendiente)}
                </td>
                <td className="px-4 py-3">
                  {prestamo.estado !== "pagado" ? (
                    <MoraSemaforo mora={prestamo.mora} size="sm" />
                  ) : (
                    <Badge variant="success">Liquidado</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <EstadoBadge estado={prestamo.estado} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {prestamo.estado !== "pagado" && (
                      <AbonoModal
                        prestamo={prestamo}
                        onAbono={(abono) => onAbono(prestamo.id, abono)}
                        disabled={disabled}
                      />
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => setEditTarget(prestamo)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(prestamo)}
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden space-y-3">
        {prestamosFiltrados.map((prestamo) => (
          <Card
            key={prestamo.id}
            className={
              prestamo.estado !== "pagado"
                ? prestamo.mora.semaforo === "rojo"
                  ? "border-red-200"
                  : prestamo.mora.semaforo === "amarillo"
                    ? "border-amber-200"
                    : "border-emerald-200"
                : undefined
            }
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  {prestamo.estado !== "pagado" && (
                    <MoraDot mora={prestamo.mora} className="mt-1" />
                  )}
                  <div>
                    <p className="font-semibold text-slate-900">{prestamo.cliente.nombre}</p>
                    <p className="text-xs text-slate-400">
                      {formatTipoPrestamo(prestamo.tipo_prestamo)} —{" "}
                      {formatDate(prestamo.fecha_inicio)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <EstadoBadge estado={prestamo.estado} />
                  {prestamo.estado !== "pagado" && (
                    <MoraSemaforo mora={prestamo.mora} size="sm" />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-slate-400">
                    {prestamo.tipo_prestamo === "solo_interes"
                      ? "Capital vigente"
                      : "Monto prestado"}
                  </p>
                  <p className="font-medium">
                    {prestamo.tipo_prestamo === "solo_interes"
                      ? formatCurrency(prestamo.saldo_capital)
                      : formatCurrency(prestamo.monto_prestado)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Próxima cuota</p>
                  <p className="font-medium">{textoCuota(prestamo)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Saldo pendiente</p>
                  <p className="font-medium text-blue-700">
                    {formatCurrency(prestamo.saldo_pendiente)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Progreso</p>
                  <p className="font-medium">{textoProgreso(prestamo)}</p>
                </div>
              </div>

              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${calcularProgreso(prestamo)}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {prestamo.estado !== "pagado" && (
                  <AbonoModal
                    prestamo={prestamo}
                    onAbono={(abono) => onAbono(prestamo.id, abono)}
                    disabled={disabled}
                  />
                )}
                <Button size="sm" variant="outline" onClick={() => setEditTarget(prestamo)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200"
                  onClick={() => setDeleteTarget(prestamo)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PrestamoEditModal
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        prestamo={editTarget}
        onSave={async (data) => {
          if (editTarget) {
            try {
              await updatePrestamo(editTarget.id, data);
            } catch {
              alert("No se pudo actualizar el préstamo.");
              throw new Error("update failed");
            }
          }
        }}
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar préstamo?"
        description="Se eliminarán también todos los abonos y cuotas asociadas. Esta acción no se puede deshacer."
        itemName={
          deleteTarget
            ? `${deleteTarget.cliente.nombre} — ${formatCurrency(deleteTarget.monto_prestado)}`
            : undefined
        }
        onConfirm={async () => {
          if (deleteTarget) {
            try {
              await deletePrestamo(deleteTarget.id);
              setDeleteTarget(null);
            } catch {
              alert("No se pudo eliminar el préstamo.");
            }
          }
        }}
      />
    </div>
  );
}
