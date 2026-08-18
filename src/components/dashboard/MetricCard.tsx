import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  format?: "currency" | "number";
  trend?: string;
  variant?: "default" | "success" | "warning" | "danger";
}

const variantStyles = {
  default: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
  success: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
  warning: "bg-amber-50 text-amber-600 ring-1 ring-amber-100",
  danger: "bg-red-50 text-red-600 ring-1 ring-red-100",
};

const accentStyles = {
  default: "from-emerald-500/80 to-emerald-600/80",
  success: "from-emerald-500/80 to-emerald-600/80",
  warning: "from-amber-500/80 to-amber-600/80",
  danger: "from-red-500/80 to-red-600/80",
};

export function MetricCard({
  title,
  value,
  icon: Icon,
  format = "currency",
  trend,
  variant = "default",
}: MetricCardProps) {
  const displayValue =
    format === "currency" ? formatCurrency(value) : value.toString();

  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-md hover:shadow-slate-200/60">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
          accentStyles[variant]
        )}
      />
      <CardContent className="p-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 min-w-0">
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 truncate">
              {displayValue}
            </p>
            {trend && <p className="text-xs text-slate-400">{trend}</p>}
          </div>
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
              variantStyles[variant]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
