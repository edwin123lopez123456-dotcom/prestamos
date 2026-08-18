-- Migración v3: cuotas_fijas + tipo_cuota fija
-- Ejecutar en Supabase SQL Editor si ya tienes v2

ALTER TYPE tipo_prestamo ADD VALUE IF NOT EXISTS 'cuotas_fijas';
ALTER TYPE tipo_cuota ADD VALUE IF NOT EXISTS 'fija';
