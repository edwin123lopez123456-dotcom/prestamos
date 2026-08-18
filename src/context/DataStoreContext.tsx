"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type {
  AlertaRapida,
  Cliente,
  DatoGrafico,
  EstadoCartera,
  MetricasDashboard,
  MoraCliente,
  NuevoAbonoInput,
  NuevoPrestamoInput,
  NuevoPrestamoSimuladoInput,
  NuevoAbonoAvanzadoInput,
  PlanCuota,
  Prestamo,
  PrestamoConCliente,
} from "@/types";
import {
  enriquecerPrestamos,
  generarAlertas,
  agregarMoraPorCliente,
  generarDatosGrafico,
} from "@/lib/data-helpers";
import {
  calcularIntereses,
  calcularEstadoCartera,
  calcularRecaudadoHoy,
} from "@/lib/financial-stats";
import {
  fetchAllData,
  insertCliente,
  insertClientesBulk,
  updateClienteDb,
  deleteClienteDb,
  insertPrestamo,
  insertPrestamoSimulado,
  updatePrestamoDb,
  deletePrestamoDb,
  registrarAbonoDb,
  setClienteActivoDb,
} from "@/lib/database";
import { getSupabaseConfigError, isSupabaseConfigured } from "@/lib/supabase";

interface DataStoreContextType {
  clientes: Cliente[];
  prestamos: Prestamo[];
  abonos: import("@/types").Abono[];
  planCuotas: PlanCuota[];
  prestamosEnriquecidos: PrestamoConCliente[];
  metricas: MetricasDashboard;
  estadoCartera: EstadoCartera;
  alertas: AlertaRapida[];
  moraPorCliente: Map<string, MoraCliente>;
  datosGrafico: DatoGrafico[];
  loading: boolean;
  mutating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addCliente: (data: Omit<Cliente, "id">) => Promise<Cliente>;
  updateCliente: (id: string, data: Partial<Omit<Cliente, "id">>) => Promise<void>;
  deleteCliente: (id: string) => Promise<boolean>;
  addClientesBulk: (items: Omit<Cliente, "id">[]) => Promise<void>;
  addPrestamo: (input: NuevoPrestamoInput) => Promise<void>;
  addPrestamoSimulado: (input: NuevoPrestamoSimuladoInput) => Promise<Prestamo>;
  updatePrestamo: (id: string, data: Partial<Prestamo>) => Promise<void>;
  deletePrestamo: (id: string) => Promise<void>;
  registrarAbono: (prestamoId: string, abono: NuevoAbonoInput) => Promise<void>;
  registrarAbonoAvanzado: (
    prestamoId: string,
    abono: NuevoAbonoAvanzadoInput
  ) => Promise<void>;
  setClienteActivo: (id: string, activo: boolean) => Promise<void>;
  getClienteById: (id: string) => Cliente | undefined;
  getPrestamosByCliente: (clienteId: string) => PrestamoConCliente[];
  getPrestamoEnriquecido: (prestamoId: string) => PrestamoConCliente | undefined;
  getAbonosByPrestamo: (prestamoId: string) => import("@/types").Abono[];
  clienteTienePrestamos: (clienteId: string) => boolean;
}

const DataStoreContext = createContext<DataStoreContextType | null>(null);

