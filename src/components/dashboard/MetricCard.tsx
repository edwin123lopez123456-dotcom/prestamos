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
  default: "bg-blue-50 text-blue-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
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
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-2xl font-bold text-slate-900">{displayValue}</p>
            {trend && (
              <p className="text-xs text-slate-400">{trend}</p>
            )}
          </div>
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl",
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
