-- Columnas legacy en plan_cuotas (interes_cuota, capital_cuota)
UPDATE public.plan_cuotas
SET interes_cuota = COALESCE(interes_cuota, 0),
    capital_cuota = COALESCE(capital_cuota, monto_cuota, 0),
    monto_pagado = COALESCE(monto_pagado, 0),
    estado = COALESCE(estado, 'pendiente')
WHERE interes_cuota IS NULL OR capital_cuota IS NULL;

-- Ejecutar solo si quieres alinear con el esquema nuevo

DO $$ BEGIN
  CREATE TYPE tipo_cuota AS ENUM ('manual', 'interes', 'fija');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.plan_cuotas
  ADD COLUMN IF NOT EXISTS tipo_cuota TEXT DEFAULT 'manual';

UPDATE public.plan_cuotas pc
SET tipo_cuota = CASE
  WHEN p.tipo_interes = 'compuesto_bancario' OR p.tipo_prestamo = 'cuotas_fijas' THEN 'fija'
  WHEN p.tipo_prestamo = 'solo_interes' THEN 'interes'
  ELSE 'manual'
END
FROM public.prestamos p
WHERE pc.prestamo_id = p.id
  AND (pc.tipo_cuota IS NULL OR pc.tipo_cuota = 'manual');
