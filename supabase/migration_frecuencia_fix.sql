-- Unifica columna frecuencia_pago (BD antigua) → frecuencia (app actual)
-- Ejecutar si sale: null value in column "frecuencia_pago"

ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS frecuencia TEXT DEFAULT 'mensual';

UPDATE public.prestamos
SET frecuencia = COALESCE(
  NULLIF(TRIM(frecuencia::text), ''),
  frecuencia_pago::text,
  'mensual'
)
WHERE frecuencia IS NULL OR TRIM(frecuencia::text) = '';

-- Copiar a frecuencia_pago filas que solo tengan frecuencia
UPDATE public.prestamos
SET frecuencia_pago = frecuencia::text
WHERE frecuencia_pago IS NULL AND frecuencia IS NOT NULL;

-- Opcional: eliminar columna duplicada cuando ya no haga falta
-- ALTER TABLE public.prestamos DROP COLUMN IF EXISTS frecuencia_pago;
