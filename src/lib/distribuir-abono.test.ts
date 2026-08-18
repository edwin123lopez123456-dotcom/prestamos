import { describe, expect, it } from "vitest";
import type { PlanCuota, Prestamo } from "@/types";
import {
  calcularPendientesCuota,
  distribuirAbono,
  resolverComponentesCuota,
} from "@/lib/distribuir-abono";

function prestamoBase(overrides: Partial<Prestamo> = {}): Prestamo {
  return {
    id: "prestamo-1",
    cliente_id: "cliente-1",
    tipo_prestamo: "cuotas_fijas",
    tipo_interes: "compuesto_bancario",
    monto_prestado: 300_000,
    saldo_capital: 300_000,
    frecuencia: "mensual",
    tasa_interes: 5,
    valor_cuota: 100_000,
    total_cuotas: 3,
    cuotas_pagadas: 0,
    estado: "pendiente",
    fecha_inicio: "2026-01-01",
    nota: "",
    ...overrides,
  };
}

function cuotaBase(
  overrides: Partial<PlanCuota> & Pick<PlanCuota, "id" | "numero_cuota" | "monto_cuota">
): PlanCuota {
  return {
    prestamo_id: "prestamo-1",
    interes_cuota: 0,
    capital_cuota: overrides.monto_cuota,
    fecha_vencimiento: `2026-0${overrides.numero_cuota}-01`,
    monto_pagado: 0,
    estado: "pendiente",
    tipo_cuota: "fija",
    ...overrides,
  };
}

function cuotaCompuesta(
  id: string,
  numero: number,
  interes: number,
  capital: number,
  extra: Partial<PlanCuota> = {}
): PlanCuota {
  return cuotaBase({
    id,
    numero_cuota: numero,
    monto_cuota: interes + capital,
    interes_cuota: interes,
    capital_cuota: capital,
    fecha_vencimiento: `2026-0${numero}-15`,
    ...extra,
  });
}

describe("resolverComponentesCuota / calcularPendientesCuota", () => {
  it("usa desglose válido cuando interes + capital = monto_cuota", () => {
    const cuota = cuotaCompuesta("c1", 1, 20_000, 80_000);
    const comp = resolverComponentesCuota(cuota);
    expect(comp.modo).toBe("desglose");

    const pend = calcularPendientesCuota(cuota, comp);
    expect(pend.interes_pendiente).toBe(20_000);
    expect(pend.capital_pendiente).toBe(80_000);
    expect(pend.saldo_cuota).toBe(100_000);
  });

  it("legacy solo interés cuando tipo_cuota es interes sin capital", () => {
    const cuota = cuotaBase({
      id: "c-int",
      numero_cuota: 1,
      monto_cuota: 25_000,
      tipo_cuota: "interes",
      interes_cuota: 0,
      capital_cuota: 0,
    });
    const comp = resolverComponentesCuota(cuota);
    expect(comp.modo).toBe("legacy_solo_interes");
    expect(calcularPendientesCuota(cuota, comp).saldo_cuota).toBe(25_000);
  });

  it("legacy solo capital cuando no hay desglose", () => {
    const cuota = cuotaBase({
      id: "c-cap",
      numero_cuota: 1,
      monto_cuota: 50_000,
      interes_cuota: 0,
      capital_cuota: 50_000,
    });
    const comp = resolverComponentesCuota(cuota);
    expect(comp.modo).toBe("legacy_solo_capital");
    expect(calcularPendientesCuota(cuota, comp).capital_pendiente).toBe(50_000);
    expect(calcularPendientesCuota(cuota, comp).interes_pendiente).toBe(0);
  });
});

