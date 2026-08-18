import type {
  Abono,
  AlertaRapida,
  Cliente,
  DatoGrafico,
  MoraCliente,
  PlanCuota,
  Prestamo,
  PrestamoConCliente,
} from "@/types";
import {
  calcularMora,
  calcularSaldoPendiente,
  cuotaPendienteMasAntigua,
} from "@/lib/calculations";

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function enriquecerPrestamos(
  prestamos: Prestamo[],
  clientes: Cliente[],
  abonos: Abono[],
  planCuotas: PlanCuota[]
): PrestamoConCliente[] {
  return prestamos
    .map((prestamo) => {
      const cliente = clientes.find((c) => c.id === prestamo.cliente_id);
      if (!cliente) return null;

      const abonosPrestamo = abonos.filter((a) => a.prestamo_id === prestamo.id);
      const planDelPrestamo = planCuotas
        .filter((c) => c.prestamo_id === prestamo.id)
        .sort((a, b) => a.numero_cuota - b.numero_cuota);

      const total_abonado = abonosPrestamo.reduce(
        (sum, a) => sum + a.monto_abonado,
        0
      );
      const saldo_pendiente = calcularSaldoPendiente(prestamo, planDelPrestamo);
      const mora = calcularMora(prestamo, planDelPrestamo);
      const proxima_cuota = cuotaPendienteMasAntigua(planDelPrestamo);
      const interes_periodo =
        prestamo.tipo_prestamo === "solo_interes"
          ? prestamo.valor_cuota
          : null;

      return {
        ...prestamo,
        cliente,
        total_abonado,
        saldo_pendiente,
        mora,
        plan_cuotas: planDelPrestamo,
        proxima_cuota,
        interes_periodo,
      };
    })
    .filter((p): p is PrestamoConCliente => p !== null);
}

export function generarAlertas(prestamos: PrestamoConCliente[]): AlertaRapida[] {
  const alertas: AlertaRapida[] = [];

  for (const p of prestamos) {
    if (p.estado === "pagado") continue;

    const montoCuota =
      p.proxima_cuota?.monto_cuota ??
      p.valor_cuota ??
      p.interes_periodo ??
      0;

    if (p.mora.dias_atraso > 0) {
      alertas.push({
        id: `alert-atraso-${p.id}`,
        tipo: "atrasado",
        cliente_id: p.cliente_id,
        cliente_nombre: p.cliente.nombre,
        prestamo_id: p.id,
        monto_cuota: montoCuota,
        dias_retraso: p.mora.dias_atraso,
        semaforo: p.mora.semaforo,
        tipo_prestamo: p.tipo_prestamo,
      });
    } else {
      alertas.push({
        id: `alert-proximo-${p.id}`,
        tipo: "proximo",
        cliente_id: p.cliente_id,
        cliente_nombre: p.cliente.nombre,
        prestamo_id: p.id,
        monto_cuota: montoCuota,
        fecha_cobro: p.mora.fecha_proxima_cuota,
        semaforo: "verde",
        tipo_prestamo: p.tipo_prestamo,
      });
    }
  }

  return alertas.sort((a, b) => {
    const prio = { rojo: 3, amarillo: 2, verde: 1 };
    return prio[b.semaforo] - prio[a.semaforo];
  });
}

export function agregarMoraPorCliente(
  prestamos: PrestamoConCliente[]
): Map<string, MoraCliente> {
  const map = new Map<string, MoraCliente>();
  const prio = { rojo: 3, amarillo: 2, verde: 1 };

  for (const p of prestamos) {
    if (p.estado === "pagado") continue;

    const existente = map.get(p.cliente_id);
    if (
      !existente ||
      prio[p.mora.semaforo] > prio[existente.mora.semaforo] ||
      (p.mora.semaforo === existente.mora.semaforo &&
        p.mora.dias_atraso > existente.mora.dias_atraso)
    ) {
      map.set(p.cliente_id, {
        cliente_id: p.cliente_id,
        mora: p.mora,
        prestamo_id: p.id,
      });
    }
  }

  return map;
}

export function generarDatosGrafico(
  abonos: Abono[],
  prestamos: Prestamo[]
): DatoGrafico[] {
  const datos: DatoGrafico[] = [];

  for (let i = 6; i >= 0; i--) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - i);
    const iso = fecha.toISOString().split("T")[0];
    const label = DIAS_SEMANA[fecha.getDay()];

    const recaudado = abonos
      .filter((a) => a.fecha_abono === iso)
      .reduce((s, a) => s + a.monto_abonado, 0);

    const prestado = prestamos
      .filter((p) => p.fecha_inicio === iso)
      .reduce((s, p) => s + p.monto_prestado, 0);

    datos.push({ label, recaudado, prestado });
  }

  return datos;
}
