-- ============================================================
-- FIX — Abono "solo capital" en préstamos solo_interes
-- Ejecutar en Supabase SQL Editor
-- Error típico: Ningún monto pudo aplicarse a las cuotas...
-- ============================================================

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

-- Actualizar RPC principal
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

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := public.registrar_abono_fetch_replay(p_idempotency_key);
    IF v_replay IS NOT NULL THEN
      RETURN v_replay;
    END IF;
  END IF;

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

  v_distribucion := public.distribuir_abono_sql(
    v_prestamo_json,
    v_cuotas_snapshot,
    p_monto_abonado,
    v_aplicacion,
    p_plan_cuota_id
  );

  PERFORM public.validar_resultado_distribucion_sql(v_distribucion, p_monto_abonado);

  v_cuotas_updated := v_distribucion->'plan_cuotas';

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

GRANT EXECUTE ON FUNCTION public.registrar_abono(
  UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, UUID, TEXT, UUID
) TO anon, authenticated;
