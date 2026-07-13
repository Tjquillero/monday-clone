# Reglas de Desarrollo - Monday Clone (Mantenix)

## Hito: Board Engine v1 Stable

El motor de columnas de tableros (Board Engine v1) ha alcanzado un estado **estable** y queda oficialmente **congelado**. Las capacidades funcionales consolidadas y verificadas son:
- [x] Separación estricta entre `id` (UUID del sistema) y `key` (semántica/legacy).
- [x] CRUD completo de columnas (Creación, Lectura, Actualización, Eliminación).
- [x] Plantillas de tableros (Templates) normalizadas.
- [x] Soporte para Drag & Drop (reordenamiento de columnas y cambio de grupos).
- [x] Vistas múltiples (Tablero, Gantt, Financiera).
- [x] Filtros y persistencia de estado.
- [x] Widgets financieros compatibles y cálculo unificado de métricas.
- [x] Cobertura de pruebas unitarias robusta.

## Reglas Estrictas de Modificación del Motor
1. **No más refactors preventivos o estéticos:** Queda estrictamente prohibida cualquier refactorización preventiva o de limpieza estética sobre la arquitectura de columnas, lógica de resolución de llaves, o componentes estructurales del motor.
2. **Excepciones de Modificación:** Solo se permite modificar el motor de columnas o sus abstracciones bajo los siguientes tres escenarios específicos:
   - Corrección de bugs funcionales comprobados.
   - Resolución de problemas de rendimiento demostrables.
   - Implementación de nuevas funcionalidades que requieran indispensablemente ampliar el modelo de datos.
3. **Justificación de Cambios en Abstracciones:** *Antes de modificar una abstracción existente, el desarrollador o agente debe demostrar con evidencia que el cambio corrige un bug real o habilita una funcionalidad del roadmap de negocio.*

## Módulo Financiero y de Costos (Regla de Llaves Estables)
- Para ítems financieros (`isFinancialItem` es `true`), se debe evitar la resolución dinámica de columnas y usar siempre las llaves estables e invariables de base de datos (`cant`, `unit_price`, `executed_qty`, `unit`, `rubro`, `category`).
- El procesamiento y la extracción de datos financieros de los ítems **debe** hacerse exclusivamente a través de la utilidad centralizada `getFinancialValues(item, columns)`.
- Para ítems de actividad (tareas estándar), sí se utiliza el mapeo dinámico resolviendo la llave con `getColumnValueKey(column)`.

## Roadmap de Producto (Prioridades)

> Lista original al momento de este documento. Dos entradas ya no reflejan el estado real del producto — se corrigen aquí en vez de dejarlas como una premisa falsa para quien lea este archivo:
> - ~~Órdenes de trabajo~~ — **retirado del roadmap**, no corregido. El proceso real de Mantenix no tiene órdenes de trabajo; el módulo se eliminó por completo (código, tablas, navegación) según la congelación de navegación (`project_navigation_freeze`, commit `ddefb2f`, migración `20260712_drop_work_orders`). No reintroducir sin una decisión explícita nueva del propietario del producto.
> - ~~Actas de cobro / avances de facturación~~ — **completado** (Incremento 5: dominio, RLS, UI, PDF — commits `ec91aed`..`4ff2bdf`).

El esfuerzo de desarrollo debe centrarse de manera exclusiva en construir y completar las siguientes funcionalidades pendientes del producto (valor de negocio percibido por el usuario):
- Cronogramas de mantenimiento
- Cuadrillas de operadores
- Programación de tareas
- Gestión de recursos
- Seguimiento de ejecución en campo
- Control de costos reales
- Dashboards ejecutivos para supervisores
- Notificaciones en tiempo real
- Automatizaciones de flujos de trabajo
