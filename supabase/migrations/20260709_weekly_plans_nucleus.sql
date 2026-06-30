-- =============================================================================
-- Phase 5 Nucleus: Weekly Plans + Execution Events
--
-- Tablas nuevas:
--   board_roles                     — catálogo de roles (FK, sin CHECK inline)
--   weekly_plans                    — plan semanal por sitio
--   weekly_plan_items               — línea por actividad (snapshot autosuficiente)
--   weekly_plan_item_executions     — eventos de ejecución (fuente de verdad)
--
-- Roles (board_members.role → FK a board_roles):
--   admin | assistant | supervisor | leader | viewer
--   Agregar un rol futuro = INSERT en board_roles, sin tocar DDL.
--
-- Funciones de autorización (STABLE, reutilizadas en RLS):
--   can_manage_weekly_plan(board_id, user_id)  → admin, assistant
--   can_report_execution(board_id, user_id)    → admin, assistant, leader
--   can_verify_execution(board_id, user_id)    → admin, supervisor
--
-- Funciones de transición (SECURITY DEFINER, validan rol + estado):
--   publish_weekly_plan(plan_id)            admin, assistant  | draft → published
--   report_execution(execution_id)          leader, assistant | draft → reported
--   verify_execution(execution_id)          supervisor, admin | reported → verified
--   reject_execution(execution_id, notes)   supervisor, admin | reported → rejected
--   confirm_weekly_plan(plan_id)            assistant, admin  | in_progress → confirmed
--   close_weekly_plan(plan_id)              admin             | confirmed → closed
--
-- Notas de seguridad:
--   - Todas las funciones SECURITY DEFINER incluyen SET search_path para evitar
--     ataques por search_path manipulation (CVE clase CWE-427).
--   - fn_sync_plan_item_totals es SECURITY DEFINER porque necesita actualizar
--     weekly_plan_items (UPDATE RLS requiere can_manage_weekly_plan) cuando el
--     disparador viene de un leader que no satisface esa política.
-- =============================================================================

-- =============================================================================
-- 0. Utilidad: trigger updated_at
--    No requiere SECURITY DEFINER; opera solo sobre NEW dentro de su tabla.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 1. Catálogo de roles
--
--    board_members.role referencia este catálogo mediante FK (ON UPDATE CASCADE).
--    Schema anterior usaba CHECK ('admin','member','viewer') — se elimina.
--    No hay datos de producción; filas 'member' se convierten a 'viewer'.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.board_roles (
  role          TEXT PRIMARY KEY,
  description   TEXT NOT NULL,
  display_order INT  NOT NULL
);

INSERT INTO public.board_roles (role, description, display_order) VALUES
  ('admin',      'Administrador: cierre de planes y configuración general',      1),
  ('assistant',  'Asistente operativo: crea, publica y confirma cronogramas',    2),
  ('supervisor', 'Supervisor técnico: verifica calidad de ejecución en campo',   3),
  ('leader',     'Líder de sitio: reporta actividades ejecutadas',               4),
  ('viewer',     'Observador: solo lectura',                                     5)
ON CONFLICT (role) DO NOTHING;

DO $$ BEGIN
  -- Eliminar constraint de tipo CHECK que limitaba roles anteriores
  ALTER TABLE public.board_members DROP CONSTRAINT IF EXISTS board_members_role_check;
  -- Convertir dato residual del rol deprecado antes de añadir la FK
  UPDATE public.board_members SET role = 'viewer' WHERE role NOT IN (
    SELECT role FROM public.board_roles
  );
  ALTER TABLE public.board_members
    ADD CONSTRAINT board_members_role_fk
    FOREIGN KEY (role) REFERENCES public.board_roles(role) ON UPDATE CASCADE;
END $$;

