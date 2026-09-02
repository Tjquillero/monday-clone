# Definición y Reglas del Dominio: Incidencias de Sitio y Alertas Operativas (Site Incidents & Operational Alerts Domain v1)

## Estado
**Congelado v1 (2026-09-02).** El modelo de registro de novedades de terreno, incidencias climáticas o logísticas, alertas operativas y su aislamiento total de la facturación contractual quedan formalmente consolidados.

## Principio Rector
> [!IMPORTANT]
> **Una incidencia explica la variación operativa; no reescribe la obligación contractual.**
> Registrar una novedad o bloqueo en campo (lluvia, falla de maquinaria, falta de insumos, cierre de acceso) justifica operacionalmente por qué una meta no se alcanzó, pero **nunca altera las metas contratadas (`planned_qty`), las tarifas del POA ni los derechos de cobro de Actas**.

---

## Glosario y Clasificación del Dominio
- **Incidencia de Sitio (`site_incidents`)**: Registro de una novedad u obstáculo operativo en una fecha y sitio (`group_id`) determinado.
- **Categoría de Novedad (`incident_type`)**:
  - `weather`: Factores climáticos (lluvia intensa, vendaval, etc.).
  - `supply`: Desabastecimiento o retraso de insumos/materiales.
  - `equipment`: Falla mecánica o avería de equipos de trabajo.
  - `access`: Cierre de vías, orden público o bloqueo de acceso al sitio.
  - `other`: Otras novedades operativas documentadas.
- **Gravedad Operativa (`severity`)**: Nivel de impacto: `low` (menor), `medium` (parcial), `high` (parálisis total del sitio).

---

## Las 7 Reglas de Negocio e Invariantes del Dominio

### 1. Justificación Operativa Explicativa
Las incidencias alimentan las explicaciones de desempeño y las observaciones automáticas de la IA (`generateExecutionObservations`), justificando la brecha entre la cantidad planificada y la efectivamente ejecutada ($planned\_qty - executed\_qty$).

### 2. Aislamiento Contractual Total
El registro de una incidencia:
- **NO reduce** la cantidad contratada en la zona del POA (`poa_activity_zones.cantidad_contratada`).
- **NO exime** ni modifica retroactivamente la meta planificada (`planned_qty`).
- **NO altera** las fórmulas de jornales contractuales ni la liquidación monetaria de Actas.

### 3. Trazabilidad Temporal de Terreno
Toda incidencia registra la fecha del evento (`incident_date`), el sitio afectado (`group_id`), el usuario que reporta (`reported_by = auth.uid()`) y observaciones detalladas de terreno.

### 4. Independencia de la Ejecución Física
Una jornada de trabajo suspendida por lluvia con $0\text{ m}^2$ ejecutados registra:
- `executed_qty = 0` en `weekly_plan_item_executions`.
- Una incidencia vinculada de tipo `weather`.
La incidencia explica los $0\text{ m}^2$, evitando que la jornada sea facturable ($executed\_qty = 0 \implies \text{No Billing}$).

### 5. Inmutabilidad de Auditoría
Las incidencias cerradas o reportadas no se eliminan silenciosamente; conservan su registro para auditorías operativas posteriores y análisis de fallos recurrentes de capacidad.

### 6. Visibilidad Integrada en la Agenda
Las incidencias activas se proyectan como alertas visuales en la Agenda Operativa por sitio, advirtiendo a los supervisores sobre cuellos de botella en terreno.

### 7. Compatibilidad Offline
La captura de novedades en terreno puede realizarse offline en IndexedDB (`site_incidents`) y se sincroniza mediante la cola de comandos cuando se restablece la conexión, manteniendo su validez explicativa.
