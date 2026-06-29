-- =============================================================================
-- Phase 5 Nucleus: Weekly Plans + Execution Events
--
-- Tablas:
--   weekly_plans                    — plan semanal por sitio
--   weekly_plan_items               — línea por actividad (snapshot autosuficiente)
--   weekly_plan_item_executions     — eventos de ejecución (fuente de verdad)
--
-- Roles board_members (reemplaza admin|member|viewer del schema original):
--   admin | assistant | supervisor | leader | viewer
--
-- Funciones de transición de estado (SECURITY DEFINER):
--   publish_weekly_plan(uuid)       — draft → published
--   confirm_weekly_plan(uuid)       — in_progress → confirmed
--   close_weekly_plan(uuid)         — confirmed → closed + genera observaciones
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
-- 1. Reemplazar board_members.role CHECK
--    Schema original: ('admin', 'member', 'viewer')
--    Sin datos de producción — se reemplaza limpiamente.
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE public.board_members
    DROP CONSTRAINT IF EXISTS board_members_role_check;
  ALTER TABLE public.board_members
    ADD CONSTRAINT board_members_role_check
    CHECK (role IN ('admin', 'assistant', 'supervisor', 'leader', 'viewer'));
END $$;

-- Actualizar política de board_activity_standards: reemplaza 'member' por los nuevos
-- roles con permiso de escritura (admin y assistant).
DROP POLICY IF EXISTS "Miembros pueden insertar estándares" ON public.board_activity_standards;
CREATE POLICY "Asistentes y admins insertan estándares"
  ON public.board_activity_standards FOR INSERT
  WITH CHECK (get_user_board_role(board_id, auth.uid()) IN ('admin', 'assistant'));

-- =============================================================================
-- 2. weekly_plans
--
-- Estado:
--   draft        → asistente edita el cronograma
--   published    → entregado a líderes (bloquea edición de items)
--   in_progress  → primera ejecución registrada (automático por trigger)
--   confirmed    → asistente validó documentación completa
--   closed       → período terminado, observaciones generadas
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

  -- Auditoría de transiciones
  published_by   UUID    REFERENCES auth.users(id),
  published_at   TIMESTAMPTZ,
  confirmed_by   UUID    REFERENCES auth.users(id),
  confirmed_at   TIMESTAMPTZ,
  closed_by      UUID    REFERENCES auth.users(id),
  closed_at      TIMESTAMPTZ,

  -- Auditoría estándar
  created_by     UUID    NOT NULL REFERENCES auth.users(id),
  updated_by     UUID    REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (board_id, group_id, week_start)
  -- UNIQUE crea implícitamente el índice de lookup más frecuente
);

CREATE TRIGGER trig_weekly_plans_updated_at
  BEFORE UPDATE ON public.weekly_plans
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_weekly_plans_board_status
  ON public.weekly_plans (board_id, status);

-- =============================================================================
-- 3. weekly_plan_items
--
-- Snapshot autosuficiente: planned_rendimiento y planned_frecuencia no requieren
-- JOIN a board_activity_standards para reconstruir cálculos históricos.
-- activity_standard_id ON DELETE RESTRICT evita borrar estándares referenciados.
--
-- executed_qty y executed_jr son mantenidos por trigger fn_sync_plan_item_totals.
-- Solo cuentan ejecuciones con status IN ('reported', 'verified').
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
  executed_qty         NUMERIC NOT NULL DEFAULT 0,  -- mantenido por trigger
  executed_jr          NUMERIC NOT NULL DEFAULT 0,  -- mantenido por trigger
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, planned_sequence)
);

CREATE TRIGGER trig_weekly_plan_items_updated_at
  BEFORE UPDATE ON public.weekly_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- =============================================================================
-- 4. weekly_plan_item_executions
--
-- Fuente de verdad de la ejecución. Una fila por jornada por actividad.
-- executed_jr es GENERATED desde worker_count × duración / 28800 s (8h/jornada).
--
-- Estado de validación:
--   draft    → líder registró pero no envió
--   reported → líder envió, pendiente de verificación del supervisor
--   verified → supervisor aprobó calidad
--   rejected → supervisor rechazó (rejection_notes obligatorio)
--
-- CHECK constraints de integridad de estado:
--   verified requiere verified_by
--   rejected requiere rejection_notes
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
    -- TODO v2: mover jornada estándar a boards.workday_seconds
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
-- 5. Trigger: sincronizar totales ejecutados en weekly_plan_items
--
-- Cuenta ejecuciones con status IN ('reported', 'verified'):
--   'reported' → visibilidad de progreso para el líder durante la semana
--   'verified' → contabilizado para el acta
--   'draft'    → no cuenta (no enviado)
--   'rejected' → no cuenta (invalidado por supervisor)
--
-- confirm_weekly_plan() verifica que no queden 'reported' antes de confirmar.
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
-- 6. Trigger: published → in_progress automático al registrar la primera ejecución
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
    AND  wp.status  = 'published';  -- solo si ya fue publicado
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trig_auto_set_plan_in_progress ON public.weekly_plan_item_executions;
CREATE TRIGGER trig_auto_set_plan_in_progress
  AFTER INSERT ON public.weekly_plan_item_executions
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_set_plan_in_progress();

-- =============================================================================
-- 7. Funciones de transición de estado
--
-- Todas usan FOR UPDATE para serializar transiciones concurrentes.
-- SECURITY DEFINER les permite actualizar estados aunque el usuario
-- no tenga permiso directo de UPDATE (bloqueado por RLS).
-- =============================================================================

-- ── publish_weekly_plan ───────────────────────────────────────────────────────
-- Quién puede llamarla: asistente, admin
-- Precondición: status = 'draft'

