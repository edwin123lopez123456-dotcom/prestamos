"use client";

import { useRef, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClienteFormModal } from "@/components/clientes/ClienteFormModal";
import { useDataStore } from "@/context/DataStoreContext";
import { exportarClientesExcel, importarClientesExcel } from "@/lib/excel";
import type { Cliente } from "@/types";

export function ClientesActionsPanel() {
  const { clientes, addCliente, addClientesBulk, mutating } = useDataStore();
  const [formOpen, setFormOpen] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSave(data: Omit<Cliente, "id">) {
    try {
      await addCliente(data);
    } catch {
      alert("No se pudo guardar el cliente.");
      throw new Error("save failed");
    }
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

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImport}
      />

      <div className="flex flex-wrap gap-2 justify-end">
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
        <Button size="sm" disabled={mutating} onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo Cliente
        </Button>
      </div>

      {importMsg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {importMsg}
        </div>
      )}

      <ClienteFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        cliente={null}
        onSave={handleSave}
      />
    </>
  );
}
