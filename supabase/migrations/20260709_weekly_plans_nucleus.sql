-- =============================================================================
-- Phase 5 Nucleus: Weekly Plans + Execution Events
--
-- Tablas:
--   board_roles                     — catálogo de roles (reemplaza CHECK constraint)
--   weekly_plans                    — plan semanal por sitio
--   weekly_plan_items               — línea por actividad (snapshot autosuficiente)
--   weekly_plan_item_executions     — eventos de ejecución (fuente de verdad)
--
-- Roles (board_members.role → FK a board_roles):
--   admin | assistant | supervisor | leader | viewer
--
-- Funciones de autorización (usadas en RLS):
--   can_manage_weekly_plan(board_id, user_id)  → admin, assistant
--   can_report_execution(board_id, user_id)    → admin, assistant, leader
--   can_verify_execution(board_id, user_id)    → admin, supervisor
--
-- Funciones de transición de estado (SECURITY DEFINER, validan rol + estado):
--   publish_weekly_plan(uuid)           → admin, assistant  | draft → published
--   report_execution(uuid)             → leader, assistant  | draft → reported
--   verify_execution(uuid)             → supervisor, admin  | reported → verified
--   reject_execution(uuid, text)       → supervisor, admin  | reported → rejected
--   confirm_weekly_plan(uuid)          → assistant, admin   | in_progress → confirmed
--   close_weekly_plan(uuid)            → admin              | confirmed → closed
-- =============================================================================

-- =============================================================================
-- 0. Utilidad: trigger updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. Catálogo de roles (reemplaza CHECK inline en board_members)
--
--    Agregar un rol en el futuro = INSERT en esta tabla.
--    No hay que tocar la definición de board_members.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.board_roles (
  role         TEXT PRIMARY KEY,
  description  TEXT NOT NULL,
  display_order INT NOT NULL
);

INSERT INTO public.board_roles (role, description, display_order) VALUES
  ('admin',      'Administrador: configuración, publicación y cierre de planes', 1),
  ('assistant',  'Asistente operativo: crea y confirma cronogramas semanales',   2),
  ('supervisor', 'Supervisor técnico: verifica calidad de ejecución en campo',   3),
  ('leader',     'Líder de sitio: reporta actividades ejecutadas',               4),
  ('viewer',     'Observador: solo lectura',                                     5)
ON CONFLICT (role) DO NOTHING;

-- Reemplazar CHECK inline por FK al catálogo
DO $$ BEGIN
  ALTER TABLE public.board_members DROP CONSTRAINT IF EXISTS board_members_role_check;
  -- Convertir cualquier dato residual del rol deprecado 'member' antes de añadir la FK
  UPDATE public.board_members SET role = 'viewer' WHERE role = 'member';
  ALTER TABLE public.board_members
    ADD CONSTRAINT board_members_role_fk
    FOREIGN KEY (role) REFERENCES public.board_roles(role) ON UPDATE CASCADE;
END $$;

-- Actualizar la política existente de board_activity_standards (sí usa IN literal, por ser
-- una política de la migración anterior y no queremos acoplarla al catálogo en esta versión).
DROP POLICY IF EXISTS "Miembros pueden insertar estándares"   ON public.board_activity_standards;
DROP POLICY IF EXISTS "Asistentes y admins insertan estándares" ON public.board_activity_standards;
CREATE POLICY "Asistentes y admins insertan estándares"
  ON public.board_activity_standards FOR INSERT
  WITH CHECK (get_user_board_role(board_id, auth.uid()) IN ('admin', 'assistant'));

-- =============================================================================
-- 2. Funciones de autorización reutilizables
--
--    STABLE → el planner puede cachear el resultado dentro de la misma query.
--    Se usan en USING / WITH CHECK de las políticas RLS para evitar duplicar
--    listas de roles en veinte lugares distintos.
-- =============================================================================

