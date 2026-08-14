# Préstamos E-I

Software de gestión de préstamos para prestamistas independientes.

## Stack

- **Next.js 15** (App Router)
- **React 19** + **TypeScript** (strict)
- **Tailwind CSS 4** + **Shadcn/ui**
- **Supabase** (PostgreSQL) + **Vercel**

## Configuración Supabase

1. Crea `.env.local` en la raíz:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

2. Ejecuta el script SQL en Supabase → **SQL Editor**:

```
supabase/schema.sql
```

3. Inicia la app:

```bash
npm install
npm run dev
```

## Estructura del proyecto

```
src/
├── app/                      # Dashboard, Clientes, Préstamos
├── components/               # UI modular
├── context/
│   └── DataStoreContext.tsx  # Estado global + peticiones Supabase
├── lib/
│   ├── supabase.ts           # Cliente Supabase
│   ├── database.ts           # CRUD (select, insert, update, delete)
│   ├── data-helpers.ts       # Métricas, alertas, gráficos derivados
│   ├── calculations.ts       # Lógica de abonos y mora
│   └── financial-stats.ts    # Intereses y cartera
├── types/index.ts            # Tipos 1:1 con tablas Supabase
supabase/
└── schema.sql                # CREATE TABLE clientes, prestamos, abonos
```

## Tablas Supabase

| Tabla | Campos principales |
|-------|-------------------|
| `clientes` | id, nombre, telefono, descripcion, fecha_registro |
| `prestamos` | id, cliente_id, monto_prestado, frecuencia, valor_cuota, total_cuotas, cuotas_pagadas, estado, fecha_inicio |
| `abonos` | id, prestamo_id, monto_abonado, fecha_abono, notas |

- FK: `prestamos.cliente_id` → `clientes.id` (RESTRICT)
- FK: `abonos.prestamo_id` → `prestamos.id` (CASCADE)

## Despliegue

- **Vercel**: conecta el repo y agrega las mismas variables `NEXT_PUBLIC_*`.
- **Supabase**: plan gratuito compatible con este esquema.
