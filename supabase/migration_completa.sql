-- ============================================================
-- MIGRACIÓN COMPLETA — ejecutar UNA SOLA VEZ en Supabase SQL Editor
-- Para BD antigua o parcial (errores tipo_prestamo, valor_cuota, etc.)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. ENUMS (crear todos desde cero) ──────────────────────

DO $$ BEGIN
  CREATE TYPE frecuencia_pago AS ENUM ('diario', 'semanal', 'quincenal', 'mensual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE estado_prestamo AS ENUM ('pendiente', 'pagado', 'atrasado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tipo_prestamo AS ENUM ('cuotas_fijas', 'cuotas_manuales', 'solo_interes');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE estado_plan_cuota AS ENUM ('pendiente', 'parcial', 'pagada', 'anulada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tipo_cuota AS ENUM ('manual', 'interes', 'fija');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tipo_abono AS ENUM ('cuota', 'interes', 'capital');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tipo_interes AS ENUM ('capital_inicial', 'cada_cuota', 'compuesto_bancario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Valores extra por si los enums ya existían sin ellos
ALTER TYPE tipo_prestamo ADD VALUE IF NOT EXISTS 'cuotas_fijas';
ALTER TYPE tipo_prestamo ADD VALUE IF NOT EXISTS 'cuotas_manuales';
ALTER TYPE tipo_prestamo ADD VALUE IF NOT EXISTS 'solo_interes';
ALTER TYPE tipo_cuota ADD VALUE IF NOT EXISTS 'fija';
ALTER TYPE tipo_cuota ADD VALUE IF NOT EXISTS 'interes';
ALTER TYPE tipo_cuota ADD VALUE IF NOT EXISTS 'manual';
ALTER TYPE estado_plan_cuota ADD VALUE IF NOT EXISTS 'anulada';

-- ── 2. TABLA CLIENTES ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clientes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT NOT NULL,
  telefono       TEXT NOT NULL DEFAULT '',
  descripcion    TEXT NOT NULL DEFAULT '',
  fecha_registro DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS telefono TEXT DEFAULT '';
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS descripcion TEXT DEFAULT '';
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS fecha_registro DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

UPDATE public.clientes
SET fecha_registro = COALESCE(fecha_registro, created_at::date, CURRENT_DATE)
WHERE fecha_registro IS NULL;

UPDATE public.clientes SET telefono = '' WHERE telefono IS NULL;
UPDATE public.clientes SET descripcion = '' WHERE descripcion IS NULL;
UPDATE public.clientes SET activo = true WHERE activo IS NULL;

-- ── 3. TABLA PRESTAMOS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prestamos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  monto_prestado  NUMERIC(14, 0) NOT NULL DEFAULT 0,
  frecuencia      frecuencia_pago NOT NULL DEFAULT 'mensual',
  cuotas_pagadas  INTEGER NOT NULL DEFAULT 0,
  estado          estado_prestamo NOT NULL DEFAULT 'pendiente',
  fecha_inicio    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS monto_prestado NUMERIC(14, 0) DEFAULT 0;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS frecuencia TEXT DEFAULT 'mensual';
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS cuotas_pagadas INTEGER DEFAULT 0;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pendiente';
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS fecha_inicio DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS tipo_prestamo TEXT;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS saldo_capital NUMERIC(14, 0);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS tasa_interes NUMERIC(8, 4);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS valor_cuota NUMERIC(14, 0);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS total_cuotas INTEGER;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS nota TEXT DEFAULT '';
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.prestamos SET fecha_inicio = COALESCE(fecha_inicio, created_at::date, CURRENT_DATE) WHERE fecha_inicio IS NULL;
UPDATE public.prestamos SET monto_prestado = COALESCE(monto_prestado, 0) WHERE monto_prestado IS NULL;

-- Convertir tipo_prestamo a enum si aún es TEXT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prestamos'
      AND column_name = 'tipo_prestamo' AND udt_name = 'text'
  ) THEN
    ALTER TABLE public.prestamos
      ALTER COLUMN tipo_prestamo TYPE tipo_prestamo
      USING COALESCE(tipo_prestamo, 'cuotas_manuales')::tipo_prestamo;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prestamos'
      AND column_name = 'tipo_prestamo'
  ) THEN
    ALTER TABLE public.prestamos
      ADD COLUMN tipo_prestamo tipo_prestamo NOT NULL DEFAULT 'cuotas_manuales';
  END IF;
EXCEPTION WHEN others THEN
  ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS tipo_prestamo tipo_prestamo NOT NULL DEFAULT 'cuotas_manuales';
