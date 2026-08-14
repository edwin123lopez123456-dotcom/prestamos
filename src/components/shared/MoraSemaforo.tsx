import type { InfoMora } from "@/types";
import { cn } from "@/lib/utils";

const SEMAFORO_CONFIG = {
  verde: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    ring: "ring-emerald-500/20",
    getLabel: () => "Al día",
  },
  amarillo: {
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    ring: "ring-amber-500/20",
    getLabel: (d: number) => `${d}d atraso`,
  },
  rojo: {
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-800 border-red-200",
    ring: "ring-red-500/20",
    getLabel: (d: number) => `${d}d atraso`,
  },
} as const;

interface MoraSemaforoProps {
  mora: InfoMora;
  /** Muestra texto descriptivo junto al indicador */
  showLabel?: boolean;
  /** Tamaño del componente */
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function MoraSemaforo({
  mora,
  showLabel = true,
  size = "md",
  className,
}: MoraSemaforoProps) {
  const config = SEMAFORO_CONFIG[mora.semaforo];
  const dotSize = size === "sm" ? "h-2 w-2" : size === "lg" ? "h-4 w-4" : "h-2.5 w-2.5";
  const textSize = size === "sm" ? "text-[10px]" : size === "lg" ? "text-sm" : "text-xs";
  const labelText = config.getLabel(mora.dias_atraso);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold",
        config.badge,
        textSize,
        className
      )}
      title={
        mora.dias_atraso > 0
          ? `${mora.dias_atraso} día(s) de atraso`
          : "Préstamo al día"
      }
    >
      <span
        className={cn(
          "rounded-full shrink-0 ring-2 ring-offset-1",
          dotSize,
          config.dot,
          config.ring
        )}
        aria-hidden="true"
      />
      {showLabel && <span>{labelText}</span>}
    </span>
  );
}

/** Punto de semáforo compacto para tablas */
export function MoraDot({ mora, className }: { mora: InfoMora; className?: string }) {
  const config = SEMAFORO_CONFIG[mora.semaforo];
  return (
    <span
      className={cn(
        "inline-block h-3 w-3 rounded-full ring-2 ring-offset-1",
        config.dot,
        config.ring,
        className
      )}
      title={
        mora.dias_atraso > 0
          ? `${mora.dias_atraso} día(s) de atraso`
          : "Al día"
      }
    />
  );
}

export function getSemaforoBorderClass(semaforo: InfoMora["semaforo"]): string {
  const borders = {
    verde: "border-emerald-200 bg-emerald-50/50",
    amarillo: "border-amber-200 bg-amber-50/50",
    rojo: "border-red-200 bg-red-50/50",
  };
  return borders[semaforo];
}
