import * as XLSX from "xlsx";
import type { Cliente, PrestamoConCliente } from "@/types";
import { formatEstado, formatFrecuencia } from "@/lib/utils";

/** Descarga un workbook como archivo .xlsx */
function descargarWorkbook(wb: XLSX.WorkBook, nombreArchivo: string) {
  XLSX.writeFile(wb, nombreArchivo);
}

/** Exporta clientes a Excel */
export function exportarClientesExcel(clientes: Cliente[]) {
  const datos = clientes.map((c) => ({
    nombre: c.nombre,
    telefono: c.telefono,
    descripcion: c.descripcion,
    fecha_registro: c.fecha_registro,
  }));

  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  descargarWorkbook(wb, `clientes_${fechaArchivo()}.xlsx`);
}

/** Exporta préstamos a Excel */
export function exportarPrestamosExcel(prestamos: PrestamoConCliente[]) {
  const datos = prestamos.map((p) => ({
    id: p.id,
    cliente: p.cliente.nombre,
    telefono: p.cliente.telefono,
    monto_prestado: p.monto_prestado,
    frecuencia: formatFrecuencia(p.frecuencia),
    valor_cuota: p.valor_cuota,
    total_cuotas: p.total_cuotas,
    cuotas_pagadas: p.cuotas_pagadas,
    saldo_pendiente: p.saldo_pendiente,
    estado: formatEstado(p.estado),
    mora_dias: p.mora.dias_atraso,
    fecha_inicio: p.fecha_inicio,
  }));

  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Prestamos");
  descargarWorkbook(wb, `prestamos_${fechaArchivo()}.xlsx`);
}

function fechaArchivo(): string {
  return new Date().toISOString().split("T")[0];
}

/** Normaliza encabezados de Excel para comparación flexible */
function normalizarHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Lee filas de un archivo Excel y retorna clientes nuevos */
export async function importarClientesExcel(
  file: File
): Promise<Omit<Cliente, "id">[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
  });

  const hoy = new Date().toISOString().split("T")[0];
  const clientes: Omit<Cliente, "id">[] = [];

  for (const fila of filas) {
    const mapa: Record<string, string> = {};
    for (const [key, val] of Object.entries(fila)) {
      mapa[normalizarHeader(key)] = String(val ?? "").trim();
    }

    const nombre =
      mapa["nombre"] || mapa["name"] || mapa["cliente"] || "";
    const telefono =
      mapa["telefono"] || mapa["teléfono"] || mapa["phone"] || mapa["celular"] || "";
    const descripcion =
      mapa["descripcion"] || mapa["descripción"] || mapa["notas"] || mapa["observaciones"] || "";

    if (!nombre) continue;

    clientes.push({
      nombre,
      telefono,
      descripcion,
      fecha_registro: mapa["fecha_registro"] || mapa["fecha"] || hoy,
    });
  }

  return clientes;
}

/** Descarga recibo como PDF usando html2canvas + jspdf */
export async function descargarReciboPDF(
  elementId: string,
  nombreArchivo: string
): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const element = document.getElementById(elementId);
  if (!element) throw new Error("Elemento de recibo no encontrado");

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, Math.max(120, (canvas.height * 80) / canvas.width)],
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
  pdf.save(`${nombreArchivo}.pdf`);
}

/** Descarga recibo como imagen PNG */
export async function descargarReciboPNG(
  elementId: string,
  nombreArchivo: string
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const element = document.getElementById(elementId);
  if (!element) throw new Error("Elemento de recibo no encontrado");

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const link = document.createElement("a");
  link.download = `${nombreArchivo}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