export function useDataStore() {
  const ctx = useContext(DataStoreContext);
  if (!ctx) throw new Error("useDataStore debe usarse dentro de DataStoreProvider");
  return ctx;
}

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [abonos, setAbonos] = useState<import("@/types").Abono[]>([]);
  const [planCuotas, setPlanCuotas] = useState<PlanCuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const configError = getSupabaseConfigError();
    if (configError) {
      setError(configError);
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const data = await fetchAllData();
      setClientes(data.clientes);
      setPrestamos(data.prestamos);
      setAbonos(data.abonos);
      setPlanCuotas(data.planCuotas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) {
      void loadData();
    } else {
      setError(getSupabaseConfigError());
      setLoading(false);
    }
  }, [loadData]);

  const prestamosEnriquecidos = useMemo(
    () => enriquecerPrestamos(prestamos, clientes, abonos, planCuotas),
    [prestamos, clientes, abonos, planCuotas]
  );

  const metricas = useMemo((): MetricasDashboard => {
    const activos = prestamosEnriquecidos.filter((p) => p.estado !== "pagado");
    const clientesEnMora = new Set(
      activos.filter((p) => p.mora.dias_atraso > 0).map((p) => p.cliente_id)
    );
    const { intereses_ganados, intereses_por_cobrar } =
      calcularIntereses(prestamosEnriquecidos);

    return {
      dinero_en_calle: activos.reduce((s, p) => s + p.saldo_pendiente, 0),
      total_recaudado_hoy: calcularRecaudadoHoy(abonos),
      clientes_en_mora: clientesEnMora.size,
      proximos_cobros: activos.filter((p) => p.mora.dias_atraso === 0).length,
      intereses_ganados,
      intereses_por_cobrar,
    };
  }, [prestamosEnriquecidos, abonos]);

  const estadoCartera = useMemo(
    () => calcularEstadoCartera(prestamosEnriquecidos),
    [prestamosEnriquecidos]
  );

  const alertas = useMemo(
    () => generarAlertas(prestamosEnriquecidos),
    [prestamosEnriquecidos]
  );

  const moraPorCliente = useMemo(
    () => agregarMoraPorCliente(prestamosEnriquecidos),
    [prestamosEnriquecidos]
  );

  const datosGrafico = useMemo(
    () => generarDatosGrafico(abonos, prestamos),
    [abonos, prestamos]
  );

  const runMutation = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setMutating(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error en la operación";
      setError(msg);
      throw err;
    } finally {
      setMutating(false);
    }
  }, []);

  const addCliente = useCallback(
    async (data: Omit<Cliente, "id">): Promise<Cliente> => {
      return runMutation(async () => {
        const nuevo = await insertCliente(data);
        setClientes((prev) => [nuevo, ...prev]);
        return nuevo;
      });
    },
    [runMutation]
  );

  const updateCliente = useCallback(
    async (id: string, data: Partial<Omit<Cliente, "id">>) => {
      await runMutation(async () => {
        await updateClienteDb(id, data);
        setClientes((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...data } : c))
        );
      });
    },
    [runMutation]
  );

  const clienteTienePrestamos = useCallback(
    (clienteId: string) => prestamos.some((p) => p.cliente_id === clienteId),
    [prestamos]
  );

  const deleteCliente = useCallback(
    async (id: string): Promise<boolean> => {
      if (clienteTienePrestamos(id)) return false;

      await runMutation(async () => {
        await deleteClienteDb(id);
        setClientes((prev) => prev.filter((c) => c.id !== id));
      });
      return true;
    },
    [clienteTienePrestamos, runMutation]
  );

  const addClientesBulk = useCallback(
    async (items: Omit<Cliente, "id">[]) => {
      await runMutation(async () => {
        const nuevos = await insertClientesBulk(items);
        setClientes((prev) => [...nuevos, ...prev]);
      });
    },
    [runMutation]
  );

  const addPrestamo = useCallback(
    async (input: NuevoPrestamoInput) => {
      await runMutation(async () => {
        const { prestamo, planCuotas: nuevasCuotas } = await insertPrestamo(input);
        setPrestamos((prev) => [prestamo, ...prev]);
        setPlanCuotas((prev) => [...prev, ...nuevasCuotas]);
      });
    },
    [runMutation]
  );

  const updatePrestamo = useCallback(
    async (id: string, data: Partial<Prestamo>) => {
      await runMutation(async () => {
        await updatePrestamoDb(id, data);
        setPrestamos((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...data } : p))
        );
        if (data.valor_cuota != null) {
          setPlanCuotas((prev) =>
            prev.map((c) =>
              c.prestamo_id === id &&
              c.tipo_cuota === "interes" &&
              c.estado !== "pagada"
                ? { ...c, monto_cuota: data.valor_cuota! }
                : c
            )
          );
        }
      });
    },
    [runMutation]
  );

  const deletePrestamo = useCallback(
    async (id: string) => {
      await runMutation(async () => {
        await deletePrestamoDb(id);
        setPrestamos((prev) => prev.filter((p) => p.id !== id));
        setAbonos((prev) => prev.filter((a) => a.prestamo_id !== id));
        setPlanCuotas((prev) => prev.filter((c) => c.prestamo_id !== id));
      });
    },
    [runMutation]
  );

  const registrarAbono = useCallback(
    async (prestamoId: string, input: NuevoAbonoInput) => {
      const prestamo = prestamos.find((p) => p.id === prestamoId);
      if (!prestamo) return;

      await runMutation(async () => {
        const { prestamoActualizado, planCuotasActualizado, abono } =
          await registrarAbonoDb(prestamo, planCuotas, abonos, input);
        setPrestamos((prev) =>
          prev.map((p) => (p.id === prestamoId ? prestamoActualizado : p))
        );
        setPlanCuotas(planCuotasActualizado);
        setAbonos((prev) => [abono, ...prev]);
      });
    },
    [prestamos, planCuotas, abonos, runMutation]
  );

  const registrarAbonoAvanzado = useCallback(
    async (prestamoId: string, input: NuevoAbonoAvanzadoInput) => {
      await registrarAbono(prestamoId, input);
    },
    [registrarAbono]
  );

  const addPrestamoSimulado = useCallback(
    async (input: NuevoPrestamoSimuladoInput) => {
      return runMutation(async () => {
        const { prestamo, planCuotas: nuevasCuotas } =
          await insertPrestamoSimulado(input);
        setPrestamos((prev) => [prestamo, ...prev]);
        setPlanCuotas((prev) => [...prev, ...nuevasCuotas]);
        return prestamo;
      });
    },
    [runMutation]
  );

  const setClienteActivo = useCallback(
    async (id: string, activo: boolean) => {
      await runMutation(async () => {
        await setClienteActivoDb(id, activo);
        setClientes((prev) =>
          prev.map((c) => (c.id === id ? { ...c, activo } : c))
        );
      });
    },
    [runMutation]
  );

  const getClienteById = useCallback(
    (id: string) => clientes.find((c) => c.id === id),
    [clientes]
  );

  const getPrestamosByCliente = useCallback(
    (clienteId: string) =>
      prestamosEnriquecidos.filter((p) => p.cliente_id === clienteId),
    [prestamosEnriquecidos]
  );

  const getPrestamoEnriquecido = useCallback(
    (prestamoId: string) =>
      prestamosEnriquecidos.find((p) => p.id === prestamoId),
    [prestamosEnriquecidos]
  );

  const getAbonosByPrestamo = useCallback(
    (prestamoId: string) => abonos.filter((a) => a.prestamo_id === prestamoId),
    [abonos]
  );

  const value: DataStoreContextType = {
    clientes,
    prestamos,
    abonos,
    planCuotas,
    prestamosEnriquecidos,
    metricas,
    estadoCartera,
    alertas,
    moraPorCliente,
    datosGrafico,
    loading,
    mutating,
    error,
    refresh: loadData,
    addCliente,
    updateCliente,
    deleteCliente,
    addClientesBulk,
    addPrestamo,
    addPrestamoSimulado,
    updatePrestamo,
    deletePrestamo,
    registrarAbono,
    registrarAbonoAvanzado,
    setClienteActivo,
    getClienteById,
    getPrestamosByCliente,
    getPrestamoEnriquecido,
    getAbonosByPrestamo,
    clienteTienePrestamos,
  };

  return (
    <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>
  );
}
