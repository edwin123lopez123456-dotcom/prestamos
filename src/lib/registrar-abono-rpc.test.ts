import { describe, expect, it } from "vitest";
import type { PlanCuota, Prestamo } from "@/types";
import {
  buildRegistrarAbonoRpcParams,
  extractRpcErrorMessage,
  parseRegistrarAbonoRpcResponse,
  parseRpcPlanCuota,
} from "@/lib/registrar-abono-rpc";
import { resolverAplicacionAbono } from "@/lib/registrar-abono";

describe("registrar-abono-rpc", () => {
  it("buildRegistrarAbonoRpcParams resuelve aplicación desde tipo_abono", () => {
    const params = buildRegistrarAbonoRpcParams(
      {
        prestamo_id: "p1",
        monto_abonado: 50000,
        fecha_abono: "2026-08-18",
        notas: "",
        tipo_abono: "interes",
      },
      "key-1"
    );
    expect(params.p_aplicacion_abono).toBe("solo_interes");
    expect(params.p_idempotency_key).toBe("key-1");
  });

  it("extractRpcErrorMessage parsea código RAE", () => {
    expect(
      extractRpcErrorMessage({ message: 'RAE014: El monto supera la deuda aplicable por $20000' })
    ).toBe("El monto supera la deuda aplicable por $20000");
  });

  it("parseRegistrarAbonoRpcResponse mapea respuesta completa", () => {
    const prestamo: Prestamo = {
      id: "p1",
      cliente_id: "c1",
      tipo_prestamo: "cuotas_fijas",
      tipo_interes: "compuesto_bancario",
      monto_prestado: 100000,
      saldo_capital: 100000,
      frecuencia: "mensual",
      tasa_interes: 5,
      valor_cuota: 100000,
      total_cuotas: 1,
      cuotas_pagadas: 0,
      estado: "pendiente",
      fecha_inicio: "2026-01-01",
      nota: "",
    };

    const result = parseRegistrarAbonoRpcResponse(
      {
        ok: true,
        idempotent_replay: false,
        abono: {
          id: "a1",
          prestamo_id: "p1",
          monto_abonado: 100000,
          fecha_abono: "2026-08-18",
          notas: "",
          tipo_abono: "cuota",
          plan_cuota_id: "c1",
          metodo_pago: "",
          aplicacion_abono: "interes_y_capital",
        },
        prestamo: {
          cuotas_pagadas: 1,
          saldo_capital: 100000,
          valor_cuota: 100000,
          estado: "pagado",
        },
        plan_cuotas: [
          {
            id: "c1",
            prestamo_id: "p1",
            numero_cuota: 1,
            monto_cuota: 100000,
            interes_cuota: 20000,
            capital_cuota: 80000,
            fecha_vencimiento: "2026-01-01",
            monto_pagado: 100000,
            monto_pagado_interes: 20000,
            monto_pagado_capital: 80000,
            estado: "pagada",
            tipo_cuota: "fija",
          },
        ],
        desglose: {
          monto_aplicado: 100000,
          monto_interes_aplicado: 20000,
          monto_capital_aplicado: 80000,
          monto_no_aplicado: 0,
        },
      },
      prestamo,
      []
    );

    expect(result.prestamoActualizado.estado).toBe("pagado");
    expect(result.prestamoActualizado.cuotas_pagadas).toBe(1);
    expect(result.planCuotasActualizado[0].monto_pagado_interes).toBe(20000);
    expect(result.abono.id).toBe("a1");
  });

  it("parseRpcPlanCuota incluye desglose persistido", () => {
    const cuota = parseRpcPlanCuota(
      {
        id: "c1",
        prestamo_id: "p1",
        numero_cuota: 1,
        monto_cuota: 50000,
        interes_cuota: 10000,
        capital_cuota: 40000,
        fecha_vencimiento: "2026-01-01",
        monto_pagado: 25000,
        monto_pagado_interes: 10000,
        monto_pagado_capital: 15000,
        estado: "parcial",
        tipo_cuota: "fija",
      },
      { tipo_prestamo: "cuotas_fijas", tipo_interes: "compuesto_bancario" }
    );
    expect(cuota.monto_pagado_interes).toBe(10000);
    expect(cuota.monto_pagado_capital).toBe(15000);
  });

  it("resolverAplicacionAbono prioriza aplicacion_abono explícita", () => {
    expect(
      resolverAplicacionAbono({
        prestamo_id: "p1",
        monto_abonado: 1,
        fecha_abono: "2026-01-01",
        notas: "",
        tipo_abono: "interes",
        aplicacion_abono: "solo_capital",
      })
    ).toBe("solo_capital");
  });
});
