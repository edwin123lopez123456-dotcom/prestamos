-- Parche: columnas faltantes en prestamos (BD muy antigua)
-- Ejecutar si la app dice: column prestamos.fecha_inicio does not exist

ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS monto_prestado NUMERIC(14, 0) DEFAULT 0;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS frecuencia TEXT DEFAULT 'mensual';
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS cuotas_pagadas INTEGER DEFAULT 0;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pendiente';
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS fecha_inicio DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS saldo_capital NUMERIC(14, 0);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS valor_cuota NUMERIC(14, 0);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS total_cuotas INTEGER;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS tasa_interes NUMERIC(8, 4);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS nota TEXT DEFAULT '';
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Rellenar datos vacíos
UPDATE public.prestamos SET fecha_inicio = COALESCE(fecha_inicio, created_at::date, CURRENT_DATE) WHERE fecha_inicio IS NULL;
UPDATE public.prestamos SET monto_prestado = COALESCE(monto_prestado, 0) WHERE monto_prestado IS NULL;
UPDATE public.prestamos SET saldo_capital = COALESCE(saldo_capital, monto_prestado) WHERE saldo_capital IS NULL;
UPDATE public.prestamos SET cuotas_pagadas = COALESCE(cuotas_pagadas, 0) WHERE cuotas_pagadas IS NULL;
UPDATE public.prestamos SET frecuencia = COALESCE(frecuencia, 'mensual') WHERE frecuencia IS NULL;
UPDATE public.prestamos SET estado = COALESCE(estado, 'pendiente') WHERE estado IS NULL;

-- Convertir frecuencia y estado a ENUM si existen como TEXT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prestamos'
      AND column_name = 'frecuencia' AND udt_name IN ('text', 'varchar')
  ) THEN
    ALTER TABLE public.prestamos
      ALTER COLUMN frecuencia TYPE frecuencia_pago
      USING COALESCE(frecuencia, 'mensual')::frecuencia_pago;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prestamos'
      AND column_name = 'estado' AND udt_name IN ('text', 'varchar')
  ) THEN
    ALTER TABLE public.prestamos
      ALTER COLUMN estado TYPE estado_prestamo
      USING COALESCE(estado, 'pendiente')::estado_prestamo;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- tipo_prestamo por si falta
DO $$
BEGIN
  ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS tipo_prestamo tipo_prestamo NOT NULL DEFAULT 'cuotas_manuales';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS tipo_interes tipo_interes;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_prestamos_fecha_inicio ON public.prestamos (fecha_inicio DESC);
