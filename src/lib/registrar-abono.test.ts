import { describe, expect, it } from "vitest";
import type { PlanCuota, Prestamo } from "@/types";
import {
  ErrorRegistroAbono,
  prepararRegistroAbono,
  resolverAplicacionAbono,
} from "@/lib/registrar-abono";

function prestamo(overrides: Partial<Prestamo> = {}): Prestamo {
  return {
    id: "p1",
    cliente_id: "c1",
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

function cuota(
  overrides: Partial<PlanCuota> & Pick<PlanCuota, "id" | "numero_cuota" | "monto_cuota">
): PlanCuota {
  const interes = overrides.interes_cuota ?? 20_000;
  const capital = overrides.capital_cuota ?? overrides.monto_cuota - interes;
  return {
    prestamo_id: "p1",
    interes_cuota: interes,
    capital_cuota: capital,
    fecha_vencimiento: `2026-0${overrides.numero_cuota}-01`,
    monto_pagado: 0,
    estado: "pendiente",
    tipo_cuota: "fija",
    ...overrides,
  };
}

function inputBase(overrides: Record<string, unknown> = {}) {
  return {
    prestamo_id: "p1",
    monto_abonado: 100_000,
    fecha_abono: "2026-08-18",
    notas: "",
    tipo_abono: "cuota" as const,
    aplicacion_abono: "interes_y_capital" as const,
    ...overrides,
  };
}

describe("prepararRegistroAbono", () => {
  const p = prestamo();

  it("1 — pago exacto de cuota", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    const r = prepararRegistroAbono(p, plan, inputBase({ monto_abonado: 100_000 }));

    expect(r.planDelPrestamoActualizado[0].estado).toBe("pagada");
    expect(r.desgloseAbono.monto_aplicado).toBe(100_000);
    expect(r.abonoInsert.tipo_abono).toBe("cuota");
  });

  it("2 — pago parcial", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    const r = prepararRegistroAbono(p, plan, inputBase({ monto_abonado: 50_000 }));

    expect(r.planDelPrestamoActualizado[0].estado).toBe("parcial");
    expect(r.desgloseAbono.monto_interes_aplicado).toBe(20_000);
    expect(r.desgloseAbono.monto_capital_aplicado).toBe(30_000);
  });

  it("3 — pago de varias cuotas", () => {
    const plan = [
      cuota({ id: "c1", numero_cuota: 1, monto_cuota: 50_000, interes_cuota: 10_000, capital_cuota: 40_000, fecha_vencimiento: "2026-01-01" }),
      cuota({ id: "c2", numero_cuota: 2, monto_cuota: 50_000, interes_cuota: 10_000, capital_cuota: 40_000, fecha_vencimiento: "2026-02-01" }),
      cuota({ id: "c3", numero_cuota: 3, monto_cuota: 50_000, interes_cuota: 10_000, capital_cuota: 40_000, fecha_vencimiento: "2026-03-01" }),
    ];

    const r = prepararRegistroAbono(p, plan, inputBase({ monto_abonado: 120_000 }));

    expect(r.planDelPrestamoActualizado[0].estado).toBe("pagada");
    expect(r.planDelPrestamoActualizado[1].estado).toBe("pagada");
    expect(r.planDelPrestamoActualizado[2].estado).toBe("parcial");
    expect(r.desgloseAbono.monto_aplicado).toBe(120_000);
  });

  it("4 — solo interés", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    const r = prepararRegistroAbono(
      p,
      plan,
      inputBase({ monto_abonado: 15_000, aplicacion_abono: "solo_interes", tipo_abono: "interes" })
    );

    expect(r.desgloseAbono.monto_interes_aplicado).toBe(15_000);
    expect(r.desgloseAbono.monto_capital_aplicado).toBe(0);
    expect(r.abonoInsert.aplicacion_abono).toBe("solo_interes");
  });

  it("5 — solo capital", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    const r = prepararRegistroAbono(
      p,
      plan,
      inputBase({ monto_abonado: 30_000, aplicacion_abono: "solo_capital", tipo_abono: "capital" })
    );

    expect(r.desgloseAbono.monto_capital_aplicado).toBe(30_000);
    expect(r.desgloseAbono.monto_interes_aplicado).toBe(0);
  });

  it("5b — solo capital en préstamo solo_interes (capital directo al préstamo)", () => {
    const pSoloInteres = prestamo({
      tipo_prestamo: "solo_interes",
      saldo_capital: 500_000,
      valor_cuota: 25_000,
    });
    const plan = [
      cuota({
        id: "i1",
        numero_cuota: 1,
        monto_cuota: 25_000,
        interes_cuota: 25_000,
        capital_cuota: 0,
        tipo_cuota: "interes",
      }),
    ];

    const r = prepararRegistroAbono(
      pSoloInteres,
      plan,
      inputBase({
        monto_abonado: 100_000,
        aplicacion_abono: "solo_capital",
        tipo_abono: "capital",
      })
    );

    expect(r.desgloseAbono.monto_capital_aplicado).toBe(100_000);
    expect(r.prestamoTrasAbono.saldo_capital).toBe(400_000);
    expect(r.abonoInsert.tipo_abono).toBe("capital");
    expect(r.planDelPrestamoActualizado.some((c) => c.estado === "pendiente")).toBe(true);
  });

  it("6 — excedente rechazado", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    expect(() =>
      prepararRegistroAbono(p, plan, inputBase({ monto_abonado: 120_000 }))
    ).toThrow(/supera la deuda aplicable por/i);
  });

  it("7 — monto 0 rechazado", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    expect(() =>
      prepararRegistroAbono(p, plan, inputBase({ monto_abonado: 0 }))
    ).toThrow(/mayor a cero/i);
  });

  it("8 — monto negativo rechazado", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    expect(() =>
      prepararRegistroAbono(p, plan, inputBase({ monto_abonado: -50 }))
    ).toThrow(/mayor a cero/i);
  });

  it("9 — cuota inexistente rechazada", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    expect(() =>
      prepararRegistroAbono(p, plan, inputBase({ plan_cuota_id: "no-existe" }))
    ).toThrow(/no pertenece a este préstamo/i);
  });

  it("10 — préstamo inexistente rechazado", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    expect(() => prepararRegistroAbono(undefined, plan, inputBase())).toThrow(
      /préstamo no existe/i
    );
  });

  it("11 — préstamo pagado rechazado", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    expect(() =>
      prepararRegistroAbono(prestamo({ estado: "pagado" }), plan, inputBase())
    ).toThrow(/ya está pagado/i);
  });

  it("calcula totales del préstamo tras abono", () => {
    const plan = [cuota({ id: "c1", numero_cuota: 1, monto_cuota: 100_000 })];
    const r = prepararRegistroAbono(p, plan, inputBase({ monto_abonado: 100_000 }));

    expect(r.prestamoTrasAbono.cuotas_pagadas).toBe(1);
    expect(r.prestamoTrasAbono.deuda_total).toBe(0);
    expect(r.prestamoTrasAbono.estado).toBe("pagado");
  });

  it("resolverAplicacionAbono infiere desde tipo_abono", () => {
    const { aplicacion_abono: _, ...sinAplicacion } = inputBase();
    expect(
      resolverAplicacionAbono({ ...sinAplicacion, tipo_abono: "interes" })
    ).toBe("solo_interes");
    expect(
      resolverAplicacionAbono({ ...sinAplicacion, tipo_abono: "capital" })
    ).toBe("solo_capital");
  });

  it("solo interés en cuota legacy 100% capital no aplica y rechaza", () => {
    const plan = [
      cuota({
        id: "legacy",
        numero_cuota: 1,
        monto_cuota: 50_000,
        interes_cuota: 0,
        capital_cuota: 50_000,
        tipo_cuota: "fija",
      }),
    ];

    expect(() =>
      prepararRegistroAbono(
        p,
        plan,
        inputBase({ monto_abonado: 20_000, aplicacion_abono: "solo_interes" })
      )
    ).toThrow(/Ningún monto pudo aplicarse/i);
  });
});

describe("ErrorRegistroAbono", () => {
  it("es instancia de Error", () => {
    const err = new ErrorRegistroAbono("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ErrorRegistroAbono");
  });
});
