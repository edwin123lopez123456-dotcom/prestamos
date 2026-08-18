import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  fullPage?: boolean;
  className?: string;
}

export function LoadingState({
  message = "Cargando...",
  fullPage = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-slate-500",
        fullPage ? "min-h-[40vh]" : "py-12",
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
      </div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
