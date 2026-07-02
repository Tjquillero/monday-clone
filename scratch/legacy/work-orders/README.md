# Módulo Work Orders — en cuarentena (2026-07-01)

Retirado de la aplicación por decisión de dominio: el proceso real no tiene
"órdenes de trabajo". El flujo es Cronograma (asistente publica) → Actividades
(líder registra jornadas) → Verificación (supervisor aprueba/rechaza).

Este código nunca llegó a commitearse. Se conserva aquí porque contiene
infraestructura reutilizable para los futuros módulos **Actividades** y
**Verificación**:

| Archivo | Qué reutilizar |
|---|---|
| `components/WorkOrderDrawer.tsx` | Patrón de drawer lateral con secciones: fechas planificadas, consumo de materiales e insumos, comentarios |
| `useWorkOrders.ts` | Patrón CRUD offline-first completo (Supabase + fallback IndexedDB + cola de mutaciones) |

Las migraciones `20260706` (schema) y `20260707` (seeds) NO están aquí:
son historia aplicada registrada en `supabase_migrations.schema_migrations`
y viven en `supabase/migrations/`. La limpieza de la base se hace con
`20260712_drop_work_orders.sql`, que conserva las tablas genéricas
`entity_attachments` y `entity_history` (polimórficas, sin FK al módulo).

Cuando Actividades y Verificación estén construidos y lo útil haya sido
portado, esta carpeta se borra.