CREATE OR REPLACE FUNCTION public.publish_weekly_plan(p_plan_id UUID)
RETURNS VOID AS $$
DECLARE v_plan public.weekly_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.weekly_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
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

-- ── confirm_weekly_plan ───────────────────────────────────────────────────────
-- Quién puede llamarla: asistente, admin
-- Precondición: status IN ('in_progress', 'published')
-- Valida: no quedan ejecuciones en estado 'reported' (pendientes del supervisor)

CREATE OR REPLACE FUNCTION public.confirm_weekly_plan(p_plan_id UUID)
RETURNS VOID AS $$
DECLARE
  v_plan      public.weekly_plans%ROWTYPE;
  v_pending   INT;
BEGIN
  SELECT * INTO v_plan FROM public.weekly_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;
  IF v_plan.status NOT IN ('in_progress', 'published') THEN
    RAISE EXCEPTION
      'No se puede confirmar un plan en estado "%". Debe estar in_progress o published.',
      v_plan.status;
  END IF;

  -- Gate: todas las ejecuciones enviadas deben estar verificadas por el supervisor
  SELECT COUNT(*) INTO v_pending
  FROM   public.weekly_plan_item_executions e
  JOIN   public.weekly_plan_items i ON i.id = e.plan_item_id
  WHERE  i.plan_id = p_plan_id
    AND  e.status  = 'reported';

  IF v_pending > 0 THEN
    RAISE EXCEPTION
      '% ejecución(es) pendiente(s) de verificación por el supervisor. '
      'El supervisor debe aprobar o rechazar antes de confirmar el informe.',
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
-- Quién puede llamarla: admin
-- Precondición: status = 'confirmed'
-- Efecto: genera activity_performance_observations y cierra el plan.

CREATE OR REPLACE FUNCTION public.close_weekly_plan(p_plan_id UUID)
RETURNS VOID AS $$
DECLARE v_plan public.weekly_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.weekly_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;
  IF v_plan.status != 'confirmed' THEN
    RAISE EXCEPTION
      'Solo se puede cerrar un plan confirmado. Estado actual: %', v_plan.status;
  END IF;

  -- Insertar observaciones de rendimiento real para el siguiente ciclo de planificación.
  -- Solo items con ejecución verificada (executed_jr > 0).
  -- Mapeo de columnas a activity_performance_observations:
  --   observed_rendimiento = executed_qty / executed_jr  (m²/JR, und/JR, etc.)
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
    i.executed_qty / i.executed_jr,   -- rendimiento observado
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
-- 8. work_orders: enlace nullable al plan
-- =============================================================================

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS weekly_plan_item_id UUID
  REFERENCES public.weekly_plan_items(id) ON DELETE SET NULL;
-- NULL → OT reactiva/correctiva/emergencia
-- NOT NULL → OT planificada, trazable al cronograma semanal

COMMENT ON COLUMN public.work_orders.weekly_plan_item_id IS
  'NULL = OT reactiva. NOT NULL = OT planificada (KPI: % trabajo planificado vs reactivo).';

-- =============================================================================
-- 9. RLS
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
  WITH CHECK (get_user_board_role(board_id, auth.uid()) IN ('admin', 'assistant'));

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
      WHERE wp.id = plan_id
        AND get_user_board_role(wp.board_id, auth.uid()) IS NOT NULL
    )
  );

-- Solo se pueden crear/editar items cuando el plan está en draft
CREATE POLICY "Asistentes y admins crean items en planes draft"
  ON public.weekly_plan_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_plans wp
      WHERE wp.id = plan_id
        AND wp.status = 'draft'
        AND get_user_board_role(wp.board_id, auth.uid()) IN ('admin', 'assistant')
    )
  );

CREATE POLICY "Edición de items solo en planes draft"
  ON public.weekly_plan_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plans wp
      WHERE wp.id = plan_id
        AND wp.status = 'draft'
        AND get_user_board_role(wp.board_id, auth.uid()) IN ('admin', 'assistant')
    )
  );

CREATE POLICY "DELETE de items solo en planes draft"
  ON public.weekly_plan_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plans wp
      WHERE wp.id = plan_id
        AND wp.status = 'draft'
        AND get_user_board_role(wp.board_id, auth.uid()) IN ('admin', 'assistant')
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

-- Líderes, asistentes y admins registran ejecuciones
CREATE POLICY "Líderes y asistentes registran ejecuciones"
  ON public.weekly_plan_item_executions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_plan_items wpi
      JOIN   public.weekly_plans wp ON wp.id = wpi.plan_id
      WHERE  wpi.id = plan_item_id
        AND  wp.status IN ('published', 'in_progress')
        AND  get_user_board_role(wp.board_id, auth.uid())
               IN ('admin', 'assistant', 'leader', 'supervisor')
    )
  );

-- Edición: solo el creador o admin; solo ejecuciones draft o reported
CREATE POLICY "Edición de ejecuciones propias no verificadas"
  ON public.weekly_plan_item_executions FOR UPDATE
  USING (
    (created_by = auth.uid() AND status IN ('draft', 'reported'))
    OR EXISTS (
      SELECT 1 FROM public.weekly_plan_items wpi
      JOIN   public.weekly_plans wp ON wp.id = wpi.plan_id
      WHERE  wpi.id = plan_item_id
        AND  get_user_board_role(wp.board_id, auth.uid()) IN ('admin', 'supervisor')
    )
  );

-- DELETE: bloqueado — los eventos de ejecución son inmutables
CREATE POLICY "DELETE de ejecuciones bloqueado"
  ON public.weekly_plan_item_executions FOR DELETE
  TO authenticated USING (false);
