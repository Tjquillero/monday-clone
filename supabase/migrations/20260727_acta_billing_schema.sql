-- =============================================================================
-- Incremento 5, Commit 1/N: esquema del Acta de Cobro
-- Ref: docs/architecture/acta-billing-design.md, docs/domain/poa-domain.md
--      (Regla 7), docs/adr/ADR-0003-billing-source.md ("Mecanismo de
--      emisión del Acta").
--
-- Alcance deliberadamente estrecho, solo modelo relacional:
--   - Tablas, PK, FK, NOT NULL, CHECK de una sola fila, índices de soporte.
--   - NADA de RLS, políticas, funciones, triggers, generación automática
--     del borrador, validación de saldo facturable entre filas, ni emisión.
--     Todo eso pertenece a incrementos posteriores (el generador ya
--     necesita, por ejemplo, verificar SUM(cantidad_consumida) por
--     ejecución contra su cantidad certificada — una restricción que cruza
--     filas, no expresable como CHECK de una sola fila en Postgres).
--
-- Jerarquía: actas (1) -> acta_items (N) (1) -> acta_item_sources (N) (1) -> execution.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. actas — documento contractual de facturación
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.actas (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id      UUID        NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,

  -- Consecutivo contractual (hoy: 37), continuo entre años, independiente
  -- del calendario (Regla 7, poa-domain.md). Nullable: se asigna al emitir,
  -- no al crear el borrador (docs/architecture/acta-billing-design.md).
  -- Múltiples borradores con numero=NULL no chocan entre sí bajo UNIQUE.
  numero        INT         CHECK (numero > 0),

  estado        TEXT        NOT NULL DEFAULT 'draft'
                             CHECK (estado IN ('draft', 'issued')),
  fecha         DATE,
  observaciones TEXT,

  generated_by  UUID        NOT NULL REFERENCES auth.users(id),
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by     UUID        REFERENCES auth.users(id),
  issued_at     TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (board_id, numero),

  -- CHECK de una sola fila (todas las columnas viven en esta misma tabla) —
  -- consistencia interna del estado 'issued', mismo patrón ya usado en
  -- weekly_plan_item_executions (CHECK status != 'verified' OR verified_by
  -- IS NOT NULL).
  CHECK (estado != 'issued' OR (numero IS NOT NULL AND issued_by IS NOT NULL AND issued_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_actas_board ON public.actas (board_id);

COMMENT ON TABLE  public.actas IS
  'Documento contractual de facturación. No representa una ejecución ni una versión del POA — es el documento mediante el cual se cobran una o más cantidades previamente certificadas. Ver docs/architecture/acta-billing-design.md.';
COMMENT ON COLUMN public.actas.numero IS
  'Consecutivo único del contrato (por board), continuo entre años. NULL mientras estado=draft; se asigna al emitir.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. acta_items — línea de facturación (exactamente una poa_activity por línea)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.acta_items (
  id                        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_id                   UUID    NOT NULL REFERENCES public.actas(id) ON DELETE CASCADE,

  -- Exactamente una actividad por línea (Regla 14, Origen Único del Cobro) —
  -- nunca se combinan dos actividades en una sola línea, aunque compartan
  -- precio o descripción. RESTRICT, no CASCADE: una poa_activity referenciada
  -- por una línea de facturación no debería poder desaparecer por una
  -- eliminación en cascada (Regla 19, conservación histórica).
  poa_activity_id           UUID    NOT NULL REFERENCES public.poa_activities(id) ON DELETE RESTRICT,

  -- Snapshot — congelado al emitir el acta (mientras draft, se recalcula
  -- contra la versión active del POA; ver ADR-0003, Regla de negocio
  -- central). Ese recálculo es lógica de un incremento posterior; aquí solo
  -- se define dónde vive el valor congelado.
  descripcion_snapshot      TEXT    NOT NULL,
  unidad_snapshot           TEXT    NOT NULL,
  precio_unitario_snapshot  NUMERIC NOT NULL CHECK (precio_unitario_snapshot >= 0),

  -- Suma de acta_item_sources.cantidad_consumida para esta línea. No es un
  -- valor derivable como columna GENERATED (agregaría sobre filas hijas,
  -- Postgres no lo permite) — lo mantiene correcto el generador/editor del
  -- borrador, en un incremento posterior.
  cantidad_facturada        NUMERIC NOT NULL DEFAULT 0 CHECK (cantidad_facturada >= 0),

  -- Sí es una columna GENERATED válida: ambos operandos viven en esta misma
  -- fila (mismo patrón que weekly_plan_item_executions.executed_jr).
  valor_total               NUMERIC GENERATED ALWAYS AS (cantidad_facturada * precio_unitario_snapshot) STORED,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acta_items_acta          ON public.acta_items (acta_id);
CREATE INDEX IF NOT EXISTS idx_acta_items_poa_activity  ON public.acta_items (poa_activity_id);

COMMENT ON TABLE  public.acta_items IS
  'Línea de facturación de un acta. No representa una actividad del POA ni una ejecución — representa el cobro de una cantidad determinada de UNA actividad contractual. Exactamente un poa_activity_id por línea.';
COMMENT ON COLUMN public.acta_items.cantidad_facturada IS
  'Suma de acta_item_sources.cantidad_consumida para esta línea. Mantenida por el generador/editor del borrador (incremento posterior), no por un trigger en este commit.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. acta_item_sources — de dónde sale la cantidad de una línea
--    (resuelve: una línea puede alimentarse de varias ejecuciones; una
--    ejecución puede alimentar varias líneas en distintas actas)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.acta_item_sources (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_item_id       UUID    NOT NULL REFERENCES public.acta_items(id) ON DELETE CASCADE,

  -- RESTRICT, no CASCADE: una ejecución ya facturada (parcial o totalmente)
  -- no debería poder desaparecer por una eliminación en cascada.
  execution_id       UUID    NOT NULL REFERENCES public.weekly_plan_item_executions(id) ON DELETE RESTRICT,

  cantidad_consumida NUMERIC NOT NULL CHECK (cantidad_consumida > 0),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acta_item_sources_item      ON public.acta_item_sources (acta_item_id);
CREATE INDEX IF NOT EXISTS idx_acta_item_sources_execution ON public.acta_item_sources (execution_id);

COMMENT ON TABLE  public.acta_item_sources IS
  'Porción de la cantidad certificada de una ejecución que una línea de acta consume. Una línea puede alimentarse de varias ejecuciones; una ejecución puede alimentar varias líneas en distintas actas (facturación parcial, Regla 7 de poa-domain.md). La restricción "SUM(cantidad_consumida) por ejecución <= cantidad certificada" cruza filas — se aplica en un incremento posterior (generador/validación), no aquí.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers de updated_at — mismo patrón que el resto del proyecto
-- (fn_set_updated_at ya existe, definida en migraciones anteriores).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER trig_actas_updated_at
  BEFORE UPDATE ON public.actas
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE TRIGGER trig_acta_items_updated_at
  BEFORE UPDATE ON public.acta_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
