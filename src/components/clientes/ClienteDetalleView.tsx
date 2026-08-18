"use client";

import { useRouter } from "next/navigation";
import {
  Phone,
  MapPin,
  Calendar,
  Pencil,
  Trash2,
  UserX,
  UserCheck,
  Plus,
  HandCoins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/BackButton";
import { MoraSemaforo } from "@/components/shared/MoraSemaforo";
import { ClienteFormModal } from "@/components/clientes/ClienteFormModal";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { useDataStore } from "@/context/DataStoreContext";
import { formatCurrency, formatDate, formatTipoPrestamo } from "@/lib/utils";
import { LABEL_TIPO_INTERES } from "@/lib/loan-simulator";
import { useState } from "react";

interface ClienteDetalleViewProps {
  clienteId: string;
}

export function ClienteDetalleView({ clienteId }: ClienteDetalleViewProps) {
  const router = useRouter();
  const {
    getClienteById,
    getPrestamosByCliente,
    updateCliente,
    deleteCliente,
    setClienteActivo,
    clienteTienePrestamos,
    mutating,
    abonos,
  } = useDataStore();

  const cliente = getClienteById(clienteId);
  const prestamos = getPrestamosByCliente(clienteId);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!cliente) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>Cliente no encontrado</p>
        <BackButton href="/clientes" />
      </div>
    );
  }

  const historialAbonos = abonos
    .filter((a) => prestamos.some((p) => p.id === a.prestamo_id))
    .slice(0, 10);

  async function handleDelete() {
    if (!cliente) return;
    const ok = await deleteCliente(cliente.id);
    if (ok) router.push("/clientes");
    setDeleteOpen(false);
  }

  async function handleDesactivar() {
    if (!cliente) return;
    await setClienteActivo(cliente.id, false);
    router.push("/clientes");
  }

  async function handleReactivar() {
    if (!cliente) return;
    await setClienteActivo(cliente.id, true);
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <BackButton href="/clientes" label="Clientes" />

      <Card className="overflow-hidden border-emerald-100/80 bg-gradient-to-br from-white via-white to-emerald-50/40">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex gap-4">
              <div className="avatar-circle h-14 w-14 shrink-0 text-lg">
                {cliente.nombre
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("") || "?"}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="page-heading">{cliente.nombre}</h1>
                  {!cliente.activo && (
                    <Badge variant="secondary" className="text-amber-700 bg-amber-50">
                      Inactivo
                    </Badge>
                  )}
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                  {cliente.telefono && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-emerald-600" /> {cliente.telefono}
                    </p>
                  )}
                  {cliente.descripcion && (
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-emerald-600" /> {cliente.descripcion}
                    </p>
                  )}
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-emerald-600" /> Registro:{" "}
                    {formatDate(cliente.fecha_registro)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
              {cliente.activo !== false ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDesactivar}
                  disabled={mutating}
                >
                  <UserX className="h-4 w-4" /> Desactivar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleReactivar()}
                  disabled={mutating}
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  <UserCheck className="h-4 w-4" /> Reactivar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setDeleteOpen(true)}
                disabled={clienteTienePrestamos(cliente.id)}
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Créditos activos</h2>
        <Button
          size="sm"
          onClick={() => router.push(`/clientes/${clienteId}/nuevo-prestamo`)}
        >
          <Plus className="h-4 w-4" /> Nuevo crédito
        </Button>
      </div>

      <div className="grid gap-3">
        {prestamos.filter((p) => p.estado !== "pagado").map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() =>
              router.push(`/clientes/${clienteId}/prestamos/${p.id}`)
            }
            className="text-left app-card app-card-interactive p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">
                  {formatCurrency(p.monto_prestado)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {p.tipo_interes
                    ? LABEL_TIPO_INTERES[p.tipo_interes]
                    : formatTipoPrestamo(p.tipo_prestamo)}{" "}
                  · {p.tasa_interes ? `${p.tasa_interes}%` : ""}
                </p>
              </div>
              <MoraSemaforo mora={p.mora} size="sm" />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-slate-500">Saldo pendiente</span>
              <span className="font-bold text-emerald-700">
                {formatCurrency(p.saldo_pendiente)}
              </span>
            </div>
          </button>
        ))}
        {prestamos.filter((p) => p.estado !== "pagado").length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-slate-400">
              <HandCoins className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Sin créditos activos
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Historial del cliente</h2>
        {historialAbonos.length === 0 ? (
          <p className="text-sm text-slate-400">Sin abonos registrados aún.</p>
        ) : (
          <div className="space-y-2">
            {historialAbonos.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(a.monto_abonado)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(a.fecha_abono)}
                    {a.metodo_pago ? ` · ${a.metodo_pago}` : ""}
                  </p>
                </div>
                <Badge variant="secondary">{a.tipo_abono}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <ClienteFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        cliente={cliente}
        onSave={async (data) => {
          await updateCliente(cliente.id, data);
          setEditOpen(false);
        }}
      />

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="¿Eliminar cliente?"
        description="Esta acción no se puede deshacer."
        itemName={cliente.nombre}
        onConfirm={handleDelete}
      />
    </div>
  );
}
