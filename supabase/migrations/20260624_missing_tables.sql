-- =============================================================================
-- MIGRACIÓN: Tablas faltantes — financial_actas, financial_acta_details, site_incidents
-- Archivo: supabase/migrations/20260624_missing_tables.sql
-- Origen:  src/db/migrations/03_create_actas_tables.sql
--          src/db/migrations/01_create_site_incidents.sql
--          src/db/migrations/02_add_solution_to_incidents.sql
--
-- PREREQUISITO: 20240316_consolidated_schema.sql debe estar aplicado.
--   Depende de: public.boards, public.board_members, get_user_board_role()
--
-- IDEMPOTENTE: puede ejecutarse múltiples veces sin error.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FUNCIÓN GENÉRICA PARA updated_at
--    Ninguna migración en supabase/migrations/ la define.
--    CREATE OR REPLACE garantiza idempotencia.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLA: financial_actas
--    Cabecera de cada acta de cobro de avance de obra.
--    board_id es UUID con FK a boards(id): usa get_user_board_role() directamente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.financial_actas (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     UUID        NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  period_start DATE,
  period_end   DATE,
  status       TEXT        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'approved', 'paid')),
  observations TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
-- Patrón: igual a dashboards (sub-tabla con board_id UUID, sin check de owner_id separado).
-- Roles válidos en board_members: 'admin', 'member', 'viewer'. No existe rol 'owner'.
-- El propietario del board debe estar en board_members con rol 'admin' para tener acceso.

ALTER TABLE public.financial_actas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view actas"   ON public.financial_actas;
CREATE POLICY        "Members can view actas"   ON public.financial_actas
  FOR SELECT USING (
    get_user_board_role(board_id, auth.uid()) IS NOT NULL
  );

DROP POLICY IF EXISTS "Members can create actas"  ON public.financial_actas;
CREATE POLICY        "Members can create actas"  ON public.financial_actas
  FOR INSERT WITH CHECK (
    get_user_board_role(board_id, auth.uid()) IS NOT NULL
  );

