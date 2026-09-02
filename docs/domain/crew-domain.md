# Definición y Reglas del Dominio: Asignación de Cuadrillas y Recursos Operativos (Crew & Operational Resource Assignment Domain v1)

## Estado
**Congelado v1 (2026-09-02).** El modelo de asignación de cuadrillas, líderes de sitio, dotación de personal (`worker_count`), cálculo de jornales operativos de campo e inmutabilidad post-certificación quedan formalmente consolidados.

## Principio Rector
> [!IMPORTANT]
> **La cuadrilla es un recurso de la operación, no del contrato.**
> Asignar, reasignar o cambiar una cuadrilla, líder o cantidad de trabajadores modifica la gestión logística de terreno, pero **nunca reescribe ni altera el valor contractual de las metas planificadas (`planned_qty`), cantidades ejecutadas (`executed_qty`), tarifas del POA ni los valores facturados en Actas**.

---

## Glosario y Estructura Operativa
- **Cuadrilla (`crew_name`)**: Agrupación operativa de trabajadores asignada a ejecutar una actividad en una fecha/sitio determinada.
- **Líder de Cuadrilla (`crew_leader_id`)**: Referencia a la persona responsable de reportar la jornada en terreno (FK a `personnel.id`).
- **Dotación de Campo (`worker_count`)**: Número físico de personas presentes durante la jornada de trabajo ($\text{worker\_count} \ge 1$).
- **Jornal Operativo (`executed_jr`)**: Medida de esfuerzo físico de terreno generada automáticamente:
  $$\text{executed\_jr} = \frac{\text{worker\_count} \times \text{duración (segundos)}}{28800 \text{ s (8 horas)}}$$

---

## Las 7 Reglas de Negocio e Invariantes del Dominio

### 1. Invariable Trinomio de Jornales y Personal (No Mezclar)
Queda prohibido confundir o unificar los tres conceptos de esfuerzo:
$$\text{planned\_jr (POA Contractual)} \neq \text{executed\_jr (RA Operativo)} \neq \text{worker\_count (Personas físicas)}$$
- `planned_jr`: Proyección contractual derivada de rendimiento y frecuencia.
- `executed_jr`: Medida de esfuerzo real invertido en campo.
- `worker_count`: Cabeceo de personas físicas presentes en la cuadrilla.

### 2. Aislamiento Contractual Total
Modificar la cuadrilla, el líder o la dotación de personal:
- **NO altera** `planned_qty` ni `planned_jr`.
- **NO altera** `executed_qty` (avance volumétrico físico).
- **NO altera** los precios unitarios de la versión del POA activa.
- **NO altera** la `cantidad_facturada` ni los importes monetarios de las Actas.

### 3. Inmutabilidad Post-Certificación (`VERIFIED` / `REJECTED`)
Una vez una ejecución es aprobada (`verified`) o rechazada (`rejected`) por el supervisor:
- `crew_name`, `crew_leader_id`, `worker_count`, `started_at` y `finished_at` **quedan congelados e inmutables**.
- No se permite la reasignación retroactiva de cuadrillas sobre jornadas ya auditadas, preservando la trazabilidad histórica de quién ejecutó el trabajo.

### 4. Trazabilidad de Roles y Personal
- La tabla `personnel` almacena el catálogo de trabajadores y líderes.
- Las tarifas por defecto (`personnel.default_rate`) son estrictamente informativas para análisis de costos operativos de campo; **nunca alimentan fórmulas de liquidación de Actas**.

### 5. Edición Exclusiva durante el Registro Inicial (`draft`)
La reasignación de cuadrilla o ajuste de `worker_count` solo es permitida mientras la ejecución permanece en estado `draft` y únicamente por el líder creador o asistente autorizado.

### 6. Independencia de la Ejecución Volumétrica
Una cuadrilla de 10 trabajadores ejecutando $30\text{ m}^2$ y una cuadrilla de 2 trabajadores ejecutando los mismos $30\text{ m}^2$:
- Producen exactamente el mismo avance contractual ($30\text{ m}^2$ ejecutados).
- Generan distintos jornales operativos reales (`executed_jr`), alimentando la matriz de rendimiento futuro de la agenda, sin afectar el derecho de cobro contractual.

### 7. Trazabilidad Auditoría en Registros
Toda asignación graba `created_by` y `updated_by` vinculados a `auth.users`, manteniendo la auditoría de quién realizó la asignación en la plataforma.
