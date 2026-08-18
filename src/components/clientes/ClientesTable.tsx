"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Download,
  Plus,
  Phone,
  Calendar,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MoraSemaforo } from "@/components/shared/MoraSemaforo";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { ClienteFormModal } from "./ClienteFormModal";
import { useDataStore } from "@/context/DataStoreContext";
import type { Cliente, InfoMora } from "@/types";
import { formatDate } from "@/lib/utils";
import { exportarClientesExcel, importarClientesExcel } from "@/lib/excel";
import { useAppContext } from "@/components/layout/MainLayout";

const MORA_AL_DIA: InfoMora = {
  dias_atraso: 0,
  semaforo: "verde",
  fecha_proxima_cuota: "",
};

export function ClientesTable() {
  const router = useRouter();
  const { searchQuery } = useAppContext();
  const {
    clientes,
    moraPorCliente,
    addCliente,
    updateCliente,
    deleteCliente,
    addClientesBulk,
    clienteTienePrestamos,
    mutating,
  } = useDataStore();

  const [localSearch, setLocalSearch] = useState("");
  const [filtroActivo, setFiltroActivo] = useState<"todos" | "recientes" | "en_mora">("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editCliente, setEditCliente] = useState<Cliente | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const query = localSearch || searchQuery;

  const clientesFiltrados = useMemo(() => {
    let resultado = clientes;

    if (query.trim()) {
      const q = query.toLowerCase();
      resultado = resultado.filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          c.telefono.includes(q) ||
          c.descripcion.toLowerCase().includes(q)
      );
    }

    if (filtroActivo === "recientes") {
      resultado = [...resultado].sort(
        (a, b) =>
          new Date(b.fecha_registro).getTime() -
          new Date(a.fecha_registro).getTime()
      );
    }

    if (filtroActivo === "en_mora") {
      resultado = resultado.filter((c) => {
        const mora = moraPorCliente.get(c.id);
        return mora && mora.mora.dias_atraso > 0;
      });
    }

    return resultado;
  }, [clientes, query, filtroActivo, moraPorCliente]);

  function getMoraCliente(clienteId: string): InfoMora {
    return moraPorCliente.get(clienteId)?.mora ?? MORA_AL_DIA;
  }

  async function handleSave(data: Omit<Cliente, "id">) {
    try {
      if (editCliente) {
        await updateCliente(editCliente.id, data);
      } else {
        await addCliente(data);
      }
      setEditCliente(null);
    } catch {
      alert("No se pudo guardar el cliente.");
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      const ok = await deleteCliente(deleteTarget.id);
      if (!ok) {
        alert("No se puede eliminar: el cliente tiene préstamos asociados.");
      }
    } catch {
      alert("No se pudo eliminar el cliente.");
    }
    setDeleteTarget(null);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const nuevos = await importarClientesExcel(file);
      if (nuevos.length === 0) {
        setImportMsg("No se encontraron filas válidas en el archivo.");
      } else {
        await addClientesBulk(nuevos);
        setImportMsg(`${nuevos.length} cliente(s) importado(s) correctamente.`);
      }
    } catch {
      setImportMsg("Error al leer o guardar el archivo Excel.");
    }

    e.target.value = "";
    setTimeout(() => setImportMsg(null), 4000);
  }

  function AccionesCliente({ cliente }: { cliente: Cliente }) {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={() => {
            setEditCliente(cliente);
            setFormOpen(true);
          }}
          aria-label="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => setDeleteTarget(cliente)}
          aria-label="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImport}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Buscar por nombre, teléfono..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filtroActivo === "todos" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroActivo("todos")}
            >
              Todos
            </Button>
            <Button
              variant={filtroActivo === "recientes" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroActivo("recientes")}
            >
              Más recientes
            </Button>
            <Button
              variant={filtroActivo === "en_mora" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroActivo("en_mora")}
            >
              En mora
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={mutating}
          >
            <Upload className="h-4 w-4" />
            Importar Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportarClientesExcel(clientes)}
            disabled={mutating}
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
          <Button
            size="sm"
            disabled={mutating}
            onClick={() => {
              setEditCliente(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      {importMsg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {importMsg}
        </div>
      )}

      <p className="text-sm text-slate-500">
        {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? "s" : ""} encontrado{clientesFiltrados.length !== 1 ? "s" : ""}
      </p>

      {/* Tabla desktop */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left font-medium text-slate-600">Nombre</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Teléfono</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Descripción</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Mora</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Registro</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clientesFiltrados.map((cliente) => {
              const mora = getMoraCliente(cliente.id);
              return (
                <tr
                  key={cliente.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/clientes/${cliente.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{cliente.nombre}</td>
                  <td className="px-4 py-3 text-slate-600">{cliente.telefono}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                    {cliente.descripcion}
                  </td>
                  <td className="px-4 py-3">
                    <MoraSemaforo mora={mora} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(cliente.fecha_registro)}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <AccionesCliente cliente={cliente} />
                  </td>
                </tr>
              );
            })}
            {clientesFiltrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No se encontraron clientes
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Cards móvil */}
      <div className="md:hidden space-y-3">
        {clientesFiltrados.map((cliente) => {
          const mora = getMoraCliente(cliente.id);
          return (
            <Card
              key={cliente.id}
              className={
                mora.semaforo === "rojo"
                  ? "border-red-200 cursor-pointer"
                  : mora.semaforo === "amarillo"
                    ? "border-amber-200 cursor-pointer"
                    : "cursor-pointer"
              }
              onClick={() => router.push(`/clientes/${cliente.id}`)}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{cliente.nombre}</p>
                  <MoraSemaforo mora={mora} size="sm" />
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone className="h-3.5 w-3.5" />
                  {cliente.telefono}
                </div>
                <p className="text-sm text-slate-500">{cliente.descripcion}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(cliente.fecha_registro)}
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {cliente.id}
                  </Badge>
                </div>
                <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setEditCliente(cliente);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => setDeleteTarget(cliente)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ClienteFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        cliente={editCliente}
        onSave={handleSave}
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar cliente?"
        description={
          deleteTarget && clienteTienePrestamos(deleteTarget.id)
            ? "Este cliente tiene préstamos asociados y no puede eliminarse."
            : "Esta acción no se puede deshacer. El cliente será eliminado permanentemente."
        }
        itemName={deleteTarget?.nombre}
        confirmDisabled={
          !!deleteTarget && clienteTienePrestamos(deleteTarget.id)
        }
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}