END $$;

-- tipo_interes (v4)
DO $$
BEGIN
  ALTER TABLE public.prestamos ADD COLUMN tipo_interes tipo_interes;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE public.prestamos SET saldo_capital = monto_prestado WHERE saldo_capital IS NULL;
UPDATE public.prestamos SET nota = '' WHERE nota IS NULL;

-- ── 4. TABLA PLAN_CUOTAS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_cuotas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestamo_id       UUID NOT NULL REFERENCES public.prestamos(id) ON DELETE CASCADE,
  numero_cuota      INTEGER NOT NULL CHECK (numero_cuota > 0),
  monto_cuota       NUMERIC(14, 0) NOT NULL CHECK (monto_cuota > 0),
  fecha_vencimiento DATE NOT NULL,
  monto_pagado      NUMERIC(14, 0) NOT NULL DEFAULT 0 CHECK (monto_pagado >= 0),
  estado            estado_plan_cuota NOT NULL DEFAULT 'pendiente',
  tipo_cuota        tipo_cuota NOT NULL DEFAULT 'manual',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT monto_pagado_valido CHECK (monto_pagado <= monto_cuota)
);

-- ── 5. TABLA ABONOS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.abonos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestamo_id   UUID NOT NULL REFERENCES public.prestamos(id) ON DELETE CASCADE,
  monto_abonado NUMERIC(14, 0) NOT NULL CHECK (monto_abonado > 0),
  fecha_abono   DATE NOT NULL DEFAULT CURRENT_DATE,
  notas         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.abonos ADD COLUMN IF NOT EXISTS tipo_abono TEXT DEFAULT 'cuota';
ALTER TABLE public.abonos ADD COLUMN IF NOT EXISTS plan_cuota_id UUID;
ALTER TABLE public.abonos ADD COLUMN IF NOT EXISTS metodo_pago TEXT DEFAULT '';
ALTER TABLE public.abonos ADD COLUMN IF NOT EXISTS aplicacion_abono TEXT DEFAULT 'interes_y_capital';
ALTER TABLE public.abonos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'abonos'
      AND column_name = 'tipo_abono' AND udt_name = 'text'
  ) THEN
    ALTER TABLE public.abonos
      ALTER COLUMN tipo_abono TYPE tipo_abono
      USING COALESCE(tipo_abono, 'cuota')::tipo_abono;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'abonos'
      AND column_name = 'tipo_abono'
  ) THEN
    ALTER TABLE public.abonos
      ADD COLUMN tipo_abono tipo_abono NOT NULL DEFAULT 'cuota';
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.abonos
    ADD CONSTRAINT abonos_plan_cuota_id_fkey
    FOREIGN KEY (plan_cuota_id) REFERENCES public.plan_cuotas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 6. ÍNDICES ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON public.clientes (nombre);
CREATE INDEX IF NOT EXISTS idx_clientes_fecha_registro ON public.clientes (fecha_registro DESC);
CREATE INDEX IF NOT EXISTS idx_prestamos_cliente_id ON public.prestamos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON public.prestamos (estado);
CREATE INDEX IF NOT EXISTS idx_prestamos_tipo ON public.prestamos (tipo_prestamo);
CREATE INDEX IF NOT EXISTS idx_prestamos_fecha_inicio ON public.prestamos (fecha_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_plan_cuotas_prestamo ON public.plan_cuotas (prestamo_id);
CREATE INDEX IF NOT EXISTS idx_plan_cuotas_vencimiento ON public.plan_cuotas (fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_abonos_prestamo_id ON public.abonos (prestamo_id);
CREATE INDEX IF NOT EXISTS idx_abonos_fecha_abono ON public.abonos (fecha_abono DESC);

-- ── 7. SEGURIDAD (RLS) ─────────────────────────────────────

ALTER TABLE public.clientes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestamos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_cuotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abonos      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_all_anon"    ON public.clientes;
DROP POLICY IF EXISTS "prestamos_all_anon"   ON public.prestamos;
DROP POLICY IF EXISTS "plan_cuotas_all_anon" ON public.plan_cuotas;
DROP POLICY IF EXISTS "abonos_all_anon"      ON public.abonos;

CREATE POLICY "clientes_all_anon"    ON public.clientes    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "prestamos_all_anon"   ON public.prestamos   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "plan_cuotas_all_anon" ON public.plan_cuotas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "abonos_all_anon"      ON public.abonos      FOR ALL USING (true) WITH CHECK (true);

-- ✅ Listo — recarga la app en http://localhost:3000
