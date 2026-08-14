-- ============================================================
-- Préstamos E-I — Esquema Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE frecuencia_pago AS ENUM ('diario', 'semanal', 'quincenal', 'mensual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE estado_prestamo AS ENUM ('pendiente', 'pagado', 'atrasado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.clientes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT NOT NULL,
  telefono       TEXT NOT NULL DEFAULT '',
  descripcion    TEXT NOT NULL DEFAULT '',
  fecha_registro DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON public.clientes (nombre);
CREATE INDEX IF NOT EXISTS idx_clientes_fecha_registro ON public.clientes (fecha_registro DESC);

CREATE TABLE IF NOT EXISTS public.prestamos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  monto_prestado  NUMERIC(14, 0) NOT NULL CHECK (monto_prestado > 0),
  frecuencia      frecuencia_pago NOT NULL,
  valor_cuota     NUMERIC(14, 0) NOT NULL CHECK (valor_cuota > 0),
  total_cuotas    INTEGER NOT NULL CHECK (total_cuotas > 0),
  cuotas_pagadas  INTEGER NOT NULL DEFAULT 0 CHECK (cuotas_pagadas >= 0),
  estado          estado_prestamo NOT NULL DEFAULT 'pendiente',
  fecha_inicio    DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cuotas_pagadas_validas CHECK (cuotas_pagadas <= total_cuotas)
);

CREATE INDEX IF NOT EXISTS idx_prestamos_cliente_id ON public.prestamos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON public.prestamos (estado);
CREATE INDEX IF NOT EXISTS idx_prestamos_fecha_inicio ON public.prestamos (fecha_inicio DESC);

CREATE TABLE IF NOT EXISTS public.abonos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestamo_id   UUID NOT NULL REFERENCES public.prestamos(id) ON DELETE CASCADE,
  monto_abonado NUMERIC(14, 0) NOT NULL CHECK (monto_abonado > 0),
  fecha_abono   DATE NOT NULL,
  notas         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abonos_prestamo_id ON public.abonos (prestamo_id);
CREATE INDEX IF NOT EXISTS idx_abonos_fecha_abono ON public.abonos (fecha_abono DESC);

ALTER TABLE public.clientes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestamos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abonos    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_all_anon"  ON public.clientes;
DROP POLICY IF EXISTS "prestamos_all_anon" ON public.prestamos;
DROP POLICY IF EXISTS "abonos_all_anon"    ON public.abonos;

CREATE POLICY "clientes_all_anon"  ON public.clientes  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "prestamos_all_anon" ON public.prestamos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "abonos_all_anon"    ON public.abonos    FOR ALL USING (true) WITH CHECK (true);
