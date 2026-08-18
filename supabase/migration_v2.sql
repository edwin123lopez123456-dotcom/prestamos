-- ============================================================
-- Migración v2 — ejecutar si ya tienes la BD v1 instalada
-- ============================================================

DO $$ BEGIN
  CREATE TYPE tipo_prestamo AS ENUM ('cuotas_manuales', 'solo_interes');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE estado_plan_cuota AS ENUM ('pendiente', 'parcial', 'pagada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tipo_cuota AS ENUM ('manual', 'interes');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tipo_abono AS ENUM ('cuota', 'interes', 'capital');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.prestamos
  ADD COLUMN IF NOT EXISTS tipo_prestamo tipo_prestamo NOT NULL DEFAULT 'cuotas_manuales',
  ADD COLUMN IF NOT EXISTS saldo_capital NUMERIC(14, 0),
  ADD COLUMN IF NOT EXISTS tasa_interes NUMERIC(8, 4);

UPDATE public.prestamos
SET saldo_capital = monto_prestado
WHERE saldo_capital IS NULL;

ALTER TABLE public.prestamos
  ALTER COLUMN saldo_capital SET NOT NULL,
  ALTER COLUMN saldo_capital SET DEFAULT 0;

ALTER TABLE public.prestamos
  ALTER COLUMN valor_cuota DROP NOT NULL,
  ALTER COLUMN total_cuotas DROP NOT NULL;

ALTER TABLE public.prestamos
  DROP CONSTRAINT IF EXISTS cuotas_pagadas_validas;

ALTER TABLE public.abonos
  ADD COLUMN IF NOT EXISTS tipo_abono tipo_abono NOT NULL DEFAULT 'cuota',
  ADD COLUMN IF NOT EXISTS plan_cuota_id UUID;

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

-- Migrar préstamos v1 existentes a plan_cuotas sintético
INSERT INTO public.plan_cuotas (prestamo_id, numero_cuota, monto_cuota, fecha_vencimiento, monto_pagado, estado, tipo_cuota)
SELECT
  p.id,
  gs.n,
  p.valor_cuota,
  CASE p.frecuencia
    WHEN 'diario' THEN (p.fecha_inicio + (gs.n || ' days')::interval)::date
    WHEN 'semanal' THEN (p.fecha_inicio + (gs.n * 7 || ' days')::interval)::date
    WHEN 'quincenal' THEN (p.fecha_inicio + (gs.n * 15 || ' days')::interval)::date
    WHEN 'mensual' THEN (p.fecha_inicio + (gs.n || ' months')::interval)::date
  END,
  CASE WHEN gs.n <= p.cuotas_pagadas THEN p.valor_cuota ELSE 0 END,
  CASE
    WHEN gs.n <= p.cuotas_pagadas THEN 'pagada'::estado_plan_cuota
    ELSE 'pendiente'::estado_plan_cuota
  END,
  'manual'::tipo_cuota
FROM public.prestamos p
CROSS JOIN generate_series(1, COALESCE(p.total_cuotas, 1)) AS gs(n)
WHERE p.tipo_prestamo = 'cuotas_manuales'
  AND NOT EXISTS (
    SELECT 1 FROM public.plan_cuotas pc WHERE pc.prestamo_id = p.id
  );

ALTER TABLE public.plan_cuotas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan_cuotas_all_anon" ON public.plan_cuotas;
CREATE POLICY "plan_cuotas_all_anon" ON public.plan_cuotas FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN
  ALTER TABLE public.abonos
    ADD CONSTRAINT abonos_plan_cuota_id_fkey
    FOREIGN KEY (plan_cuota_id) REFERENCES public.plan_cuotas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_plan_cuotas_prestamo ON public.plan_cuotas (prestamo_id);
CREATE INDEX IF NOT EXISTS idx_plan_cuotas_vencimiento ON public.plan_cuotas (fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_prestamos_tipo ON public.prestamos (tipo_prestamo);
