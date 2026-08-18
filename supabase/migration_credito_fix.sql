-- Parche: permite guardar créditos desde el simulador CobrApp
-- Ejecutar si al guardar sale "No se pudo crear el crédito"

-- Enums necesarios
DO $$ BEGIN
  CREATE TYPE tipo_interes AS ENUM ('capital_inicial', 'cada_cuota', 'compuesto_bancario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tipo_prestamo AS ENUM ('cuotas_fijas', 'cuotas_manuales', 'solo_interes');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE frecuencia_pago AS ENUM ('diario', 'semanal', 'quincenal', 'mensual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE estado_prestamo AS ENUM ('pendiente', 'pagado', 'atrasado');
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

ALTER TYPE tipo_prestamo ADD VALUE IF NOT EXISTS 'cuotas_fijas';
ALTER TYPE tipo_prestamo ADD VALUE IF NOT EXISTS 'cuotas_manuales';
ALTER TYPE tipo_prestamo ADD VALUE IF NOT EXISTS 'solo_interes';

-- Columnas en prestamos (todas las que usa la app al guardar)
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS fecha_inicio DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS monto_prestado NUMERIC(14, 0) DEFAULT 0;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS saldo_capital NUMERIC(14, 0) DEFAULT 0;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS valor_cuota NUMERIC(14, 0);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS total_cuotas INTEGER;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS cuotas_pagadas INTEGER DEFAULT 0;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS tasa_interes NUMERIC(8, 4);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS nota TEXT DEFAULT '';

DO $$ BEGIN
  ALTER TABLE public.prestamos ADD COLUMN tipo_interes tipo_interes;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.prestamos ADD COLUMN tipo_prestamo tipo_prestamo NOT NULL DEFAULT 'cuotas_manuales';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.prestamos ADD COLUMN frecuencia frecuencia_pago NOT NULL DEFAULT 'mensual';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.prestamos ADD COLUMN estado estado_prestamo NOT NULL DEFAULT 'pendiente';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE public.prestamos SET fecha_inicio = COALESCE(fecha_inicio, CURRENT_DATE) WHERE fecha_inicio IS NULL;
UPDATE public.prestamos SET saldo_capital = COALESCE(saldo_capital, monto_prestado, 0) WHERE saldo_capital IS NULL;
UPDATE public.prestamos SET nota = COALESCE(nota, '') WHERE nota IS NULL;

-- Tabla plan_cuotas (requerida al guardar)
CREATE TABLE IF NOT EXISTS public.plan_cuotas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestamo_id       UUID NOT NULL REFERENCES public.prestamos(id) ON DELETE CASCADE,
  numero_cuota      INTEGER NOT NULL CHECK (numero_cuota > 0),
  monto_cuota       NUMERIC(14, 0) NOT NULL CHECK (monto_cuota > 0),
  fecha_vencimiento DATE NOT NULL,
  monto_pagado      NUMERIC(14, 0) NOT NULL DEFAULT 0,
  estado            estado_plan_cuota NOT NULL DEFAULT 'pendiente',
  tipo_cuota        tipo_cuota NOT NULL DEFAULT 'manual',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.plan_cuotas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan_cuotas_all_anon" ON public.plan_cuotas;
CREATE POLICY "plan_cuotas_all_anon" ON public.plan_cuotas FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prestamos_all_anon" ON public.prestamos;
CREATE POLICY "prestamos_all_anon" ON public.prestamos FOR ALL USING (true) WITH CHECK (true);