-- UPDATE y DELETE restringidos a admins: las actas son documentos financieros sensibles.
DROP POLICY IF EXISTS "Admins can update actas"   ON public.financial_actas;
CREATE POLICY        "Admins can update actas"   ON public.financial_actas
  FOR UPDATE USING (
    get_user_board_role(board_id, auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "Admins can delete actas"   ON public.financial_actas;
CREATE POLICY        "Admins can delete actas"   ON public.financial_actas
  FOR DELETE USING (
    get_user_board_role(board_id, auth.uid()) = 'admin'
  );

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_at_financial_actas ON public.financial_actas;
CREATE TRIGGER set_updated_at_financial_actas
  BEFORE UPDATE ON public.financial_actas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_financial_actas_board_id
  ON public.financial_actas(board_id);

CREATE INDEX IF NOT EXISTS idx_financial_actas_board_date
  ON public.financial_actas(board_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_financial_actas_status
  ON public.financial_actas(status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABLA: financial_acta_details
--    Líneas de detalle de cada acta: un registro por (acta, ítem, sitio).
--
--    CRÍTICO: previous_qty y previous_value NO estaban en la migración original
--    pero useActas.ts los selecciona en todas las queries. Se añaden aquí y
--    también con ADD COLUMN IF NOT EXISTS como salvaguarda para ambientes donde
--    la tabla ya existiera sin esas columnas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.financial_acta_details (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_id        UUID    NOT NULL REFERENCES public.financial_actas(id) ON DELETE CASCADE,
  item_id        TEXT    NOT NULL,   -- ID del ítem presupuestal (TEXT por compatibilidad JSON)
  group_id       TEXT    NOT NULL,   -- ID del sitio/grupo  (TEXT por compatibilidad JSON)
  quantity       NUMERIC NOT NULL DEFAULT 0,
  value          NUMERIC NOT NULL DEFAULT 0,
  percentage     NUMERIC          DEFAULT 0,
  previous_qty   NUMERIC          DEFAULT NULL,  -- override manual "Actas Anteriores qty"
  previous_value NUMERIC          DEFAULT NULL,  -- override manual "Actas Anteriores value"
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (acta_id, item_id, group_id)   -- requerido por upsert({ onConflict: 'acta_id, item_id, group_id' })
);

-- Salvaguarda: si la tabla ya existía (creada desde src/db/migrations/) sin estas columnas,
-- ADD COLUMN IF NOT EXISTS las añade sin error y sin afectar datos existentes.
ALTER TABLE public.financial_acta_details
  ADD COLUMN IF NOT EXISTS previous_qty   NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS previous_value NUMERIC DEFAULT NULL;

-- RLS
-- La tabla no tiene board_id propio: los permisos se heredan a través de financial_actas.
-- Patrón: igual a attachments (join a través de la FK para llegar al board).

ALTER TABLE public.financial_acta_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view acta details"   ON public.financial_acta_details;
CREATE POLICY        "Members can view acta details"   ON public.financial_acta_details
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.financial_actas fa
      WHERE fa.id = acta_id
        AND get_user_board_role(fa.board_id, auth.uid()) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Members can insert acta details"  ON public.financial_acta_details;
CREATE POLICY        "Members can insert acta details"  ON public.financial_acta_details
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.financial_actas fa
      WHERE fa.id = acta_id
        AND get_user_board_role(fa.board_id, auth.uid()) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Members can update acta details"  ON public.financial_acta_details;
CREATE POLICY        "Members can update acta details"  ON public.financial_acta_details
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.financial_actas fa
      WHERE fa.id = acta_id
        AND get_user_board_role(fa.board_id, auth.uid()) IS NOT NULL
    )
  );

-- DELETE solo para admins: protege la integridad del historial financiero.
DROP POLICY IF EXISTS "Admins can delete acta details"  ON public.financial_acta_details;
CREATE POLICY        "Admins can delete acta details"  ON public.financial_acta_details
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.financial_actas fa
      WHERE fa.id = acta_id
        AND get_user_board_role(fa.board_id, auth.uid()) = 'admin'
    )
  );

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_at_financial_acta_details ON public.financial_acta_details;
CREATE TRIGGER set_updated_at_financial_acta_details
  BEFORE UPDATE ON public.financial_acta_details
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_financial_acta_details_acta_id
  ON public.financial_acta_details(acta_id);

CREATE INDEX IF NOT EXISTS idx_financial_acta_details_identifiers
  ON public.financial_acta_details(acta_id, item_id, group_id);

CREATE INDEX IF NOT EXISTS idx_financial_acta_details_group_id
  ON public.financial_acta_details(group_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABLA: site_incidents
--    Registro de novedades de campo: incidentes, problemas HSE, alertas.
--
--    NOTA sobre board_id TEXT:
--    El campo es TEXT (no UUID con FK) para compatibilidad con el sistema offline.
--    La cola de mutaciones de IndexedDB maneja IDs como strings. Un FK UUID
--    rompería la sincronización diferida cuando el ID aún no existe en Supabase.
--
--    NOTA sobre RLS con board_id TEXT:
--    NO se usa board_id::UUID en las políticas. Un cast TEXT→UUID falla con error
--    si el valor no es UUID válido, bloqueando toda la query (no retorna vacío).
--    En su lugar se hace JOIN a public.boards usando b.id::TEXT = board_id,
--    convirtiendo UUID→TEXT (cast que nunca falla). Esto es semánticamente
--    equivalente y resistente a cualquier valor inesperado en board_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_incidents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', NOW()),
  board_id    TEXT        NOT NULL,   -- TEXT intencional: ver nota sobre RLS arriba
  group_id    TEXT        NOT NULL,   -- TEXT intencional: mismo motivo
  user_id     UUID        NOT NULL REFERENCES auth.users(id),
  type        TEXT        NOT NULL DEFAULT 'General',
  severity    TEXT        NOT NULL DEFAULT 'Low'
                          CHECK (severity IN ('Low', 'Medium', 'Critical')),
  description TEXT        NOT NULL,
  photos      TEXT[]               DEFAULT ARRAY[]::TEXT[],
  status      TEXT                 DEFAULT 'Open',
  solution    TEXT                                           -- añadida por 02_add_solution_to_incidents.sql
);

