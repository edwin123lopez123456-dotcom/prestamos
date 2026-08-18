"use client";

import { useRef, useState } from "react";
import { Printer, MessageCircle, Download } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import type { ReciboPagoData } from "@/types";
import {
  formatCurrency,
  formatDateTime,
  generarEnlaceWhatsApp,
  generarMensajeReciboWhatsApp,
  telefonoValidoWhatsApp,
} from "@/lib/utils";

interface ReciboPagoProps {
  data: ReciboPagoData;
  onClose?: () => void;
}

/** Convierte estilos a RGB/hex para evitar errores de html2canvas con oklch (Tailwind v4) */
function fijarColoresImprimibles(root: HTMLElement) {
  root.style.backgroundColor = "#ffffff";
  root.style.color = "#000000";

  root.querySelectorAll("*").forEach((node) => {
    const el = node as HTMLElement;
    const cls = el.className ?? "";

    if (cls.includes("text-slate-600")) el.style.color = "#475569";
    else if (cls.includes("text-slate-500")) el.style.color = "#64748b";
    else if (cls.includes("text-slate-400")) el.style.color = "#94a3b8";
    else if (cls.includes("font-bold") || cls.includes("font-black")) el.style.color = "#000000";
    else if (el.tagName === "SPAN" || el.tagName === "P") el.style.color = "#000000";

    if (cls.includes("border-slate")) el.style.borderColor = "#94a3b8";
    if (cls.includes("border-double")) el.style.borderColor = "#000000";
  });
}

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ReciboPago({ data, onClose }: ReciboPagoProps) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [descargando, setDescargando] = useState(false);
  const fechaFormateada = formatDateTime(data.fecha_hora);

  const mensajeWhatsApp = generarMensajeReciboWhatsApp({
    negocio: data.negocio,
    clienteNombre: data.cliente_nombre,
    montoAbonado: data.monto_abonado,
    fecha: fechaFormateada,
    nuevoSaldo: data.nuevo_saldo,
  });

  const enlaceWhatsApp = telefonoValidoWhatsApp(data.cliente_telefono)
    ? generarEnlaceWhatsApp(data.cliente_telefono, mensajeWhatsApp)
    : null;

  const nombreArchivo = `recibo-abono-${slugify(data.cliente_nombre) || "cliente"}`;

  function handleImprimir() {
    window.print();
  }

  async function handleDescargar() {
    const element = ticketRef.current;
    if (!element) {
      alert("No se encontró el ticket para descargar.");
      return;
    }

    setDescargando(true);

    try {
      const canvas = await html2canvas(element, {
        scale: 3,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        allowTaint: true,
        onclone: (_doc, clonedElement) => {
          fijarColoresImprimibles(clonedElement);
        },
      });

      const imgData = canvas.toDataURL("image/png", 1.0);

      // Ancho tipo ticket térmico: 80 mm
      const pdfWidthMm = 80;
      const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [pdfWidthMm, pdfHeightMm],
      });

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidthMm, pdfHeightMm, undefined, "FAST");
      pdf.save(`${nombreArchivo}.pdf`);
    } catch (error) {
      console.error("Error al generar PDF:", error);
      alert("No se pudo generar el PDF. Intente imprimir el ticket.");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        ref={ticketRef}
        id="recibo-print-area"
        className="recibo-ticket mx-auto w-full max-w-[280px] rounded-lg border-2 border-dashed border-slate-300 bg-white p-5 font-mono text-black shadow-inner"
      >
        <div className="text-center space-y-1 border-b border-dashed border-slate-400 pb-3 mb-3">
          <p className="text-base font-bold uppercase tracking-wide">
            {data.negocio}
          </p>
          <p className="text-[10px] text-slate-600">RECIBO DE PAGO</p>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Fecha:</span>
            <span className="font-medium text-right">{fechaFormateada}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Cliente:</span>
            <span className="font-medium text-right">{data.cliente_nombre}</span>
          </div>
          <div className="border-t border-dashed border-slate-300 my-2" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Abono:</span>
            <span className="font-bold">{formatCurrency(data.monto_abonado)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Saldo anterior:</span>
            <span>{formatCurrency(data.saldo_anterior)}</span>
          </div>
          <div className="border-t-2 border-double border-slate-800 my-3 pt-2">
            <div className="flex justify-between gap-2 items-center">
              <span className="text-sm font-bold uppercase">Nuevo saldo:</span>
              <span className="text-lg font-black">
                {formatCurrency(data.nuevo_saldo)}
              </span>
            </div>
          </div>
          {data.notas && (
            <p className="text-[10px] text-slate-500 italic pt-1">
              Nota: {data.notas}
            </p>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-dashed border-slate-400 text-center">
          <p className="text-[10px] text-slate-500">¡Gracias por su pago!</p>
          <p className="text-[9px] text-slate-400 mt-1">
            Documento no válido como factura fiscal
          </p>
        </div>
      </div>

      <div className="recibo-actions flex flex-col sm:flex-row flex-wrap gap-2 justify-center">
        <Button onClick={handleImprimir} className="gap-2" disabled={descargando}>
          <Printer className="h-4 w-4" />
          Imprimir Ticket
        </Button>
        <Button
          variant="secondary"
          className="gap-2"
          onClick={handleDescargar}
          disabled={descargando}
        >
          <Download className="h-4 w-4" />
          {descargando ? "Descargando..." : "Descargar Recibo"}
        </Button>
        {enlaceWhatsApp && (
          <Button
            variant="outline"
            className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            asChild
            disabled={descargando}
          >
            <a href={enlaceWhatsApp} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" />
              Compartir por WhatsApp
            </a>
          </Button>
        )}
        {onClose && (
          <Button variant="ghost" onClick={onClose} disabled={descargando}>
            Cerrar
          </Button>
        )}
      </div>
    </div>
  );
}
