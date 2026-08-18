-- Unifica columnas legacy de prestamos
-- Ejecutar si falla: null value in column "fecha_credito", "frecuencia_pago" o "deuda_total"

ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS fecha_inicio DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS frecuencia TEXT DEFAULT 'mensual';
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS deuda_total NUMERIC(14, 0);

UPDATE public.prestamos
SET fecha_inicio = COALESCE(fecha_inicio, fecha_credito, CURRENT_DATE)
WHERE fecha_inicio IS NULL;

UPDATE public.prestamos
SET fecha_credito = COALESCE(fecha_credito, fecha_inicio, CURRENT_DATE)
WHERE fecha_credito IS NULL;

UPDATE public.prestamos
SET frecuencia = COALESCE(NULLIF(TRIM(frecuencia::text), ''), frecuencia_pago::text, 'mensual')
WHERE frecuencia IS NULL OR TRIM(frecuencia::text) = '';

UPDATE public.prestamos
SET frecuencia_pago = COALESCE(frecuencia_pago::text, frecuencia::text, 'mensual')
WHERE frecuencia_pago IS NULL;

UPDATE public.prestamos
SET deuda_total = COALESCE(
  deuda_total,
  saldo_capital + COALESCE(saldo_interes, 0),
  saldo_capital,
  monto_prestado,
  0
)
WHERE deuda_total IS NULL;

UPDATE public.prestamos
SET saldo_interes = COALESCE(
  saldo_interes,
  GREATEST(deuda_total - COALESCE(saldo_capital, monto_prestado, 0), 0),
  0
)
WHERE saldo_interes IS NULL;

UPDATE public.prestamos
SET porcentaje_interes = COALESCE(porcentaje_interes, tasa_interes)
WHERE porcentaje_interes IS NULL AND tasa_interes IS NOT NULL;

UPDATE public.prestamos
SET cuota_deseada = COALESCE(cuota_deseada, valor_cuota)
WHERE cuota_deseada IS NULL AND valor_cuota IS NOT NULL;