-- =============================================================================
-- 2. Funciones de autorización centralizadas
--
--    STABLE: el planner puede cachear el resultado dentro de la misma query.
--    Sin SECURITY DEFINER: delegan en get_user_board_role que ya es SECURITY DEFINER.
--    Un solo lugar para actualizar cuando cambie la política de roles.
--    DEBEN definirse antes de cualquier política RLS que las use.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_weekly_plan(p_board_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT get_user_board_role(p_board_id, p_user_id) IN ('admin', 'assistant')
$$;

CREATE OR REPLACE FUNCTION public.can_report_execution(p_board_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT get_user_board_role(p_board_id, p_user_id) IN ('admin', 'assistant', 'leader')
$$;

CREATE OR REPLACE FUNCTION public.can_verify_execution(p_board_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT get_user_board_role(p_board_id, p_user_id) IN ('admin', 'supervisor')
$$;

-- Actualizar política de board_activity_standards (migración anterior usaba lista literal).
-- Va aquí porque depende de can_manage_weekly_plan() definida arriba.
DROP POLICY IF EXISTS "Miembros pueden insertar estándares"     ON public.board_activity_standards;
DROP POLICY IF EXISTS "Asistentes y admins insertan estándares" ON public.board_activity_standards;
CREATE POLICY "Asistentes y admins insertan estándares"
  ON public.board_activity_standards FOR INSERT
  WITH CHECK (public.can_manage_weekly_plan(board_id, auth.uid()));

-- =============================================================================
-- 3. weekly_plans
--
-- Estados:
--   draft        → asistente edita el cronograma
--   published    → entregado a líderes; bloquea edición de items
--   in_progress  → primera ejecución registrada (trigger automático)
--   confirmed    → asistente validó documentación completa
--   closed       → período cerrado; observaciones generadas en activity_performance_observations
--   cancelled    → plan abortado
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id       UUID NOT NULL REFERENCES public.boards(id)  ON DELETE CASCADE,
  group_id       UUID NOT NULL REFERENCES public.groups(id)  ON DELETE CASCADE,
  week_start     DATE NOT NULL,
  period_number  INT  NOT NULL CHECK (period_number BETWEEN 1 AND 4),
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','published','in_progress','confirmed','closed','cancelled')),

  -- Timestamps de transición para KPI de ciclo (tiempo draft→publish, publish→in_progress, etc.)
  published_by   UUID REFERENCES auth.users(id),
  published_at   TIMESTAMPTZ,
  confirmed_by   UUID REFERENCES auth.users(id),
  confirmed_at   TIMESTAMPTZ,
  closed_by      UUID REFERENCES auth.users(id),
  closed_at      TIMESTAMPTZ,

  created_by     UUID NOT NULL REFERENCES auth.users(id),
  updated_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (board_id, group_id, week_start)
);

CREATE TRIGGER trig_weekly_plans_updated_at
  BEFORE UPDATE ON public.weekly_plans
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_weekly_plans_board_status
  ON public.weekly_plans (board_id, status);

-- =============================================================================
-- 4. weekly_plan_items
--
-- Snapshot autosuficiente: planned_rendimiento y planned_frecuencia no requieren
-- JOIN a board_activity_standards para reconstruir cálculos de períodos pasados.
-- ON DELETE RESTRICT en activity_standard_id evita borrar estándares referenciados.
--
-- executed_qty y executed_jr los mantiene fn_sync_plan_item_totals (SECURITY DEFINER).
-- Cuentan ejecuciones con status IN ('reported', 'verified').
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_plan_items (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              UUID    NOT NULL REFERENCES public.weekly_plans(id)            ON DELETE CASCADE,
  activity_standard_id UUID    NOT NULL REFERENCES public.board_activity_standards(id) ON DELETE RESTRICT,
  planned_sequence     INT     NOT NULL,
  activity_key         TEXT    NOT NULL,
  planned_rendimiento  NUMERIC NOT NULL,
  planned_frecuencia   NUMERIC NOT NULL,
  priority             TEXT    NOT NULL CHECK (priority IN ('must_execute','preferred','flexible')),
  planned_qty          NUMERIC NOT NULL,
  unit                 TEXT    NOT NULL,
  planned_jr           NUMERIC NOT NULL,
  executed_qty         NUMERIC NOT NULL DEFAULT 0,   -- mantenido por trigger
  executed_jr          NUMERIC NOT NULL DEFAULT 0,   -- mantenido por trigger
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (plan_id, planned_sequence)
);

CREATE TRIGGER trig_weekly_plan_items_updated_at
  BEFORE UPDATE ON public.weekly_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- =============================================================================
-- 5. weekly_plan_item_executions
--
-- Fuente de verdad de la ejecución. Una fila por jornada por actividad.
-- executed_jr se genera automáticamente desde worker_count × duración / 28800 s.
--
-- Estados de validación:
--   draft    → líder registró, no enviado
--   reported → enviado vía report_execution(); pendiente de supervisor
--   verified → aprobado vía verify_execution()
--   rejected → rechazado vía reject_execution() (rejection_notes obligatorio)
--
-- Regla de escritura:
--   UPDATE directo: solo ejecuciones en estado 'draft' por su creador.
--   Transiciones de estado: SIEMPRE por funciones SECURITY DEFINER.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_plan_item_executions (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_item_id     UUID    NOT NULL REFERENCES public.weekly_plan_items(id) ON DELETE CASCADE,
  execution_date   DATE    NOT NULL,
  crew_name        TEXT,
  crew_leader_id   UUID    REFERENCES public.personnel(id),
  worker_count     INT     NOT NULL DEFAULT 1 CHECK (worker_count > 0),
  started_at       TIMESTAMPTZ NOT NULL,
  finished_at      TIMESTAMPTZ NOT NULL,
  executed_qty     NUMERIC NOT NULL CHECK (executed_qty >= 0),
  executed_jr      NUMERIC GENERATED ALWAYS AS (
    worker_count * EXTRACT(EPOCH FROM (finished_at - started_at)) / 28800.0
    -- 28800 s = 8 h/jornada estándar
  ) STORED,
  status           TEXT    NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','reported','verified','rejected')),
  rejection_notes  TEXT,
  verified_by      UUID    REFERENCES auth.users(id),
  verified_at      TIMESTAMPTZ,
  notes            TEXT,
  created_by       UUID    NOT NULL REFERENCES auth.users(id),
  updated_by       UUID    REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (finished_at > started_at),
  CHECK (status != 'verified' OR verified_by IS NOT NULL),
  CHECK (status != 'rejected' OR (rejection_notes IS NOT NULL AND rejection_notes != ''))
);

CREATE TRIGGER trig_plan_item_executions_updated_at
  BEFORE UPDATE ON public.weekly_plan_item_executions
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_wpie_plan_item_status
  ON public.weekly_plan_item_executions (plan_item_id, status);

CREATE INDEX IF NOT EXISTS idx_wpie_execution_date
  ON public.weekly_plan_item_executions (execution_date);

-- =============================================================================
-- 6. Trigger: sincronizar totales en weekly_plan_items
--
-- SECURITY DEFINER es necesario: el UPDATE RLS en weekly_plan_items requiere
-- can_manage_weekly_plan(), que un leader no satisface. Sin SECURITY DEFINER,
-- el trigger fallaría silenciosamente cuando lo dispara un leader.
--
-- Cuentan: reported (visibilidad durante la semana) + verified (para el acta).
-- No cuentan: draft (no enviado) + rejected (invalidado por supervisor).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_plan_item_totals()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE v_item_id UUID;
BEGIN
  v_item_id := COALESCE(NEW.plan_item_id, OLD.plan_item_id);
  UPDATE public.weekly_plan_items
  SET
    executed_qty = (
      SELECT COALESCE(SUM(e.executed_qty), 0)
      FROM   public.weekly_plan_item_executions e
      WHERE  e.plan_item_id = v_item_id
        AND  e.status IN ('reported', 'verified')
    ),
    executed_jr = (
      SELECT COALESCE(SUM(e.executed_jr), 0)
      FROM   public.weekly_plan_item_executions e
      WHERE  e.plan_item_id = v_item_id
        AND  e.status IN ('reported', 'verified')
        AND  e.executed_jr IS NOT NULL
    )
  WHERE id = v_item_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trig_sync_plan_item_totals ON public.weekly_plan_item_executions;
CREATE TRIGGER trig_sync_plan_item_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.weekly_plan_item_executions
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_plan_item_totals();

-- =============================================================================
-- 7. Trigger: published → in_progress automático en la primera ejecución
--
-- El UPDATE en weekly_plans usa WHERE status = 'published', lo que lo hace
-- idempotente ante concurrencia: si dos líderes insertan ejecuciones al mismo
-- tiempo, el segundo UPDATE no encuentra filas (status ya es 'in_progress').
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_auto_set_plan_in_progress()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.weekly_plans wp
  SET    status     = 'in_progress',
         updated_by = NEW.created_by,
         updated_at = NOW()
  FROM   public.weekly_plan_items wpi
  WHERE  wpi.id    = NEW.plan_item_id
    AND  wp.id     = wpi.plan_id
    AND  wp.status = 'published';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_auto_set_plan_in_progress ON public.weekly_plan_item_executions;
CREATE TRIGGER trig_auto_set_plan_in_progress
  AFTER INSERT ON public.weekly_plan_item_executions
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_set_plan_in_progress();

-- =============================================================================
-- 8. Funciones de transición de estado
--
--    Patrón común en cada función:
--      1. SELECT ... FOR UPDATE → serializa transiciones concurrentes
--      2. Validar rol del usuario llamante
--      3. Validar estado previo
--      4. Ejecutar UPDATE de estado
--
--    Todas incluyen SET search_path por seguridad (CWE-427).
-- =============================================================================

-- Helper interno: resuelve board_id a partir de un execution_id.
-- SECURITY DEFINER para poder hacer el JOIN a través de las tres tablas
-- incluso cuando el llamante no es admin.
CREATE OR REPLACE FUNCTION public._get_board_id_for_execution(p_execution_id UUID)
RETURNS UUID LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT wp.board_id
  FROM   public.weekly_plan_item_executions e
  JOIN   public.weekly_plan_items           i  ON i.id  = e.plan_item_id
  JOIN   public.weekly_plans                wp ON wp.id = i.plan_id
  WHERE  e.id = p_execution_id
$$;

-- ── publish_weekly_plan ───────────────────────────────────────────────────────
-- Quién:      assistant, admin
-- Transición: draft → published

CREATE OR REPLACE FUNCTION public.publish_weekly_plan(p_plan_id UUID)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE v_plan public.weekly_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.weekly_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;
  IF NOT public.can_manage_weekly_plan(v_plan.board_id, auth.uid()) THEN
    RAISE EXCEPTION 'Solo administradores y asistentes pueden publicar planes.';
  END IF;
  IF v_plan.status != 'draft' THEN
    RAISE EXCEPTION 'Solo se puede publicar un plan en estado draft. Estado actual: %', v_plan.status;
  END IF;

  UPDATE public.weekly_plans
  SET    status       = 'published',
         published_by = auth.uid(),
         published_at = NOW(),
         updated_by   = auth.uid()
  WHERE  id = p_plan_id;
END;
$$;

-- ── report_execution ──────────────────────────────────────────────────────────
-- Quién:      leader (creador), assistant, admin
-- Transición: draft → reported
--
-- Diseño: assistant puede reportar ejecuciones de cualquier líder porque actúa
-- como coordinador operativo; puede necesitar enviar reportes cuando el líder
-- no tiene conectividad. Si el negocio cambia esta regla, ajustar aquí.

CREATE OR REPLACE FUNCTION public.report_execution(p_execution_id UUID)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_exec  public.weekly_plan_item_executions%ROWTYPE;
  v_board UUID;
BEGIN
  SELECT * INTO v_exec
  FROM   public.weekly_plan_item_executions
  WHERE  id = p_execution_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ejecución % no encontrada', p_execution_id;
  END IF;

  v_board := public._get_board_id_for_execution(p_execution_id);

  IF NOT public.can_report_execution(v_board, auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para reportar ejecuciones en este board.';
  END IF;
  -- Leader solo puede reportar sus propias ejecuciones; admin y assistant pueden reportar cualquiera.
  IF v_exec.created_by != auth.uid()
     AND get_user_board_role(v_board, auth.uid()) NOT IN ('admin', 'assistant') THEN
    RAISE EXCEPTION 'Solo el creador de la ejecución puede reportarla (o admin/asistente).';
  END IF;
  IF v_exec.status != 'draft' THEN
    RAISE EXCEPTION 'Solo se puede reportar una ejecución en estado draft. Estado actual: %', v_exec.status;
  END IF;

  UPDATE public.weekly_plan_item_executions
  SET    status     = 'reported',
         updated_by = auth.uid()
  WHERE  id = p_execution_id;
END;
$$;

-- ── verify_execution ──────────────────────────────────────────────────────────
-- Quién:      supervisor, admin
-- Transición: reported → verified

CREATE OR REPLACE FUNCTION public.verify_execution(p_execution_id UUID)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_exec  public.weekly_plan_item_executions%ROWTYPE;
  v_board UUID;
BEGIN
  SELECT * INTO v_exec
  FROM   public.weekly_plan_item_executions
  WHERE  id = p_execution_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ejecución % no encontrada', p_execution_id;
  END IF;

  v_board := public._get_board_id_for_execution(p_execution_id);

  IF NOT public.can_verify_execution(v_board, auth.uid()) THEN
    RAISE EXCEPTION 'Solo supervisores y administradores pueden verificar ejecuciones.';
  END IF;
  IF v_exec.status != 'reported' THEN
    RAISE EXCEPTION 'Solo se puede verificar una ejecución reportada. Estado actual: %', v_exec.status;
  END IF;

  UPDATE public.weekly_plan_item_executions
  SET    status      = 'verified',
         verified_by = auth.uid(),
         verified_at = NOW(),
         updated_by  = auth.uid()
  WHERE  id = p_execution_id;
END;
$$;

-- ── reject_execution ──────────────────────────────────────────────────────────
-- Quién:      supervisor, admin
-- Transición: reported → rejected
-- El líder verá el rechazo y podrá crear una nueva ejecución con datos corregidos.

CREATE OR REPLACE FUNCTION public.reject_execution(p_execution_id UUID, p_notes TEXT)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_exec  public.weekly_plan_item_executions%ROWTYPE;
  v_board UUID;
BEGIN
  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RAISE EXCEPTION 'rejection_notes es obligatorio al rechazar una ejecución.';
  END IF;

  SELECT * INTO v_exec
  FROM   public.weekly_plan_item_executions
  WHERE  id = p_execution_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ejecución % no encontrada', p_execution_id;
  END IF;

  v_board := public._get_board_id_for_execution(p_execution_id);

  IF NOT public.can_verify_execution(v_board, auth.uid()) THEN
    RAISE EXCEPTION 'Solo supervisores y administradores pueden rechazar ejecuciones.';
  END IF;
  IF v_exec.status != 'reported' THEN
    RAISE EXCEPTION 'Solo se puede rechazar una ejecución reportada. Estado actual: %', v_exec.status;
  END IF;

  UPDATE public.weekly_plan_item_executions
  SET    status          = 'rejected',
         rejection_notes = p_notes,
         updated_by      = auth.uid()
  WHERE  id = p_execution_id;
END;
$$;

-- ── confirm_weekly_plan ───────────────────────────────────────────────────────
-- Quién:      assistant, admin
-- Transición: in_progress | published → confirmed
-- Gate: no puede quedar ninguna ejecución en estado 'reported' (pendiente del supervisor)

CREATE OR REPLACE FUNCTION public.confirm_weekly_plan(p_plan_id UUID)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_plan    public.weekly_plans%ROWTYPE;
  v_pending INT;
BEGIN
  SELECT * INTO v_plan FROM public.weekly_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;
  IF NOT public.can_manage_weekly_plan(v_plan.board_id, auth.uid()) THEN
    RAISE EXCEPTION 'Solo administradores y asistentes pueden confirmar planes.';
  END IF;
  IF v_plan.status NOT IN ('in_progress', 'published') THEN
    RAISE EXCEPTION
      'No se puede confirmar un plan en estado "%". Debe estar in_progress o published.',
      v_plan.status;
  END IF;

  SELECT COUNT(*) INTO v_pending
  FROM   public.weekly_plan_item_executions e
  JOIN   public.weekly_plan_items           i ON i.id = e.plan_item_id
  WHERE  i.plan_id = p_plan_id
    AND  e.status  = 'reported';

  IF v_pending > 0 THEN
    RAISE EXCEPTION
      '% ejecución(es) pendiente(s) de verificación. '
      'El supervisor debe verificar o rechazar antes de confirmar el informe.',
      v_pending;
  END IF;

  UPDATE public.weekly_plans
  SET    status       = 'confirmed',
         confirmed_by = auth.uid(),
         confirmed_at = NOW(),
         updated_by   = auth.uid()
  WHERE  id = p_plan_id;
END;
$$;

-- ── close_weekly_plan ─────────────────────────────────────────────────────────
-- Quién:      admin únicamente
-- Transición: confirmed → closed
-- Efecto:     genera activity_performance_observations para el siguiente ciclo de planificación.
--
-- La máquina de estados previene doble llamada (status != 'confirmed' → excepción).
-- El NOT EXISTS en el INSERT es una guardia defensiva adicional para ambientes de
-- prueba donde el estado pueda estar inconsistente.
--
-- Mapeo de columnas a activity_performance_observations (schema 20260708):
--   observed_rendimiento = executed_qty / executed_jr
--   qty_executed         = executed_qty
--   jornales_used        = executed_jr

CREATE OR REPLACE FUNCTION public.close_weekly_plan(p_plan_id UUID)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE v_plan public.weekly_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.weekly_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;
  IF get_user_board_role(v_plan.board_id, auth.uid()) != 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden cerrar planes.';
  END IF;
  IF v_plan.status != 'confirmed' THEN
    RAISE EXCEPTION 'Solo se puede cerrar un plan confirmado. Estado actual: %', v_plan.status;
  END IF;

  INSERT INTO public.activity_performance_observations
    (board_id, group_id, activity_key,
     observed_rendimiento, qty_executed, jornales_used,
     observation_date, source)
  SELECT
    v_plan.board_id,
    v_plan.group_id,
    i.activity_key,
    i.executed_qty / i.executed_jr,
    i.executed_qty,
    i.executed_jr,
    v_plan.week_start,
    'weekly_plan_close'
  FROM public.weekly_plan_items i
  WHERE i.plan_id     = p_plan_id
    AND i.executed_jr > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.activity_performance_observations apo
      WHERE  apo.board_id        = v_plan.board_id
        AND  apo.group_id        = v_plan.group_id
        AND  apo.activity_key    = i.activity_key
        AND  apo.observation_date = v_plan.week_start
        AND  apo.source          = 'weekly_plan_close'
    );

  UPDATE public.weekly_plans
  SET    status     = 'closed',
         closed_by  = auth.uid(),
         closed_at  = NOW(),
         updated_by = auth.uid()
  WHERE  id = p_plan_id;
END;
$$;

-- =============================================================================
-- 9. work_orders: enlace nullable al plan
-- =============================================================================

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS weekly_plan_item_id UUID
  REFERENCES public.weekly_plan_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.work_orders.weekly_plan_item_id IS
  'NULL = OT reactiva/emergencia. NOT NULL = OT planificada. KPI: % trabajo planificado vs reactivo.';

-- =============================================================================
-- 10. RLS — usando las funciones de autorización centralizadas
--
--    Políticas SELECT:  cualquier miembro del board (get_user_board_role IS NOT NULL)
--    Políticas de escritura: a través de las funciones can_*
--    UPDATE en weekly_plans y transiciones en executions: solo por funciones SECURITY DEFINER
-- =============================================================================

ALTER TABLE public.weekly_plans                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_plan_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_plan_item_executions ENABLE ROW LEVEL SECURITY;

-- ── weekly_plans ──────────────────────────────────────────────────────────────

CREATE POLICY "Miembros del board ven sus planes"
  ON public.weekly_plans FOR SELECT
  USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

CREATE POLICY "Asistentes y admins crean planes"
  ON public.weekly_plans FOR INSERT
  WITH CHECK (public.can_manage_weekly_plan(board_id, auth.uid()));

-- UPDATE directo bloqueado: toda transición pasa por funciones SECURITY DEFINER
CREATE POLICY "UPDATE de planes solo via funciones de transición"
  ON public.weekly_plans FOR UPDATE
  TO authenticated USING (false);

CREATE POLICY "DELETE de planes bloqueado"
  ON public.weekly_plans FOR DELETE
  TO authenticated USING (false);

-- ── weekly_plan_items ─────────────────────────────────────────────────────────

CREATE POLICY "Miembros del board ven items del plan"
  ON public.weekly_plan_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plans wp
      WHERE  wp.id = plan_id
        AND  get_user_board_role(wp.board_id, auth.uid()) IS NOT NULL
    )
  );