-- Quién puede crear planes o editar items en estado draft
CREATE OR REPLACE FUNCTION public.can_manage_weekly_plan(p_board_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT get_user_board_role(p_board_id, p_user_id) IN ('admin', 'assistant')
$$;

-- Quién puede registrar ejecuciones en campo
CREATE OR REPLACE FUNCTION public.can_report_execution(p_board_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT get_user_board_role(p_board_id, p_user_id) IN ('admin', 'assistant', 'leader')
$$;

-- Quién puede verificar o rechazar ejecuciones
CREATE OR REPLACE FUNCTION public.can_verify_execution(p_board_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT get_user_board_role(p_board_id, p_user_id) IN ('admin', 'supervisor')
$$;

-- =============================================================================
-- 3. weekly_plans
--
-- Estado:
--   draft        → asistente edita el cronograma
--   published    → entregado a líderes (bloquea edición de items)
--   in_progress  → primera ejecución registrada (trigger automático)
--   confirmed    → asistente validó documentación completa
--   closed       → período terminado, observaciones generadas en activity_performance_observations
--   cancelled    → plan abortado
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_plans (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id       UUID    NOT NULL REFERENCES public.boards(id)  ON DELETE CASCADE,
  group_id       UUID    NOT NULL REFERENCES public.groups(id)  ON DELETE CASCADE,
  week_start     DATE    NOT NULL,
  period_number  INT     NOT NULL CHECK (period_number BETWEEN 1 AND 4),
  status         TEXT    NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','published','in_progress','confirmed','closed','cancelled')),

  -- Timestamps de transición (trazabilidad de ciclo para KPI)
  published_by   UUID    REFERENCES auth.users(id),
  published_at   TIMESTAMPTZ,
  confirmed_by   UUID    REFERENCES auth.users(id),
  confirmed_at   TIMESTAMPTZ,
  closed_by      UUID    REFERENCES auth.users(id),
  closed_at      TIMESTAMPTZ,

  created_by     UUID    NOT NULL REFERENCES auth.users(id),
  updated_by     UUID    REFERENCES auth.users(id),
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
-- JOIN a board_activity_standards para reconstruir cálculos históricos.
-- activity_standard_id ON DELETE RESTRICT evita borrar estándares referenciados.
--
-- executed_qty y executed_jr son mantenidos por trigger fn_sync_plan_item_totals.
-- Cuentan ejecuciones con status IN ('reported', 'verified').
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_plan_items (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              UUID    NOT NULL REFERENCES public.weekly_plans(id) ON DELETE CASCADE,
  planned_sequence     INT     NOT NULL,
  activity_key         TEXT    NOT NULL,
  activity_standard_id UUID    NOT NULL
                       REFERENCES public.board_activity_standards(id) ON DELETE RESTRICT,
  planned_rendimiento  NUMERIC NOT NULL,
  planned_frecuencia   NUMERIC NOT NULL,
  priority             TEXT    NOT NULL
                       CHECK (priority IN ('must_execute','preferred','flexible')),
  planned_qty          NUMERIC NOT NULL,
  unit                 TEXT    NOT NULL,
  planned_jr           NUMERIC NOT NULL,
  executed_qty         NUMERIC NOT NULL DEFAULT 0,
  executed_jr          NUMERIC NOT NULL DEFAULT 0,
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
-- executed_jr GENERATED desde worker_count × duración / 28800 s (8h estándar).
--
-- Estado de validación:
--   draft    → líder registró, no enviado
--   reported → líder envió vía report_execution(), pendiente de supervisor
--   verified → supervisor aprobó vía verify_execution()
--   rejected → supervisor rechazó vía reject_execution() (rejection_notes obligatorio)
--
-- Las transiciones de estado van SIEMPRE por funciones SECURITY DEFINER.
-- El UPDATE directo solo permite editar campos de una ejecución draft propia.
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
-- 6. Trigger: sincronizar totales ejecutados en weekly_plan_items
--
-- Cuenta ejecuciones con status IN ('reported', 'verified'):
--   reported → visibilidad de progreso durante la semana
--   verified → contabilizado para el acta
--   draft    → no cuenta (no enviado)
--   rejected → no cuenta (invalidado)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_plan_item_totals()
RETURNS TRIGGER AS $$
DECLARE v_item_id UUID;
BEGIN
  v_item_id := COALESCE(NEW.plan_item_id, OLD.plan_item_id);
  UPDATE public.weekly_plan_items
  SET
    executed_qty = (
      SELECT COALESCE(SUM(executed_qty), 0)
      FROM   public.weekly_plan_item_executions
      WHERE  plan_item_id = v_item_id
        AND  status IN ('reported', 'verified')
    ),
    executed_jr = (
      SELECT COALESCE(SUM(executed_jr), 0)
      FROM   public.weekly_plan_item_executions
      WHERE  plan_item_id = v_item_id
        AND  status IN ('reported', 'verified')
        AND  executed_jr IS NOT NULL
    )
  WHERE id = v_item_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_sync_plan_item_totals ON public.weekly_plan_item_executions;
CREATE TRIGGER trig_sync_plan_item_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.weekly_plan_item_executions
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_plan_item_totals();

-- =============================================================================
-- 7. Trigger: published → in_progress automático al registrar la primera ejecución
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_auto_set_plan_in_progress()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.weekly_plans wp
  SET    status     = 'in_progress',
         updated_by = NEW.created_by,
         updated_at = NOW()
  FROM   public.weekly_plan_items wpi
  WHERE  wpi.id     = NEW.plan_item_id
    AND  wp.id      = wpi.plan_id
    AND  wp.status  = 'published';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trig_auto_set_plan_in_progress ON public.weekly_plan_item_executions;
CREATE TRIGGER trig_auto_set_plan_in_progress
  AFTER INSERT ON public.weekly_plan_item_executions
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_set_plan_in_progress();

-- =============================================================================
-- 8. Funciones de transición de estado
--
--    SECURITY DEFINER → pueden cambiar estado aunque el UPDATE directo esté
--    bloqueado por RLS. Cada función valida rol Y estado previo.
-- =============================================================================

-- Helper interno: obtiene el board_id de un plan a partir de plan_item_id
CREATE OR REPLACE FUNCTION public._get_board_id_for_execution(p_execution_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT wp.board_id
  FROM   public.weekly_plan_item_executions e
  JOIN   public.weekly_plan_items           i  ON i.id  = e.plan_item_id
  JOIN   public.weekly_plans                wp ON wp.id = i.plan_id
  WHERE  e.id = p_execution_id
$$;

-- ── publish_weekly_plan ───────────────────────────────────────────────────────
-- Quién: assistant, admin
-- Transición: draft → published

CREATE OR REPLACE FUNCTION public.publish_weekly_plan(p_plan_id UUID)
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── report_execution ──────────────────────────────────────────────────────────
-- Quién: leader, assistant, admin (el creador de la ejecución)
-- Transición: draft → reported
-- El supervisor recibe notificación implícita al ver status = 'reported'.

CREATE OR REPLACE FUNCTION public.report_execution(p_execution_id UUID)
RETURNS VOID AS $$
DECLARE
  v_exec    public.weekly_plan_item_executions%ROWTYPE;
  v_board   UUID;
BEGIN
  SELECT * INTO v_exec FROM public.weekly_plan_item_executions WHERE id = p_execution_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ejecución % no encontrada', p_execution_id;
  END IF;

  v_board := public._get_board_id_for_execution(p_execution_id);
  IF NOT public.can_report_execution(v_board, auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para reportar ejecuciones en este board.';
  END IF;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── verify_execution ──────────────────────────────────────────────────────────
-- Quién: supervisor, admin
-- Transición: reported → verified

CREATE OR REPLACE FUNCTION public.verify_execution(p_execution_id UUID)
RETURNS VOID AS $$
DECLARE
  v_exec  public.weekly_plan_item_executions%ROWTYPE;
  v_board UUID;
BEGIN
  SELECT * INTO v_exec FROM public.weekly_plan_item_executions WHERE id = p_execution_id FOR UPDATE;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── reject_execution ──────────────────────────────────────────────────────────
-- Quién: supervisor, admin
-- Transición: reported → rejected (devuelve al líder para corrección)

CREATE OR REPLACE FUNCTION public.reject_execution(p_execution_id UUID, p_notes TEXT)
RETURNS VOID AS $$
DECLARE
  v_exec  public.weekly_plan_item_executions%ROWTYPE;
  v_board UUID;
BEGIN
  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RAISE EXCEPTION 'rejection_notes es obligatorio al rechazar una ejecución.';
  END IF;

  SELECT * INTO v_exec FROM public.weekly_plan_item_executions WHERE id = p_execution_id FOR UPDATE;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── confirm_weekly_plan ───────────────────────────────────────────────────────
-- Quién: assistant, admin
-- Transición: in_progress | published → confirmed
-- Gate: no puede quedar ninguna ejecución en estado 'reported' (pendiente del supervisor)

CREATE OR REPLACE FUNCTION public.confirm_weekly_plan(p_plan_id UUID)
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── close_weekly_plan ─────────────────────────────────────────────────────────
-- Quién: admin únicamente
-- Transición: confirmed → closed
-- Efecto: genera activity_performance_observations (cierra el ciclo de retroalimentación).

CREATE OR REPLACE FUNCTION public.close_weekly_plan(p_plan_id UUID)
RETURNS VOID AS $$
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

  -- Generar observaciones de rendimiento real.
  -- Mapeo a columnas de activity_performance_observations (schema 20260708):
  --   observed_rendimiento = executed_qty / executed_jr
  --   qty_executed         = executed_qty
  --   jornales_used        = executed_jr
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
  WHERE i.plan_id    = p_plan_id
    AND i.executed_jr > 0;

  UPDATE public.weekly_plans
  SET    status    = 'closed',
         closed_by = auth.uid(),
         closed_at = NOW(),
         updated_by = auth.uid()
  WHERE  id = p_plan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 9. work_orders: enlace nullable al plan
-- =============================================================================

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS weekly_plan_item_id UUID
  REFERENCES public.weekly_plan_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.work_orders.weekly_plan_item_id IS
  'NULL = OT reactiva. NOT NULL = OT planificada (KPI: % trabajo planificado vs reactivo).';

-- =============================================================================
-- 10. RLS — usando las funciones de autorización centralizadas
-- =============================================================================

ALTER TABLE public.weekly_plans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_plan_items          ENABLE ROW LEVEL SECURITY;
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

-- UPDATE directo: solo editar datos de una ejecución draft propia (antes de reportar).
-- Las transiciones de estado (report/verify/reject) van por funciones SECURITY DEFINER.
CREATE POLICY "Edición de ejecuciones draft propias"
  ON public.weekly_plan_item_executions FOR UPDATE
  USING (
    created_by = auth.uid()
    AND status = 'draft'
  );

-- DELETE bloqueado: los eventos de ejecución son inmutables
CREATE POLICY "DELETE de ejecuciones bloqueado"
  ON public.weekly_plan_item_executions FOR DELETE
  TO authenticated USING (false);
