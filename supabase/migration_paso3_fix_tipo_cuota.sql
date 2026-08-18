-- ============================================================
-- FIX — Registrar abono: columna tipo_cuota faltante
-- Ejecutar en Supabase SQL Editor si falla "No se pudo registrar el abono"
-- Error típico: record "p_row" has no field "tipo_cuota"
-- ============================================================

ALTER TABLE public.plan_cuotas
  ADD COLUMN IF NOT EXISTS tipo_cuota TEXT NOT NULL DEFAULT 'manual';

UPDATE public.plan_cuotas pc
SET tipo_cuota = CASE
  WHEN p.tipo_interes = 'compuesto_bancario' OR p.tipo_prestamo = 'cuotas_fijas' THEN 'fija'
  WHEN p.tipo_prestamo = 'solo_interes' THEN 'interes'
  ELSE pc.tipo_cuota
END
FROM public.prestamos p
WHERE pc.prestamo_id = p.id
  AND pc.tipo_cuota = 'manual';

CREATE OR REPLACE FUNCTION public.plan_cuota_to_jsonb(p_row plan_cuotas)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tipo_cuota TEXT := 'manual';
BEGIN
  BEGIN
    v_tipo_cuota := COALESCE(p_row.tipo_cuota::TEXT, 'manual');
  EXCEPTION
    WHEN undefined_column THEN
      v_tipo_cuota := 'manual';
  END;

  RETURN jsonb_build_object(
    'id', p_row.id,
    'prestamo_id', p_row.prestamo_id,
    'numero_cuota', p_row.numero_cuota,
    'monto_cuota', p_row.monto_cuota,
    'interes_cuota', COALESCE(p_row.interes_cuota, 0),
    'capital_cuota', COALESCE(p_row.capital_cuota, 0),
    'fecha_vencimiento', p_row.fecha_vencimiento,
    'monto_pagado', p_row.monto_pagado,
    'monto_pagado_interes', COALESCE(p_row.monto_pagado_interes, 0),
    'monto_pagado_capital', COALESCE(p_row.monto_pagado_capital, 0),
    'estado', p_row.estado::TEXT,
    'tipo_cuota', v_tipo_cuota
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prestamo_snapshot_to_jsonb(p_row prestamos)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tipo_interes TEXT := NULL;
BEGIN
  BEGIN
    v_tipo_interes := p_row.tipo_interes::TEXT;
  EXCEPTION
    WHEN undefined_column THEN
      v_tipo_interes := NULL;
  END;

  RETURN jsonb_build_object(
    'id', p_row.id,
    'cliente_id', p_row.cliente_id,
    'tipo_prestamo', p_row.tipo_prestamo::TEXT,
    'tipo_interes', v_tipo_interes,
    'monto_prestado', p_row.monto_prestado,
    'saldo_capital', p_row.saldo_capital,
    'frecuencia', p_row.frecuencia::TEXT,
    'tasa_interes', p_row.tasa_interes,
    'valor_cuota', p_row.valor_cuota,
    'total_cuotas', p_row.total_cuotas,
    'cuotas_pagadas', p_row.cuotas_pagadas,
    'estado', p_row.estado::TEXT,
    'fecha_inicio', p_row.fecha_inicio,
    'nota', COALESCE(p_row.nota, '')
  );
END;
$$;
