import type {
  Abono,
  AlertaRapida,
  Cliente,
  DatoGrafico,
  MoraCliente,
  Prestamo,
  PrestamoConCliente,
} from "@/types";
import { calcularMora } from "@/lib/calculations";

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Enriquece préstamos con datos del cliente, saldo y mora */
export function enriquecerPrestamos(
  prestamos: Prestamo[],
  clientes: Cliente[],
  abonos: Abono[]
): PrestamoConCliente[] {
  return prestamos
    .map((prestamo) => {
      const cliente = clientes.find((c) => c.id === prestamo.cliente_id);
      if (!cliente) return null;

      const abonosPrestamo = abonos.filter((a) => a.prestamo_id === prestamo.id);
      const total_abonado = abonosPrestamo.reduce((sum, a) => sum + a.monto_abonado, 0);
      const totalEsperado = prestamo.valor_cuota * prestamo.total_cuotas;
      const saldo_pendiente = Math.max(0, totalEsperado - total_abonado);
      const mora = calcularMora(prestamo);

      return {
        ...prestamo,
        cliente,
        total_abonado,
        saldo_pendiente,
        mora,
      };
    })
    .filter((p): p is PrestamoConCliente => p !== null);
}

/** Genera alertas rápidas a partir de préstamos enriquecidos */
export function generarAlertas(prestamos: PrestamoConCliente[]): AlertaRapida[] {
  const alertas: AlertaRapida[] = [];

  for (const p of prestamos) {
    if (p.estado === "pagado") continue;

    if (p.mora.dias_atraso > 0) {
      alertas.push({
        id: `alert-atraso-${p.id}`,
        tipo: "atrasado",
        cliente_nombre: p.cliente.nombre,
        prestamo_id: p.id,
        monto_cuota: p.valor_cuota,
        dias_retraso: p.mora.dias_atraso,
        semaforo: p.mora.semaforo,
      });
    } else {
      alertas.push({
        id: `alert-proximo-${p.id}`,
        tipo: "proximo",
        cliente_nombre: p.cliente.nombre,
        prestamo_id: p.id,
        monto_cuota: p.valor_cuota,
        fecha_cobro: p.mora.fecha_proxima_cuota,
        semaforo: "verde",
      });
    }
  }

  return alertas.sort((a, b) => {
    const prio = { rojo: 3, amarillo: 2, verde: 1 };
    return prio[b.semaforo] - prio[a.semaforo];
  });
}

/** Agrega la peor mora de cada cliente */
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

/** Gráfico semanal calculado desde abonos y préstamos reales */
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
