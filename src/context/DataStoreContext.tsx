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
  Abono,
  AlertaRapida,
  Cliente,
  DatoGrafico,
  EstadoCartera,
  MetricasDashboard,
  MoraCliente,
  NuevoPrestamoInput,
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
  updatePrestamoDb,
  deletePrestamoDb,
  registrarAbonoDb,
} from "@/lib/database";
import { getSupabaseConfigError, isSupabaseConfigured } from "@/lib/supabase";

interface DataStoreContextType {
  clientes: Cliente[];
  prestamos: Prestamo[];
  abonos: Abono[];
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
  updatePrestamo: (id: string, data: Partial<Prestamo>) => Promise<void>;
  deletePrestamo: (id: string) => Promise<void>;
  registrarAbono: (prestamoId: string, abono: Omit<Abono, "id">) => Promise<void>;
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
  const [abonos, setAbonos] = useState<Abono[]>([]);
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
    () => enriquecerPrestamos(prestamos, clientes, abonos),
    [prestamos, clientes, abonos]
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
        const nuevo = await insertPrestamo(input);
        setPrestamos((prev) => [nuevo, ...prev]);
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
      });
    },
    [runMutation]
  );

  const registrarAbono = useCallback(
    async (prestamoId: string, nuevoAbono: Omit<Abono, "id">) => {
      const prestamo = prestamos.find((p) => p.id === prestamoId);
      if (!prestamo) return;

      await runMutation(async () => {
        const { prestamoActualizado, abono } = await registrarAbonoDb(
          prestamo,
          abonos,
          nuevoAbono
        );
        setPrestamos((prev) =>
          prev.map((p) => (p.id === prestamoId ? prestamoActualizado : p))
        );
        setAbonos((prev) => [abono, ...prev]);
      });
    },
    [prestamos, abonos, runMutation]
  );

  const value: DataStoreContextType = {
    clientes,
    prestamos,
    abonos,
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
    updatePrestamo,
    deletePrestamo,
    registrarAbono,
    clienteTienePrestamos,
  };

  return (
    <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>
  );
}
