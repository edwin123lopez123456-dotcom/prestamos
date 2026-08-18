"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
];

export function BottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Navegación principal"
    >
      <div className="grid grid-cols-2 h-16">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors active:scale-95",
              isActive(href) ? "text-emerald-700" : "text-slate-500"
            )}
          >
            <Icon
              className={cn(
                "h-6 w-6",
                isActive(href) ? "text-emerald-600" : "text-slate-400"
              )}
              strokeWidth={isActive(href) ? 2.5 : 2}
            />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
