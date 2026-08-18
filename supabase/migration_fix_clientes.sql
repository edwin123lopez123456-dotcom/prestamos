-- ============================================================
-- Reparación: tabla clientes antigua sin fecha_registro
-- Ejecutar PRIMERO si schema.sql falló con:
--   ERROR: column "fecha_registro" does not exist
-- ============================================================

-- Columnas que la app necesita en clientes
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS telefono TEXT DEFAULT '';
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS descripcion TEXT DEFAULT '';
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS fecha_registro DATE;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Rellenar fecha_registro desde created_at o hoy
UPDATE public.clientes
SET fecha_registro = COALESCE(
  fecha_registro,
  created_at::date,
  CURRENT_DATE
)
WHERE fecha_registro IS NULL;

ALTER TABLE public.clientes
  ALTER COLUMN fecha_registro SET DEFAULT CURRENT_DATE;

-- Índices (ahora sí existe la columna)
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON public.clientes (nombre);
CREATE INDEX IF NOT EXISTS idx_clientes_fecha_registro ON public.clientes (fecha_registro DESC);

-- Asegurar valores vacíos en texto
UPDATE public.clientes SET telefono = '' WHERE telefono IS NULL;
UPDATE public.clientes SET descripcion = '' WHERE descripcion IS NULL;