describe("distribuirAbono", () => {
  const prestamo = prestamoBase();

  it("TEST 1 — pago exacto de una cuota", () => {
    const plan = [cuotaCompuesta("c1", 1, 20_000, 80_000)];
    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 100_000,
      aplicacion_abono: "interes_y_capital",
    });

    expect(r.valido).toBe(true);
    expect(r.monto_aplicado).toBe(100_000);
    expect(r.monto_a_interes).toBe(20_000);
    expect(r.monto_a_capital).toBe(80_000);
    expect(r.monto_no_aplicado).toBe(0);
    expect(r.plan_cuotas[0].estado).toBe("pagada");
    expect(r.plan_cuotas[0].monto_pagado).toBe(100_000);
  });

  it("TEST 2 — pago parcial", () => {
    const plan = [cuotaCompuesta("c1", 1, 20_000, 80_000)];
    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 50_000,
      aplicacion_abono: "interes_y_capital",
    });

    expect(r.valido).toBe(true);
    expect(r.monto_a_interes).toBe(20_000);
    expect(r.monto_a_capital).toBe(30_000);
    expect(r.plan_cuotas[0].estado).toBe("parcial");
    expect(calcularPendientesCuota(r.plan_cuotas[0]).interes_pendiente).toBe(0);
    expect(calcularPendientesCuota(r.plan_cuotas[0]).capital_pendiente).toBe(50_000);
  });

  it("TEST 3 — pago de varias cuotas ($120.000 sobre 3×$50.000)", () => {
    const plan = [
      cuotaCompuesta("c1", 1, 10_000, 40_000, { fecha_vencimiento: "2026-01-01" }),
      cuotaCompuesta("c2", 2, 10_000, 40_000, { fecha_vencimiento: "2026-02-01" }),
      cuotaCompuesta("c3", 3, 10_000, 40_000, { fecha_vencimiento: "2026-03-01" }),
    ];

    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 120_000,
      aplicacion_abono: "interes_y_capital",
    });

    expect(r.plan_cuotas[0].estado).toBe("pagada");
    expect(r.plan_cuotas[1].estado).toBe("pagada");
    expect(r.plan_cuotas[2].estado).toBe("parcial");
    expect(r.plan_cuotas[2].monto_pagado).toBe(20_000);
    expect(calcularPendientesCuota(r.plan_cuotas[2]).saldo_cuota).toBe(30_000);
    expect(r.monto_aplicado).toBe(120_000);
    expect(r.monto_no_aplicado).toBe(0);
  });

  it("TEST 4 — solo interés", () => {
    const plan = [cuotaCompuesta("c1", 1, 20_000, 80_000)];
    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 15_000,
      aplicacion_abono: "solo_interes",
    });

    expect(r.monto_a_interes).toBe(15_000);
    expect(r.monto_a_capital).toBe(0);
    expect(calcularPendientesCuota(r.plan_cuotas[0]).interes_pendiente).toBe(5_000);
    expect(calcularPendientesCuota(r.plan_cuotas[0]).capital_pendiente).toBe(80_000);
    expect(r.plan_cuotas[0].estado).toBe("parcial");
  });

  it("TEST 5 — solo capital", () => {
    const plan = [cuotaCompuesta("c1", 1, 20_000, 80_000)];
    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 30_000,
      aplicacion_abono: "solo_capital",
    });

    expect(r.monto_a_interes).toBe(0);
    expect(r.monto_a_capital).toBe(30_000);
    expect(calcularPendientesCuota(r.plan_cuotas[0]).interes_pendiente).toBe(20_000);
    expect(calcularPendientesCuota(r.plan_cuotas[0]).capital_pendiente).toBe(50_000);
  });

  it("TEST 6 — interés + capital parcial (interés completo + parte capital)", () => {
    const plan = [cuotaCompuesta("c1", 1, 20_000, 80_000)];
    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 35_000,
      aplicacion_abono: "interes_y_capital",
    });

    expect(r.monto_a_interes).toBe(20_000);
    expect(r.monto_a_capital).toBe(15_000);
    expect(r.monto_aplicado + r.monto_no_aplicado).toBe(35_000);
  });

  it("TEST 7 — pago superior a la deuda", () => {
    const plan = [cuotaCompuesta("c1", 1, 20_000, 80_000)];
    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 120_000,
      aplicacion_abono: "interes_y_capital",
    });

    expect(r.monto_aplicado).toBe(100_000);
    expect(r.monto_no_aplicado).toBe(20_000);
    expect(r.monto_aplicado + r.monto_no_aplicado).toBe(120_000);
    expect(r.plan_cuotas[0].estado).toBe("pagada");
  });

  it("TEST 8 — pago $0", () => {
    const plan = [cuotaCompuesta("c1", 1, 20_000, 80_000)];
    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 0,
      aplicacion_abono: "interes_y_capital",
    });

    expect(r.valido).toBe(false);
    expect(r.monto_aplicado).toBe(0);
    expect(r.errores).toContain("El monto debe ser mayor a cero");
  });

  it("TEST 9 — pago negativo", () => {
    const plan = [cuotaCompuesta("c1", 1, 20_000, 80_000)];
    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: -100,
      aplicacion_abono: "interes_y_capital",
    });

    expect(r.valido).toBe(false);
    expect(r.errores).toContain("El monto no puede ser negativo");
  });

  it("TEST 10 — cuota ya pagada", () => {
    const plan = [
      cuotaCompuesta("c1", 1, 20_000, 80_000, {
        monto_pagado: 100_000,
        estado: "pagada",
      }),
    ];

    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 50_000,
      aplicacion_abono: "interes_y_capital",
      plan_cuota_id: "c1",
    });

    expect(r.valido).toBe(true);
    expect(r.monto_aplicado).toBe(0);
    expect(r.monto_no_aplicado).toBe(50_000);
    expect(r.detalle).toHaveLength(0);
  });

  it("TEST 11 — varias cuotas con distintos intereses", () => {
    const plan = [
      cuotaCompuesta("c1", 1, 5_000, 45_000, { fecha_vencimiento: "2026-01-01" }),
      cuotaCompuesta("c2", 2, 15_000, 35_000, { fecha_vencimiento: "2026-02-01" }),
      cuotaCompuesta("c3", 3, 25_000, 25_000, { fecha_vencimiento: "2026-03-01" }),
    ];

    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 60_000,
      aplicacion_abono: "interes_y_capital",
    });

    // Cuota 1 completa (50k) + 10k a cuota 2 (todo a interés)
    expect(r.monto_a_interes).toBe(5_000 + 10_000);
    expect(r.monto_a_capital).toBe(45_000);
    expect(r.plan_cuotas[0].estado).toBe("pagada");
    expect(r.plan_cuotas[1].estado).toBe("parcial");
    expect(r.plan_cuotas[2].estado).toBe("pendiente");
    expect(r.monto_aplicado).toBe(60_000);
  });

  it("TEST 12 — inicio en cuota específica vía plan_cuota_id", () => {
    const plan = [
      cuotaCompuesta("c1", 1, 10_000, 40_000, { fecha_vencimiento: "2026-01-01" }),
      cuotaCompuesta("c2", 2, 10_000, 40_000, { fecha_vencimiento: "2026-02-01" }),
      cuotaCompuesta("c3", 3, 10_000, 40_000, { fecha_vencimiento: "2026-03-01" }),
    ];

    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 70_000,
      aplicacion_abono: "interes_y_capital",
      plan_cuota_id: "c2",
    });

    // Orden: c2 (inicial) → c1 → c3 (resto de pendientes por vencimiento)
    expect(r.plan_cuotas[1].estado).toBe("pagada");
    expect(r.plan_cuotas[0].estado).toBe("parcial");
    expect(r.plan_cuotas[0].monto_pagado).toBe(20_000);
    expect(r.plan_cuotas[2].estado).toBe("pendiente");
    expect(r.cuota_afectada_id).toBe("c2");
    expect(r.detalle[0].cuota_id).toBe("c2");
  });

  it("invariantes: totales, no negativos y estados", () => {
    const plan = [
      cuotaCompuesta("c1", 1, 20_000, 80_000, { fecha_vencimiento: "2026-01-01" }),
      cuotaCompuesta("c2", 2, 30_000, 70_000, { fecha_vencimiento: "2026-02-01" }),
    ];

    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 95_000,
      aplicacion_abono: "interes_y_capital",
    });

    expect(r.monto_a_interes + r.monto_a_capital).toBe(r.monto_aplicado);
    expect(r.monto_aplicado + r.monto_no_aplicado).toBe(r.monto_recibido);

    for (const cuota of r.plan_cuotas) {
      const pend = calcularPendientesCuota(cuota);
      expect(pend.interes_pendiente).toBeGreaterThanOrEqual(0);
      expect(pend.capital_pendiente).toBeGreaterThanOrEqual(0);
      expect(cuota.monto_pagado).toBeLessThanOrEqual(cuota.monto_cuota);
    }

    for (const d of r.detalle) {
      expect(d.monto_interes + d.monto_capital).toBe(d.monto_total);
      expect(d.interes_pendiente_despues).toBeGreaterThanOrEqual(0);
      expect(d.capital_pendiente_despues).toBeGreaterThanOrEqual(0);
    }
  });

  it("solo interés en cuota legacy sin desglose no aplica a capital", () => {
    const plan = [
      cuotaBase({
        id: "legacy",
        numero_cuota: 1,
        monto_cuota: 50_000,
        interes_cuota: 0,
        capital_cuota: 50_000,
      }),
    ];

    const r = distribuirAbono({
      prestamo,
      plan_cuotas: plan,
      monto: 20_000,
      aplicacion_abono: "solo_interes",
    });

    expect(r.monto_aplicado).toBe(0);
    expect(r.monto_no_aplicado).toBe(20_000);
    expect(r.plan_cuotas[0].estado).toBe("pendiente");
  });
});
