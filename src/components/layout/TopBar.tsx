"use client";

import { Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NotificacionesBell } from "./NotificacionesBell";
import { useDataStore } from "@/context/DataStoreContext";

interface TopBarProps {
  onMenuClick: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

function resolverTitulo(pathname: string, nombreCliente?: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/clientes") return "Clientes";
  if (pathname.includes("/abonar")) return "Registrar abono";
  if (pathname.includes("/nuevo-prestamo")) return "Nuevo crédito";
  if (pathname.includes("/prestamos/")) return "Detalle del crédito";
  if (pathname.startsWith("/clientes/") && nombreCliente) return nombreCliente;
  if (pathname.startsWith("/clientes/")) return "Cliente";
  return "Préstamos E-I";
}

export function TopBar({ onMenuClick, searchQuery, onSearchChange }: TopBarProps) {
  const pathname = usePathname();
  const { getClienteById } = useDataStore();

  const segmentoCliente = pathname.match(/^\/clientes\/([^/]+)/)?.[1];
  const cliente =
    segmentoCliente && segmentoCliente !== "page"
      ? getClienteById(segmentoCliente)
      : undefined;

  const titulo = resolverTitulo(pathname, cliente?.nombre);
  const esDetalle =
    pathname.startsWith("/clientes/") && pathname !== "/clientes";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white pt-[env(safe-area-inset-top)] shadow-lg shadow-slate-950/20">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-white hover:bg-slate-800 lg:hidden h-11 w-11"
          onClick={onMenuClick}
          aria-label="Abrir menú"
        >
          <Menu className="h-6 w-6" />
        </Button>

        <div className="flex-1 min-w-0">
          <p className="text-base font-bold leading-tight truncate">{titulo}</p>
          {esDetalle && cliente?.telefono && (
            <p className="text-xs text-slate-400">{cliente.telefono}</p>
          )}
        </div>

        {pathname === "/clientes" && (
          <div className="hidden lg:block relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-10 pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
        )}

        <NotificacionesBell />

        <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-sm font-bold shrink-0 shadow-md shadow-emerald-950/30">
          EI
        </div>
      </div>
    </header>
  );
}