-- Salvaguarda: si la tabla ya existía sin la columna solution.
ALTER TABLE public.site_incidents
  ADD COLUMN IF NOT EXISTS solution TEXT;

-- RLS
-- Las políticas antiguas ('Enable read access for all authenticated users', etc.)
-- eran demasiado permisivas: cualquier usuario autenticado veía todos los incidentes
-- de todos los proyectos. Las nuevas políticas restringen por membresía de board.
--
-- Estrategia de JOIN: b.id::TEXT = board_id  (UUID→TEXT, siempre seguro)
-- get_user_board_role(b.id, auth.uid())      (b.id ya es UUID, sin cast)

ALTER TABLE public.site_incidents ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas antiguas permisivas antes de crear las nuevas.
DROP POLICY IF EXISTS "Enable read access for all authenticated users"    ON public.site_incidents;
DROP POLICY IF EXISTS "Enable insert access for all authenticated users"  ON public.site_incidents;
DROP POLICY IF EXISTS "Enable update for users based on user_id"          ON public.site_incidents;

DROP POLICY IF EXISTS "Board members can view incidents"    ON public.site_incidents;
CREATE POLICY        "Board members can view incidents"    ON public.site_incidents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id::TEXT = site_incidents.board_id
        AND get_user_board_role(b.id, auth.uid()) IS NOT NULL
    )
  );

-- INSERT: el usuario debe ser miembro del board Y registrar con su propio user_id.
-- Evita que alguien inserte incidentes en nombre de otro usuario.
DROP POLICY IF EXISTS "Board members can report incidents"  ON public.site_incidents;
CREATE POLICY        "Board members can report incidents"  ON public.site_incidents
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id::TEXT = site_incidents.board_id
        AND get_user_board_role(b.id, auth.uid()) IS NOT NULL
    )
  );

-- UPDATE: quien creó el incidente puede editarlo (corregir descripción, añadir fotos)
-- O un admin del board puede añadir la solución administrativa.
DROP POLICY IF EXISTS "Creators and admins can update incidents"  ON public.site_incidents;
DROP POLICY IF EXISTS "Owners and admins can update incidents"    ON public.site_incidents;
CREATE POLICY        "Creators and admins can update incidents"  ON public.site_incidents
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id::TEXT = site_incidents.board_id
        AND get_user_board_role(b.id, auth.uid()) = 'admin'
    )
  );

-- DELETE: sin política. Los incidentes son registros de auditoría inmutables.
-- Un supervisor puede añadir 'solution' pero no eliminar el registro.

-- Índices
-- idx_site_incidents_board_id e idx_site_incidents_group_id ya se intentan crear
-- en 20240315_add_indexes.sql de forma condicional. CREATE INDEX IF NOT EXISTS es idempotente.
CREATE INDEX IF NOT EXISTS idx_site_incidents_board_id
  ON public.site_incidents(board_id);

CREATE INDEX IF NOT EXISTS idx_site_incidents_group_id
  ON public.site_incidents(group_id);

CREATE INDEX IF NOT EXISTS idx_site_incidents_user_id
  ON public.site_incidents(user_id);

CREATE INDEX IF NOT EXISTS idx_site_incidents_created_at
  ON public.site_incidents(created_at DESC);

-- Storage bucket para fotos de novedades de campo.
-- Bucket público: las URLs se embeben en reportes ejecutivos PDF.
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access to Evidence"                ON storage.objects;
CREATE POLICY        "Public Access to Evidence"                ON storage.objects
  FOR SELECT
  USING (bucket_id = 'evidence');

DROP POLICY IF EXISTS "Authenticated Users can upload Evidence"  ON storage.objects;
CREATE POLICY        "Authenticated Users can upload Evidence"  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'evidence' AND auth.role() = 'authenticated');


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. REALTIME PUBLICATION
--    Guard condicional: no falla si la publicación no existe o si la tabla
--    ya está publicada. Patrón de 20240318_dashboards_system.sql.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'financial_actas'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_actas;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'financial_acta_details'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_acta_details;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'site_incidents'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.site_incidents;
    END IF;

  END IF;
END;
$$;
