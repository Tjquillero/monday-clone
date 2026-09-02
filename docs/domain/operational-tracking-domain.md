# Definición y Reglas del Dominio: Seguimiento Operativo y Agenda (Operational Tracking & Agenda Domain v1)

## Estado
**Congelado v1 (2026-09-02).** El modelo de seguimiento operacional, la agenda diaria/semanal por sitio, el semáforo de cumplimiento de 7 días y el desacoplamiento total de almacenamiento redundante quedan formalmente consolidados.

## Principio Rector
> [!IMPORTANT]
> **La Agenda Operativa es una vista derivada de lectura, nunca un almacén de datos.**
> Conforme a la decisión de arquitectura ADR-0006, la agenda mensual/semanal y el seguimiento por sitio leen en tiempo real el estado de `weekly_plans`, `weekly_plan_items`, `weekly_plan_item_executions` y `execution_attachments`. **Nunca escriben datos sueltos ni mantienen copias duplicadas de la información de ejecución.**

---

## Glosario y Conceptos del Dominio
- **Agenda Operativa**: Vista de calendario (semanal / 7 días / diario) que proyecta por sitio las actividades programadas y su estado de ejecución.
- **Semáforo de Cumplimiento**: Indicador visual por día/sitio comparando el avance reportado/verificado frente a la meta planificada.
- **Avance Físico Acumulado**: Proyección del volumen reportado y verificado frente al volumen planificado de la semana.
- **Tasa de Certificación**: Porcentaje de ejecuciones reportadas que ya cuentan con aprobación del supervisor (`status = 'verified'`).

---

## Las 7 Reglas de Negocio e Invariantes del Dominio

### 1. Invariante de Lectura Pura (Read-Only Projection)
La agenda operativa y sus componentes de UI calculan sus métricas exclusivamente mediante consultas de lectura sobre la fuente de verdad. No existe ninguna tabla de "agenda" ni objeto JSONB paralelo para almacenar estados de cumplimiento.

### 2. Fórmula Oficial de Cumplimiento Físico por Sitio
$$\% \text{Cumplimiento Semanal} = \frac{\sum \text{executed\_qty (reported + verified)}}{\sum \text{planned\_qty}} \times 100$$
Donde `planned_qty` proviene del snapshot de `weekly_plan_items` y `executed_qty` de `weekly_plan_item_executions`.

### 3. Tasa de Verificación Técnica por Sitio
$$\% \text{Verificado} = \frac{\sum \text{executed\_qty (verified)}}{\sum \text{executed\_qty (reported + verified)}} \times 100$$
Permite a los directores de proyecto identificar sitios con alta ejecución reportada pero rezago en certificación de supervisión.

### 4. Aislamiento Contractual Total
La agenda operativa es un instrumento de **visibilidad de terreno**. Sus indicadores:
- **NO alteran** el valor planificado (`planned_qty`).
- **NO modifican** el cálculo de jornales contractuales (`planned_jr`).
- **NO afectan** la generación de borradores de Actas ni la elegibilidad de billing.

### 5. Consistencia ante Filtros de Navegación por Sitio
Al filtrar por grupo/sitio o por rango de fechas, la agenda proyecta con precisión absoluta únicamente las ejecuciones pertenecientes a las semanas publicadas o en curso del tablero actual.

### 6. Trazabilidad con Evidencias Fotográficas
La agenda permite al usuario inspeccionar desde la misma vista las evidencias fotográficas asociadas (`execution_attachments`), manteniendo la coherencia con el dominio de evidencias (los tres relojes de tiempo).

### 7. Compatibilidad Offline
En dispositivos sin conexión, la agenda lee directamente del caché de lectura de IndexedDB (`weekly_plans`, `weekly_plan_items`, `weekly_plan_item_executions`), garantizando que la visibilidad de cumplimiento funcione en terreno sin señal.
