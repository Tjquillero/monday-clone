# Registro Histórico de Incidentes de Materialización

**Fecha de Corte**: 21/09/2026 - 23/09/2026

## 1. Incidente de Duplicación por Transición H6.2 (21/09/2026)
* **Causa**: Tras aplicar la normalización canónica de frecuencias en `poa_activities`, las semanas previamente materializadas contenían ítems antiguos basados en la frecuencia previa (ej. `TRASIEGO` con 6 ocurrencias diarias en lugar de 1 semanal).
* **Solución Gobernada**: Ejecución de `syncWeeklyPlanForBoard` determinística que canceló de forma segura 158 ocurrencias derivadas no ejecutadas, preservando inmutables todas las ejecuciones reportadas, confirmadas o con `manual_override = true`.
* **Dictamen**: Materialization Drift histórico resuelto sin tocar la fuente contractual.

## 2. Incidente de Ocultamiento de Sitio por Ausencia de Snapshot (23/09/2026 - Punta Astilleros)
* **Causa**: El sitio **Playa Punta Astilleros** (`dd03bed4-cf5e-4d52-876f-ba906d371174`) carecía de fila en la tabla `resource_analysis`. El servicio `scheduleMaterializationService.ts`, al depender exclusivamente de `resource_analysis.scope_data`, calculó `cantidad = 0` para todas las actividades del sitio.
* **Efecto**: `usePublishedWeekPlans` en la UI de `/my-work` descartó los planes vacíos (`items.length === 0`), provocando la desaparición del sitio en la interfaz.
* **Acción de Gobernanza**: Se revirtió cualquier parche directo sobre `scheduleMaterializationService.ts` para mantener la baseline limpia. Se clasificó el caso como la necesidad del **Hito 6.3 (Gobernanza de Fuentes de Alcance)**.
