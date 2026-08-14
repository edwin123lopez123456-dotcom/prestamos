"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EstadoCartera } from "@/types";

interface CarteraPieChartProps {
  estado: EstadoCartera;
}

const COLORS = {
  al_dia: "#10b981",
  mora_amarilla: "#f59e0b",
  mora_roja: "#ef4444",
};

const LABELS = {
  al_dia: "Al día",
  mora_amarilla: "Mora amarilla (1-7d)",
  mora_roja: "Mora roja (+7d)",
};

export function CarteraPieChart({ estado }: CarteraPieChartProps) {
  const data = [
    { name: LABELS.al_dia, value: estado.al_dia, key: "al_dia" as const },
    { name: LABELS.mora_amarilla, value: estado.mora_amarilla, key: "mora_amarilla" as const },
    { name: LABELS.mora_roja, value: estado.mora_roja, key: "mora_roja" as const },
  ].filter((d) => d.value > 0);

  const total = estado.al_dia + estado.mora_amarilla + estado.mora_roja;

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado de la Cartera</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400 text-center py-8">
            No hay préstamos activos
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estado de la Cartera</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name?.split(" ")[0] ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.map((entry) => (
                  <Cell key={entry.key} fill={COLORS[entry.key]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  `${value} préstamo${Number(value) !== 1 ? "s" : ""}`,
                  name,
                ]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="font-bold text-emerald-600">{estado.al_dia}</p>
            <p className="text-slate-500">Al día</p>
          </div>
          <div>
            <p className="font-bold text-amber-600">{estado.mora_amarilla}</p>
            <p className="text-slate-500">Amarilla</p>
          </div>
          <div>
            <p className="font-bold text-red-600">{estado.mora_roja}</p>
            <p className="text-slate-500">Roja</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