-- Solo en planes draft; una vez publicado los items son inmutables
CREATE POLICY "Asistentes y admins crean items en planes draft"
  ON public.weekly_plan_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_plans wp
      WHERE  wp.id     = plan_id
        AND  wp.status = 'draft'
        AND  public.can_manage_weekly_plan(wp.board_id, auth.uid())
    )
  );

CREATE POLICY "Edición de items solo en planes draft"
  ON public.weekly_plan_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plans wp
      WHERE  wp.id     = plan_id
        AND  wp.status = 'draft'
        AND  public.can_manage_weekly_plan(wp.board_id, auth.uid())
    )
  );

CREATE POLICY "DELETE de items solo en planes draft"
  ON public.weekly_plan_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plans wp
      WHERE  wp.id     = plan_id
        AND  wp.status = 'draft'
        AND  public.can_manage_weekly_plan(wp.board_id, auth.uid())
    )
  );

-- ── weekly_plan_item_executions ───────────────────────────────────────────────

CREATE POLICY "Miembros del board ven ejecuciones"
  ON public.weekly_plan_item_executions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plan_items wpi
      JOIN   public.weekly_plans wp ON wp.id = wpi.plan_id
      WHERE  wpi.id = plan_item_id
        AND  get_user_board_role(wp.board_id, auth.uid()) IS NOT NULL
    )
  );

-- Solo en planes published o in_progress
CREATE POLICY "Líderes y asistentes crean ejecuciones"
  ON public.weekly_plan_item_executions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_plan_items wpi
      JOIN   public.weekly_plans wp ON wp.id = wpi.plan_id
      WHERE  wpi.id    = plan_item_id
        AND  wp.status IN ('published', 'in_progress')
        AND  public.can_report_execution(wp.board_id, auth.uid())
    )
  );

-- UPDATE directo: solo datos de una ejecución draft propia (antes de reportar).
-- Las transiciones report/verify/reject van por funciones SECURITY DEFINER.
CREATE POLICY "Edición de ejecuciones draft propias"
  ON public.weekly_plan_item_executions FOR UPDATE
  USING (
    created_by = auth.uid()
    AND status = 'draft'
  );

-- Los eventos de ejecución son inmutables
CREATE POLICY "DELETE de ejecuciones bloqueado"
  ON public.weekly_plan_item_executions FOR DELETE
  TO authenticated USING (false);
