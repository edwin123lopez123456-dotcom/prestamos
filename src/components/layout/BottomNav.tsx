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
      className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200/80 bg-white/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgb(15_23_42/0.06)] lg:hidden"
      aria-label="Navegación principal"
    >
      <div className="grid grid-cols-2 h-[4.25rem] px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-all active:scale-95",
                active ? "text-emerald-700" : "text-slate-500"
              )}
            >
              {active && (
                <span className="absolute top-1.5 h-1 w-8 rounded-full bg-emerald-500" />
              )}
              <Icon
                className={cn(
                  "h-6 w-6",
                  active ? "text-emerald-600" : "text-slate-400"
                )}
                strokeWidth={active ? 2.5 : 2}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
