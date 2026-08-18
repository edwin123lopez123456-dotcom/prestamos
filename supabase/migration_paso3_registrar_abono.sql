-- ============================================================
-- PASO 3 — Registrar abono atómico (estructura + RPC)
-- Ejecutar en Supabase SQL Editor tras aprobar diseño 3.2
-- ============================================================

-- ── 3.3.1 Estructura ────────────────────────────────────────

ALTER TABLE public.plan_cuotas
  ADD COLUMN IF NOT EXISTS interes_cuota NUMERIC(14, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capital_cuota NUMERIC(14, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_pagado_interes NUMERIC(14, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_pagado_capital NUMERIC(14, 0) NOT NULL DEFAULT 0,
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

ALTER TABLE public.abonos
  ADD COLUMN IF NOT EXISTS monto_interes_aplicado NUMERIC(14, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_capital_aplicado NUMERIC(14, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS aplicacion_abono TEXT DEFAULT 'interes_y_capital';

DO $$ BEGIN
  CREATE TYPE tipo_interes AS ENUM ('capital_inicial', 'cada_cuota', 'compuesto_bancario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS tipo_interes tipo_interes;

CREATE UNIQUE INDEX IF NOT EXISTS abonos_idempotency_key_unique
  ON public.abonos (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Columnas legacy en prestamos (requeridas por UPDATE de la RPC)
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS deuda_total NUMERIC(14, 0);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS saldo_interes NUMERIC(14, 0);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS fecha_credito DATE;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS frecuencia_pago TEXT;
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS porcentaje_interes NUMERIC(8, 4);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS cuota_deseada NUMERIC(14, 0);
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS nota TEXT DEFAULT '';

-- ── Errores de dominio ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rae_raise(p_code TEXT, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '%: %', p_code, p_message USING ERRCODE = 'P0001';
END;
$$;

-- ── Capa B: componentes y pendientes ────────────────────────

CREATE OR REPLACE FUNCTION public.resolver_componentes_cuota(
  p_monto_cuota NUMERIC,
  p_interes_cuota NUMERIC,
  p_capital_cuota NUMERIC,
  p_tipo_cuota TEXT
)
RETURNS TABLE (
  interes_total NUMERIC,
  capital_total NUMERIC,
  modo TEXT
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_monto NUMERIC := COALESCE(p_monto_cuota, 0);
  v_interes NUMERIC := COALESCE(p_interes_cuota, 0);
  v_capital NUMERIC := COALESCE(p_capital_cuota, 0);
BEGIN
  IF v_interes >= 0
     AND v_capital >= 0
     AND v_interes + v_capital = v_monto THEN
    RETURN QUERY SELECT v_interes, v_capital, 'desglose'::TEXT;
    RETURN;
  END IF;

  IF p_tipo_cuota = 'interes' AND v_capital = 0 THEN
    RETURN QUERY SELECT v_monto, 0::NUMERIC, 'legacy_solo_interes'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT 0::NUMERIC, v_monto, 'legacy_solo_capital'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_pagado_desglosado(
  p_monto_pagado NUMERIC,
  p_monto_pagado_interes NUMERIC,
  p_monto_pagado_capital NUMERIC,
  p_interes_total NUMERIC,
  p_capital_total NUMERIC
)
RETURNS TABLE (pagado_interes NUMERIC, pagado_capital NUMERIC)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_monto_pagado_interes IS NOT NULL AND p_monto_pagado_capital IS NOT NULL THEN
    RETURN QUERY SELECT p_monto_pagado_interes, p_monto_pagado_capital;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    LEAST(COALESCE(p_monto_pagado, 0), p_interes_total),
    LEAST(
      GREATEST(0, COALESCE(p_monto_pagado, 0) - p_interes_total),
      p_capital_total
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_pendientes_cuota_row(
  p_monto_cuota NUMERIC,
  p_monto_pagado NUMERIC,
  p_monto_pagado_interes NUMERIC,
  p_monto_pagado_capital NUMERIC,
  p_interes_cuota NUMERIC,
  p_capital_cuota NUMERIC,
  p_tipo_cuota TEXT
)
RETURNS TABLE (
  interes_pendiente NUMERIC,
  capital_pendiente NUMERIC,
  saldo_cuota NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_comp RECORD;
  v_pagado RECORD;
  v_int_p NUMERIC;
  v_cap_p NUMERIC;
BEGIN
  SELECT * INTO v_comp
  FROM public.resolver_componentes_cuota(
    p_monto_cuota, p_interes_cuota, p_capital_cuota, p_tipo_cuota
  );

  SELECT * INTO v_pagado
  FROM public.obtener_pagado_desglosado(
    p_monto_pagado,
    p_monto_pagado_interes,
    p_monto_pagado_capital,
    v_comp.interes_total,
    v_comp.capital_total
  );

  v_int_p := GREATEST(0, v_comp.interes_total - v_pagado.pagado_interes);
  v_cap_p := GREATEST(0, v_comp.capital_total - v_pagado.pagado_capital);

  RETURN QUERY SELECT v_int_p, v_cap_p, v_int_p + v_cap_p;
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_estado_cuota_row(
  p_monto_cuota NUMERIC,
  p_monto_pagado NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_saldo NUMERIC;
BEGIN
  v_saldo := GREATEST(0, COALESCE(p_monto_cuota, 0) - COALESCE(p_monto_pagado, 0));
  IF v_saldo <= 0 THEN
    RETURN 'pagada';
  ELSIF COALESCE(p_monto_pagado, 0) > 0 THEN
    RETURN 'parcial';
  END IF;
  RETURN 'pendiente';
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_aplicacion_abono_sql(
  p_tipo_abono TEXT,
  p_aplicacion_abono TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_aplicacion_abono IS NOT NULL AND TRIM(p_aplicacion_abono) <> '' THEN
    RETURN TRIM(p_aplicacion_abono);
  END IF;
  IF p_tipo_abono = 'interes' THEN RETURN 'solo_interes'; END IF;
  IF p_tipo_abono = 'capital' THEN RETURN 'solo_capital'; END IF;
  RETURN 'interes_y_capital';
END;
$$;

CREATE OR REPLACE FUNCTION public.map_aplicacion_to_tipo_abono(p_aplicacion TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_aplicacion = 'solo_interes' THEN RETURN 'interes'; END IF;
  IF p_aplicacion = 'solo_capital' THEN RETURN 'capital'; END IF;
  RETURN 'cuota';
END;
$$;

CREATE OR REPLACE FUNCTION public.total_capital_pendiente_cuotas_sql(p_cuotas JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  r RECORD;
  v_pend RECORD;
  v_total NUMERIC := 0;
BEGIN
  FOR r IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_cuotas, '[]'::JSONB)) AS c(
      monto_cuota NUMERIC,
      monto_pagado NUMERIC,
      monto_pagado_interes NUMERIC,
      monto_pagado_capital NUMERIC,
      interes_cuota NUMERIC,
      capital_cuota NUMERIC,
      tipo_cuota TEXT,
      estado TEXT
    )
  LOOP
    IF r.estado = 'pagada' THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_pend
    FROM public.calcular_pendientes_cuota_row(
      r.monto_cuota, r.monto_pagado, r.monto_pagado_interes, r.monto_pagado_capital,
      r.interes_cuota, r.capital_cuota, r.tipo_cuota
    );

    v_total := v_total + COALESCE(v_pend.capital_pendiente, 0);
  END LOOP;

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.sumar_periodo_fecha_sql(
  p_fecha DATE,
  p_frecuencia TEXT,
  p_periodos INTEGER
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE COALESCE(p_frecuencia, 'semanal')
    WHEN 'diario' THEN RETURN p_fecha + p_periodos;
    WHEN 'semanal' THEN RETURN p_fecha + (p_periodos * 7);
    WHEN 'quincenal' THEN RETURN p_fecha + (p_periodos * 15);
    WHEN 'mensual' THEN RETURN (p_fecha + (p_periodos || ' months')::INTERVAL)::DATE;
    ELSE RETURN p_fecha + (p_periodos * 7);
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_cuota_interes_sql(
  p_prestamo_id UUID,
  p_valor_cuota NUMERIC,
  p_frecuencia TEXT,
  p_fecha_inicio DATE
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_numero INTEGER;
  v_ultima_fecha DATE;
  v_nueva_fecha DATE;
  v_id UUID;
BEGIN
  SELECT COALESCE(MAX(numero_cuota), 0) + 1
  INTO v_numero
  FROM public.plan_cuotas
  WHERE prestamo_id = p_prestamo_id
    AND COALESCE(tipo_cuota::TEXT, 'manual') = 'interes';

  SELECT MAX(fecha_vencimiento)
  INTO v_ultima_fecha
  FROM public.plan_cuotas
  WHERE prestamo_id = p_prestamo_id
    AND COALESCE(tipo_cuota::TEXT, 'manual') = 'interes';

  IF v_ultima_fecha IS NULL THEN
    v_ultima_fecha := p_fecha_inicio;
  END IF;

  v_nueva_fecha := public.sumar_periodo_fecha_sql(v_ultima_fecha, p_frecuencia, 1);

  INSERT INTO public.plan_cuotas (
    prestamo_id,
    numero_cuota,
    monto_cuota,
    interes_cuota,
    capital_cuota,
    fecha_vencimiento,
    monto_pagado,
    monto_pagado_interes,
    monto_pagado_capital,
    estado,
    tipo_cuota
  ) VALUES (
    p_prestamo_id,
    v_numero,
    p_valor_cuota,
    p_valor_cuota,
    0,
    v_nueva_fecha,
    0,
    0,
    0,
    'pendiente',
    'interes'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_abono_capital_prestamo_sql(
  p_prestamo_id UUID,
  p_monto_abonado NUMERIC,
  p_fecha_abono DATE,
  p_notas TEXT,
  p_metodo_pago TEXT,
  p_idempotency_key UUID,
  p_prestamo public.prestamos
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_nuevo_saldo NUMERIC;
  v_abono public.abonos%ROWTYPE;
  v_prestamo public.prestamos%ROWTYPE;
  v_prestamo_json JSONB;
  v_prestamo_tras JSONB;
  v_cuotas_snapshot JSONB;
  v_replay JSONB;
  v_constraint TEXT;
BEGIN
  IF p_monto_abonado > COALESCE(p_prestamo.saldo_capital, 0) THEN
    PERFORM public.rae_raise(
      'RAE014',
      'El monto supera la deuda aplicable por $' || (p_monto_abonado - COALESCE(p_prestamo.saldo_capital, 0))::TEXT
    );
  END IF;

  v_nuevo_saldo := COALESCE(p_prestamo.saldo_capital, 0) - p_monto_abonado;

  DELETE FROM public.plan_cuotas
  WHERE prestamo_id = p_prestamo_id
    AND estado <> 'pagada'
    AND COALESCE(tipo_cuota::TEXT, 'manual') = 'interes';

  IF v_nuevo_saldo > 0 THEN
    PERFORM public.crear_cuota_interes_sql(
      p_prestamo_id,
      COALESCE(p_prestamo.valor_cuota, 0),
      p_prestamo.frecuencia::TEXT,
      p_prestamo.fecha_inicio
    );
  END IF;

  BEGIN
    INSERT INTO public.abonos (
      prestamo_id,
      monto_abonado,
      fecha_abono,
      notas,
      tipo_abono,
      plan_cuota_id,
      metodo_pago,
      aplicacion_abono,
      monto_interes_aplicado,
      monto_capital_aplicado,
      idempotency_key
    ) VALUES (
      p_prestamo_id,
      p_monto_abonado,
      p_fecha_abono,
      COALESCE(p_notas, ''),
      'capital'::tipo_abono,
      NULL,
      COALESCE(p_metodo_pago, ''),
      'solo_capital',
      0,
      p_monto_abonado,
      p_idempotency_key
    )
    RETURNING * INTO v_abono;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'abonos_idempotency_key_unique' AND p_idempotency_key IS NOT NULL THEN
        v_replay := public.registrar_abono_fetch_replay(p_idempotency_key);
        IF v_replay IS NOT NULL THEN
          RETURN v_replay;
        END IF;
      END IF;
      RAISE;
  END;

  v_prestamo := p_prestamo;
  v_prestamo.saldo_capital := v_nuevo_saldo;

  SELECT COALESCE(jsonb_agg(public.plan_cuota_to_jsonb(pc) ORDER BY pc.numero_cuota), '[]'::JSONB)
  INTO v_cuotas_snapshot
  FROM public.plan_cuotas pc
  WHERE pc.prestamo_id = p_prestamo_id;

  v_prestamo_json := public.prestamo_snapshot_to_jsonb(v_prestamo);
  v_prestamo_tras := public.calcular_prestamo_tras_abono_sql(v_prestamo_json, v_cuotas_snapshot);

  UPDATE public.prestamos SET
    cuotas_pagadas = (v_prestamo_tras->>'cuotas_pagadas')::INTEGER,
    saldo_capital = v_nuevo_saldo,
    valor_cuota = (v_prestamo_tras->>'valor_cuota')::NUMERIC,
    estado = (v_prestamo_tras->>'estado')::estado_prestamo,
    deuda_total = (v_prestamo_tras->>'deuda_total')::NUMERIC,
    saldo_interes = (v_prestamo_tras->>'saldo_interes')::NUMERIC
  WHERE id = p_prestamo_id
  RETURNING * INTO v_prestamo;

  BEGIN
    UPDATE public.prestamos SET
      fecha_credito = fecha_inicio,
      frecuencia_pago = frecuencia::TEXT,
      porcentaje_interes = tasa_interes,
      cuota_deseada = valor_cuota
    WHERE id = p_prestamo_id;
  EXCEPTION
    WHEN undefined_column OR datatype_mismatch THEN
      NULL;
  END;

  SELECT * INTO v_prestamo FROM public.prestamos WHERE id = p_prestamo_id;

  SELECT COALESCE(jsonb_agg(public.plan_cuota_to_jsonb(pc) ORDER BY pc.numero_cuota), '[]'::JSONB)
  INTO v_cuotas_snapshot
  FROM public.plan_cuotas pc
  WHERE pc.prestamo_id = p_prestamo_id;

  RETURN public.registrar_abono_build_response(
    false,
    v_abono,
    v_prestamo,
    v_cuotas_snapshot,
    jsonb_build_object(
      'monto_aplicado', p_monto_abonado,
      'monto_interes_aplicado', 0,
      'monto_capital_aplicado', p_monto_abonado,
      'monto_no_aplicado', 0
    )
  );
END;
$$;

-- ── Cálculos de préstamo (port calculations.ts) ──────────────

CREATE OR REPLACE FUNCTION public.saldo_cuota_plan_sql(
  p_monto_cuota NUMERIC,
  p_monto_pagado NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0, COALESCE(p_monto_cuota, 0) - COALESCE(p_monto_pagado, 0));
$$;

CREATE OR REPLACE FUNCTION public.interes_pendiente_cuota_sql(
  p_monto_cuota NUMERIC,
  p_monto_pagado NUMERIC,
  p_interes_cuota NUMERIC,
  p_tipo_cuota TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF COALESCE(p_interes_cuota, 0) > 0 THEN
    RETURN GREATEST(
      0,
      p_interes_cuota - LEAST(COALESCE(p_monto_pagado, 0), p_interes_cuota)
    );
  END IF;
  IF p_tipo_cuota = 'interes' THEN
    RETURN public.saldo_cuota_plan_sql(p_monto_cuota, p_monto_pagado);
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.contar_cuotas_pagadas_sql(p_cuotas JSONB)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM jsonb_to_recordset(COALESCE(p_cuotas, '[]'::JSONB)) AS c(estado TEXT)
  WHERE c.estado = 'pagada';
$$;

CREATE OR REPLACE FUNCTION public.total_intereses_pendientes_sql(p_cuotas JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_sum NUMERIC := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_cuotas, '[]'::JSONB)) AS c(
      monto_cuota NUMERIC,
      monto_pagado NUMERIC,
      interes_cuota NUMERIC,
      tipo_cuota TEXT,
      estado TEXT
    )
  LOOP
    IF r.estado <> 'pagada' THEN
      v_sum := v_sum + public.interes_pendiente_cuota_sql(
        r.monto_cuota, r.monto_pagado, r.interes_cuota, r.tipo_cuota
      );
    END IF;
  END LOOP;
  RETURN v_sum;
END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_saldo_pendiente_sql(
  p_tipo_prestamo TEXT,
  p_estado TEXT,
  p_saldo_capital NUMERIC,
  p_cuotas JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_sum NUMERIC := 0;
  r RECORD;
BEGIN
  IF p_estado = 'pagado' THEN
    RETURN 0;
  END IF;

  IF p_tipo_prestamo = 'solo_interes' THEN
    FOR r IN
      SELECT *
      FROM jsonb_to_recordset(COALESCE(p_cuotas, '[]'::JSONB)) AS c(
        monto_cuota NUMERIC,
        monto_pagado NUMERIC,
        tipo_cuota TEXT,
        estado TEXT
      )
    LOOP
      IF r.tipo_cuota = 'interes' AND r.estado <> 'pagada' THEN
        v_sum := v_sum + public.saldo_cuota_plan_sql(r.monto_cuota, r.monto_pagado);
      END IF;
    END LOOP;
    RETURN COALESCE(p_saldo_capital, 0) + v_sum;
  END IF;

  FOR r IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_cuotas, '[]'::JSONB)) AS c(
      monto_cuota NUMERIC,
      monto_pagado NUMERIC,
      estado TEXT
    )
  LOOP
    IF r.estado <> 'pagada' THEN
      v_sum := v_sum + public.saldo_cuota_plan_sql(r.monto_cuota, r.monto_pagado);
    END IF;
  END LOOP;
  RETURN v_sum;
END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_mora_sql(p_cuotas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_fecha DATE;
  v_dias INTEGER;
BEGIN
  SELECT c.fecha_vencimiento INTO v_fecha
  FROM jsonb_to_recordset(COALESCE(p_cuotas, '[]'::JSONB)) AS c(
    fecha_vencimiento DATE,
    estado TEXT
  )
  WHERE c.estado <> 'pagada'
  ORDER BY c.fecha_vencimiento ASC
  LIMIT 1;

  IF v_fecha IS NULL THEN
    RETURN 0;
  END IF;

  v_dias := (CURRENT_DATE - v_fecha);
  IF v_dias > 0 THEN
    RETURN v_dias;
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.determinar_estado_sql(
  p_tipo_prestamo TEXT,
  p_saldo_capital NUMERIC,
  p_cuotas JSONB,
  p_dias_atraso INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total INTEGER;
  v_pagadas INTEGER;
BEGIN
  IF p_tipo_prestamo = 'solo_interes' THEN
    IF COALESCE(p_saldo_capital, 0) <= 0 THEN
      RETURN 'pagado';
    END IF;
  ELSE
    SELECT COUNT(*)::INTEGER,
           COUNT(*) FILTER (WHERE c.estado = 'pagada')::INTEGER
    INTO v_total, v_pagadas
    FROM jsonb_to_recordset(COALESCE(p_cuotas, '[]'::JSONB)) AS c(estado TEXT);

    IF v_total > 0 AND v_pagadas = v_total THEN
      RETURN 'pagado';
    END IF;
  END IF;

  IF COALESCE(p_dias_atraso, 0) > 0 THEN
    RETURN 'atrasado';
  END IF;
  RETURN 'pendiente';
END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_prestamo_tras_abono_sql(
  p_prestamo JSONB,
  p_cuotas JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cuotas_pagadas INTEGER;
  v_dias_atraso INTEGER;
  v_estado TEXT;
  v_deuda NUMERIC;
  v_saldo_interes NUMERIC;
  v_saldo_capital NUMERIC;
  v_valor_cuota NUMERIC;
BEGIN
  v_cuotas_pagadas := public.contar_cuotas_pagadas_sql(p_cuotas);
  v_dias_atraso := public.calcular_mora_sql(p_cuotas);
  v_saldo_capital := COALESCE((p_prestamo->>'saldo_capital')::NUMERIC, 0);
  v_valor_cuota := COALESCE((p_prestamo->>'valor_cuota')::NUMERIC, 0);

  v_estado := public.determinar_estado_sql(
    p_prestamo->>'tipo_prestamo',
    v_saldo_capital,
    p_cuotas,
    v_dias_atraso
  );

  v_deuda := public.calcular_saldo_pendiente_sql(
    p_prestamo->>'tipo_prestamo',
    p_prestamo->>'estado',
    v_saldo_capital,
    p_cuotas
  );

  v_saldo_interes := public.total_intereses_pendientes_sql(p_cuotas);

  RETURN jsonb_build_object(
    'cuotas_pagadas', v_cuotas_pagadas,
    'saldo_capital', v_saldo_capital,
    'valor_cuota', v_valor_cuota,
    'estado', v_estado,
    'deuda_total', v_deuda,
    'saldo_interes', v_saldo_interes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hay_cuotas_aplicables_sql(p_cuotas JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  r RECORD;
  v_pend RECORD;
BEGIN
  FOR r IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_cuotas, '[]'::JSONB)) AS c(
      monto_cuota NUMERIC,
      monto_pagado NUMERIC,
      monto_pagado_interes NUMERIC,
      monto_pagado_capital NUMERIC,
      interes_cuota NUMERIC,
      capital_cuota NUMERIC,
      tipo_cuota TEXT,
      estado TEXT
    )
  LOOP
    IF r.estado = 'pagada' THEN
      CONTINUE;
    END IF;
    SELECT * INTO v_pend
    FROM public.calcular_pendientes_cuota_row(
      r.monto_cuota, r.monto_pagado, r.monto_pagado_interes, r.monto_pagado_capital,
      r.interes_cuota, r.capital_cuota, r.tipo_cuota
    );
    IF v_pend.saldo_cuota > 0 THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- ── Motor de distribución ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.distribuir_abono_sql(
  p_prestamo JSONB,
  p_cuotas JSONB,
  p_monto NUMERIC,
  p_aplicacion TEXT,
  p_plan_cuota_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_restante NUMERIC;
  v_monto_a_interes NUMERIC := 0;
  v_monto_a_capital NUMERIC := 0;
  v_cuota_afectada UUID;
  v_detalle JSONB := '[]'::JSONB;
  v_cuotas_out JSONB;
  r RECORD;
  v_comp RECORD;
  v_pend RECORD;
  v_pagado RECORD;
  v_monto_interes NUMERIC;
  v_monto_capital NUMERIC;
  v_monto_aplicado_cuota NUMERIC;
  v_nuevo_int NUMERIC;
  v_nuevo_cap NUMERIC;
  v_nuevo_pagado NUMERIC;
  v_estado_antes TEXT;
  v_estado_despues TEXT;
  v_int_antes NUMERIC;
  v_cap_antes NUMERIC;
  v_int_despues NUMERIC;
  v_cap_despues NUMERIC;
BEGIN
  IF p_monto < 0 THEN
    RETURN jsonb_build_object(
      'valido', false,
      'errores', jsonb_build_array('El monto no puede ser negativo')
    );
  END IF;

  IF p_monto = 0 THEN
    RETURN jsonb_build_object(
      'valido', false,
      'errores', jsonb_build_array('El monto debe ser mayor a cero')
    );
  END IF;

  IF (p_prestamo->>'estado') = 'pagado' THEN
    RETURN jsonb_build_object(
      'valido', false,
      'errores', jsonb_build_array('El préstamo ya está pagado')
    );
  END IF;

  IF p_plan_cuota_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_cuotas, '[]'::JSONB)) AS c(id UUID)
      WHERE c.id = p_plan_cuota_id
    ) THEN
      RETURN jsonb_build_object(
        'valido', false,
        'errores', jsonb_build_array('La cuota indicada no existe en el plan')
      );
    END IF;
  END IF;

  DROP TABLE IF EXISTS tmp_distribuir_cuotas;
  CREATE TEMP TABLE tmp_distribuir_cuotas ON COMMIT DROP AS
  SELECT
    c.id,
    c.prestamo_id,
    c.numero_cuota,
    c.monto_cuota,
    COALESCE(c.interes_cuota, 0) AS interes_cuota,
    COALESCE(c.capital_cuota, 0) AS capital_cuota,
    c.fecha_vencimiento,
    COALESCE(c.monto_pagado, 0) AS monto_pagado,
    COALESCE(c.monto_pagado_interes, 0) AS monto_pagado_interes,
    COALESCE(c.monto_pagado_capital, 0) AS monto_pagado_capital,
    c.estado,
    c.tipo_cuota
  FROM jsonb_to_recordset(COALESCE(p_cuotas, '[]'::JSONB)) AS c(
    id UUID,
    prestamo_id UUID,
    numero_cuota INTEGER,
    monto_cuota NUMERIC,
    interes_cuota NUMERIC,
    capital_cuota NUMERIC,
    fecha_vencimiento DATE,
    monto_pagado NUMERIC,
    monto_pagado_interes NUMERIC,
    monto_pagado_capital NUMERIC,
    estado TEXT,
    tipo_cuota TEXT
  );

  v_restante := p_monto;

  FOR r IN
    SELECT *
    FROM tmp_distribuir_cuotas t
    WHERE t.estado <> 'pagada'
    ORDER BY
      CASE WHEN p_plan_cuota_id IS NOT NULL AND t.id = p_plan_cuota_id THEN 0 ELSE 1 END,
      t.fecha_vencimiento ASC
  LOOP
    EXIT WHEN v_restante <= 0;

    SELECT * INTO v_comp
    FROM public.resolver_componentes_cuota(
      r.monto_cuota, r.interes_cuota, r.capital_cuota, r.tipo_cuota
    );

    SELECT * INTO v_pend
    FROM public.calcular_pendientes_cuota_row(
      r.monto_cuota, r.monto_pagado, r.monto_pagado_interes, r.monto_pagado_capital,
      r.interes_cuota, r.capital_cuota, r.tipo_cuota
    );

    IF v_pend.saldo_cuota <= 0 THEN
      CONTINUE;
    END IF;

    v_int_antes := v_pend.interes_pendiente;
    v_cap_antes := v_pend.capital_pendiente;
    v_estado_antes := r.estado;

    v_monto_interes := 0;
    v_monto_capital := 0;

    IF p_aplicacion = 'solo_interes' THEN
      v_monto_interes := LEAST(v_restante, v_pend.interes_pendiente);
    ELSIF p_aplicacion = 'solo_capital' THEN
      v_monto_capital := LEAST(v_restante, v_pend.capital_pendiente);
    ELSE
      v_monto_interes := LEAST(v_restante, v_pend.interes_pendiente);
      v_monto_capital := LEAST(v_restante - v_monto_interes, v_pend.capital_pendiente);
    END IF;

    v_monto_aplicado_cuota := v_monto_interes + v_monto_capital;
    IF v_monto_aplicado_cuota <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_pagado
    FROM public.obtener_pagado_desglosado(
      r.monto_pagado, r.monto_pagado_interes, r.monto_pagado_capital,
      v_comp.interes_total, v_comp.capital_total
    );

    v_nuevo_int := v_pagado.pagado_interes + v_monto_interes;
    v_nuevo_cap := v_pagado.pagado_capital + v_monto_capital;
    v_nuevo_pagado := v_nuevo_int + v_nuevo_cap;
    v_estado_despues := public.actualizar_estado_cuota_row(r.monto_cuota, v_nuevo_pagado);

    UPDATE tmp_distribuir_cuotas SET
      monto_pagado = v_nuevo_pagado,
      monto_pagado_interes = v_nuevo_int,
      monto_pagado_capital = v_nuevo_cap,
      estado = v_estado_despues
    WHERE id = r.id;

    v_restante := v_restante - v_monto_aplicado_cuota;
    v_monto_a_interes := v_monto_a_interes + v_monto_interes;
    v_monto_a_capital := v_monto_a_capital + v_monto_capital;

    IF v_cuota_afectada IS NULL THEN
      v_cuota_afectada := r.id;
    END IF;

    SELECT * INTO v_pend
    FROM public.calcular_pendientes_cuota_row(
      r.monto_cuota, v_nuevo_pagado, v_nuevo_int, v_nuevo_cap,
      r.interes_cuota, r.capital_cuota, r.tipo_cuota
    );
    v_int_despues := v_pend.interes_pendiente;
    v_cap_despues := v_pend.capital_pendiente;

    v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
      'cuota_id', r.id,
      'numero_cuota', r.numero_cuota,
      'monto_interes', v_monto_interes,
      'monto_capital', v_monto_capital,
      'monto_total', v_monto_aplicado_cuota,
      'modo_desglose', v_comp.modo
    ));
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.numero_cuota), '[]'::JSONB)
  INTO v_cuotas_out
  FROM tmp_distribuir_cuotas t;

  RETURN jsonb_build_object(
    'valido', true,
    'errores', '[]'::JSONB,
    'plan_cuotas', v_cuotas_out,
    'monto_recibido', p_monto,
    'monto_aplicado', v_monto_a_interes + v_monto_a_capital,
    'monto_a_interes', v_monto_a_interes,
    'monto_a_capital', v_monto_a_capital,
    'monto_no_aplicado', v_restante,
    'detalle', v_detalle,
    'cuota_afectada_id', v_cuota_afectada,
    'tipo_abono', public.map_aplicacion_to_tipo_abono(p_aplicacion),
    'aplicacion_abono', p_aplicacion
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_resultado_distribucion_sql(
  p_resultado JSONB,
  p_monto_recibido NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_aplicado NUMERIC;
  v_no_aplicado NUMERIC;
  v_a_interes NUMERIC;
  v_a_capital NUMERIC;
BEGIN
  IF NOT COALESCE((p_resultado->>'valido')::BOOLEAN, false) THEN
    PERFORM public.rae_raise(
      'RAE012',
      COALESCE(
        p_resultado->'errores'->>0,
        'No se pudo distribuir el abono'
      )
    );
  END IF;

  v_aplicado := COALESCE((p_resultado->>'monto_aplicado')::NUMERIC, 0);
  v_no_aplicado := COALESCE((p_resultado->>'monto_no_aplicado')::NUMERIC, 0);
  v_a_interes := COALESCE((p_resultado->>'monto_a_interes')::NUMERIC, 0);
  v_a_capital := COALESCE((p_resultado->>'monto_a_capital')::NUMERIC, 0);

  IF v_aplicado <= 0 THEN
    PERFORM public.rae_raise(
      'RAE013',
      'Ningún monto pudo aplicarse a las cuotas con la modalidad seleccionada'
    );
  END IF;

  IF v_no_aplicado > 0 THEN
    PERFORM public.rae_raise(
      'RAE014',
      'El monto supera la deuda aplicable por $' || v_no_aplicado::TEXT
    );
  END IF;

  IF v_a_interes + v_a_capital <> v_aplicado THEN
    PERFORM public.rae_raise('RAE015', 'Inconsistencia interna en la distribución del abono');
  END IF;

  IF v_aplicado + v_no_aplicado <> p_monto_recibido THEN
    PERFORM public.rae_raise('RAE016', 'Inconsistencia interna entre monto recibido y aplicado');
  END IF;
END;
$$;

-- ── JSON builders ───────────────────────────────────────────

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

CREATE OR REPLACE FUNCTION public.abono_to_jsonb(p_row abonos)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN jsonb_build_object(
    'id', p_row.id,
    'prestamo_id', p_row.prestamo_id,
    'monto_abonado', p_row.monto_abonado,
    'fecha_abono', p_row.fecha_abono,
    'notas', p_row.notas,
    'tipo_abono', p_row.tipo_abono::TEXT,
    'plan_cuota_id', p_row.plan_cuota_id,
    'metodo_pago', COALESCE(p_row.metodo_pago, ''),
    'aplicacion_abono', COALESCE(p_row.aplicacion_abono, 'interes_y_capital'),
    'monto_interes_aplicado', COALESCE(p_row.monto_interes_aplicado, 0),
    'monto_capital_aplicado', COALESCE(p_row.monto_capital_aplicado, 0),
    'idempotency_key', p_row.idempotency_key,
    'created_at', p_row.created_at
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

CREATE OR REPLACE FUNCTION public.registrar_abono_build_response(
  p_idempotent_replay BOOLEAN,
  p_abono abonos,
  p_prestamo prestamos,
  p_plan JSONB,
  p_desglose JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'idempotent_replay', p_idempotent_replay,
    'abono', public.abono_to_jsonb(p_abono),
    'prestamo', jsonb_build_object(
      'id', p_prestamo.id,
      'cuotas_pagadas', p_prestamo.cuotas_pagadas,
      'saldo_capital', p_prestamo.saldo_capital,
      'valor_cuota', p_prestamo.valor_cuota,
      'estado', p_prestamo.estado::TEXT,
      'deuda_total', COALESCE(
        (SELECT deuda_total FROM public.prestamos WHERE id = p_prestamo.id),
        0
      ),
      'saldo_interes', COALESCE(
        (SELECT saldo_interes FROM public.prestamos WHERE id = p_prestamo.id),
        0
      )
    ),
    'plan_cuotas', p_plan,
    'desglose', p_desglose
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_abono_fetch_replay(p_key UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_abono public.abonos%ROWTYPE;
  v_prestamo public.prestamos%ROWTYPE;
  v_plan JSONB;
BEGIN
  SELECT * INTO v_abono
  FROM public.abonos
  WHERE idempotency_key = p_key;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_prestamo
  FROM public.prestamos
  WHERE id = v_abono.prestamo_id;

  SELECT COALESCE(jsonb_agg(public.plan_cuota_to_jsonb(pc) ORDER BY pc.numero_cuota), '[]'::JSONB)
  INTO v_plan
  FROM public.plan_cuotas pc
  WHERE pc.prestamo_id = v_abono.prestamo_id;

  RETURN public.registrar_abono_build_response(
    true,
    v_abono,
    v_prestamo,
    v_plan,
    jsonb_build_object(
      'monto_aplicado', v_abono.monto_abonado,
      'monto_interes_aplicado', COALESCE(v_abono.monto_interes_aplicado, 0),
      'monto_capital_aplicado', COALESCE(v_abono.monto_capital_aplicado, 0),
      'monto_no_aplicado', 0
    )
  );
END;
$$;

-- ── RPC principal ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_abono(
  p_prestamo_id UUID,
  p_monto_abonado NUMERIC,
  p_fecha_abono DATE,
  p_notas TEXT DEFAULT '',
  p_tipo_abono TEXT DEFAULT NULL,
  p_aplicacion_abono TEXT DEFAULT 'interes_y_capital',
  p_plan_cuota_id UUID DEFAULT NULL,
  p_metodo_pago TEXT DEFAULT '',
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prestamo public.prestamos%ROWTYPE;
  v_aplicacion TEXT;
  v_cuotas_snapshot JSONB;
  v_cuotas_updated JSONB;
  v_prestamo_json JSONB;
  v_distribucion JSONB;
  v_prestamo_tras JSONB;
  v_abono public.abonos%ROWTYPE;
  v_replay JSONB;
  v_detalle_item JSONB;
  v_cuota_id UUID;
  v_constraint TEXT;
BEGIN
  -- Capa A: validación entrada
  IF p_monto_abonado IS NULL OR p_monto_abonado <= 0 THEN
    PERFORM public.rae_raise('RAE001', 'El monto debe ser mayor a cero');
  END IF;

  IF p_fecha_abono IS NULL THEN
    PERFORM public.rae_raise('RAE003', 'La fecha del abono es inválida');
  END IF;

  v_aplicacion := public.resolver_aplicacion_abono_sql(p_tipo_abono, p_aplicacion_abono);

  IF v_aplicacion NOT IN ('interes_y_capital', 'solo_interes', 'solo_capital') THEN
    PERFORM public.rae_raise('RAE004', 'La aplicación del abono no es válida');
  END IF;

  IF p_tipo_abono IS NOT NULL AND p_tipo_abono NOT IN ('cuota', 'interes', 'capital') THEN
    PERFORM public.rae_raise('RAE005', 'El tipo de abono no es válido');
  END IF;

  -- Idempotencia fast-path
  IF p_idempotency_key IS NOT NULL THEN
    v_replay := public.registrar_abono_fetch_replay(p_idempotency_key);
    IF v_replay IS NOT NULL THEN
      RETURN v_replay;
    END IF;
  END IF;

  -- Lock préstamo
  SELECT * INTO v_prestamo
  FROM public.prestamos
  WHERE id = p_prestamo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.rae_raise('RAE006', 'El préstamo no existe');
  END IF;

  IF v_prestamo.estado = 'pagado' THEN
    PERFORM public.rae_raise('RAE007', 'El préstamo ya está pagado');
  END IF;

  -- Lock cuotas + snapshot único
  PERFORM id
  FROM public.plan_cuotas
  WHERE prestamo_id = p_prestamo_id
  ORDER BY numero_cuota
  FOR UPDATE;

  SELECT COALESCE(jsonb_agg(public.plan_cuota_to_jsonb(pc) ORDER BY pc.numero_cuota), '[]'::JSONB)
  INTO v_cuotas_snapshot
  FROM public.plan_cuotas pc
  WHERE pc.prestamo_id = p_prestamo_id;

  IF jsonb_array_length(v_cuotas_snapshot) = 0 THEN
    PERFORM public.rae_raise('RAE008', 'El préstamo no tiene cuotas en el plan de pagos');
  END IF;

  -- Re-check idempotencia post-lock
  IF p_idempotency_key IS NOT NULL THEN
    v_replay := public.registrar_abono_fetch_replay(p_idempotency_key);
    IF v_replay IS NOT NULL THEN
      RETURN v_replay;
    END IF;
  END IF;

  IF p_plan_cuota_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(v_cuotas_snapshot) AS c(id UUID)
      WHERE c.id = p_plan_cuota_id
    ) THEN
      PERFORM public.rae_raise('RAE009', 'La cuota indicada no pertenece a este préstamo');
    END IF;
  END IF;

  -- Abono a capital del préstamo (solo_interes: capital no vive en cuotas)
  IF v_aplicacion = 'solo_capital'
     AND public.total_capital_pendiente_cuotas_sql(v_cuotas_snapshot) <= 0
     AND COALESCE(v_prestamo.saldo_capital, 0) > 0 THEN
    RETURN public.registrar_abono_capital_prestamo_sql(
      p_prestamo_id,
      p_monto_abonado,
      p_fecha_abono,
      p_notas,
      p_metodo_pago,
      p_idempotency_key,
      v_prestamo
    );
  END IF;

  IF NOT public.hay_cuotas_aplicables_sql(v_cuotas_snapshot) THEN
    PERFORM public.rae_raise('RAE011', 'No hay cuotas pendientes aplicables');
  END IF;

  v_prestamo_json := public.prestamo_snapshot_to_jsonb(v_prestamo);

  -- Capa B: distribución
  v_distribucion := public.distribuir_abono_sql(
    v_prestamo_json,
    v_cuotas_snapshot,
    p_monto_abonado,
    v_aplicacion,
    p_plan_cuota_id
  );

  PERFORM public.validar_resultado_distribucion_sql(v_distribucion, p_monto_abonado);

  v_cuotas_updated := v_distribucion->'plan_cuotas';

  -- Capa C: persistencia cuotas afectadas
  FOR v_detalle_item IN
    SELECT * FROM jsonb_array_elements(v_distribucion->'detalle')
  LOOP
    v_cuota_id := (v_detalle_item->>'cuota_id')::UUID;

    UPDATE public.plan_cuotas pc SET
      monto_pagado = (c.monto_pagado)::NUMERIC,
      monto_pagado_interes = (c.monto_pagado_interes)::NUMERIC,
      monto_pagado_capital = (c.monto_pagado_capital)::NUMERIC,
      estado = (c.estado)::estado_plan_cuota
    FROM jsonb_to_recordset(v_cuotas_updated) AS c(
      id UUID,
      monto_pagado NUMERIC,
      monto_pagado_interes NUMERIC,
      monto_pagado_capital NUMERIC,
      estado TEXT
    )
    WHERE pc.id = v_cuota_id
      AND c.id = v_cuota_id;
  END LOOP;

  -- INSERT abono con manejo idempotencia
  BEGIN
    INSERT INTO public.abonos (
      prestamo_id,
      monto_abonado,
      fecha_abono,
      notas,
      tipo_abono,
      plan_cuota_id,
      metodo_pago,
      aplicacion_abono,
      monto_interes_aplicado,
      monto_capital_aplicado,
      idempotency_key
    ) VALUES (
      p_prestamo_id,
      p_monto_abonado,
      p_fecha_abono,
      COALESCE(p_notas, ''),
      (v_distribucion->>'tipo_abono')::tipo_abono,
      (v_distribucion->>'cuota_afectada_id')::UUID,
      COALESCE(p_metodo_pago, ''),
      v_aplicacion,
      (v_distribucion->>'monto_a_interes')::NUMERIC,
      (v_distribucion->>'monto_a_capital')::NUMERIC,
      p_idempotency_key
    )
    RETURNING * INTO v_abono;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'abonos_idempotency_key_unique' AND p_idempotency_key IS NOT NULL THEN
        v_replay := public.registrar_abono_fetch_replay(p_idempotency_key);
        IF v_replay IS NOT NULL THEN
          RETURN v_replay;
        END IF;
      END IF;
      RAISE;
  END;

  v_prestamo_tras := public.calcular_prestamo_tras_abono_sql(v_prestamo_json, v_cuotas_updated);

  UPDATE public.prestamos SET
    cuotas_pagadas = (v_prestamo_tras->>'cuotas_pagadas')::INTEGER,
    saldo_capital = (v_prestamo_tras->>'saldo_capital')::NUMERIC,
    valor_cuota = (v_prestamo_tras->>'valor_cuota')::NUMERIC,
    estado = (v_prestamo_tras->>'estado')::estado_prestamo,
    deuda_total = (v_prestamo_tras->>'deuda_total')::NUMERIC,
    saldo_interes = (v_prestamo_tras->>'saldo_interes')::NUMERIC
  WHERE id = p_prestamo_id
  RETURNING * INTO v_prestamo;

  -- Mirrors legacy (best-effort; columnas pueden no existir en todos los entornos)
  BEGIN
    UPDATE public.prestamos SET
      fecha_credito = fecha_inicio,
      frecuencia_pago = frecuencia::TEXT,
      porcentaje_interes = tasa_interes,
      cuota_deseada = valor_cuota
    WHERE id = p_prestamo_id;
  EXCEPTION
    WHEN undefined_column OR datatype_mismatch THEN
      NULL;
  END;

  SELECT * INTO v_prestamo FROM public.prestamos WHERE id = p_prestamo_id;

  SELECT COALESCE(jsonb_agg(public.plan_cuota_to_jsonb(pc) ORDER BY pc.numero_cuota), '[]'::JSONB)
  INTO v_cuotas_snapshot
  FROM public.plan_cuotas pc
  WHERE pc.prestamo_id = p_prestamo_id;

  RETURN public.registrar_abono_build_response(
    false,
    v_abono,
    v_prestamo,
    v_cuotas_snapshot,
    jsonb_build_object(
      'monto_aplicado', (v_distribucion->>'monto_aplicado')::NUMERIC,
      'monto_interes_aplicado', (v_distribucion->>'monto_a_interes')::NUMERIC,
      'monto_capital_aplicado', (v_distribucion->>'monto_a_capital')::NUMERIC,
      'monto_no_aplicado', 0
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_abono(
  UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID, TEXT, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.registrar_abono(
  UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID, TEXT, UUID
) TO anon, authenticated;
