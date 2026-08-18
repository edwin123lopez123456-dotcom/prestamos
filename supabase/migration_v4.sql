-- Migración v4: CobrApp — tipo de interés, notas, desactivar clientes, abonos avanzados

DO $$ BEGIN
  CREATE TYPE tipo_interes AS ENUM ('capital_inicial', 'cada_cuota', 'compuesto_bancario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS tipo_interes tipo_interes;
ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS nota TEXT DEFAULT '';

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

ALTER TABLE abonos ADD COLUMN IF NOT EXISTS metodo_pago TEXT DEFAULT '';
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS aplicacion_abono TEXT DEFAULT 'interes_y_capital';

DO $$ BEGIN
  ALTER TYPE estado_plan_cuota ADD VALUE IF NOT EXISTS 'anulada';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
