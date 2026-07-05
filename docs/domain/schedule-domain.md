# Definición y Reglas del Dominio: Cronograma / Planificación (Schedule)

**Estado: Propuesto — primera versión, alcance limitado a Programación.**

## Introducción
Este documento describe el subdominio de Cronograma/Planificación de Mantenix. Deriva del dominio contractual del POA ([`poa-domain.md`](./poa-domain.md), Congelado v1) sin modificarlo, y se articula con el ciclo de estados del negocio ya congelado en [`workflow.md`](./workflow.md), del cual no duplica las transiciones — las referencia.

## Alcance
De las áreas conceptuales de este subdominio (Programación, Asignaciones, Calendario, Dependencias, Reprogramación), esta versión cubre únicamente **Programación**. El resto queda fuera de alcance (ver "Fuera de Alcance"), para no documentar como vigente algo que todavía no forma parte del negocio operativo.

---

## Conceptos Fundamentales

### ¿Qué es la Programación?
La Programación es la representación temporal de planificación que organiza, para una zona y un período determinado, qué Actividades del POA deben ejecutarse, en qué orden y con qué prioridad. Se materializa en un **Plan Semanal**.

*   **No es el contrato:** no modifica, reemplaza ni complementa la información contractual de la versión del POA de la que deriva (Principio de Desacoplamiento del Cronograma).
*   **No es la ejecución:** un Plan Semanal define qué se espera ejecutar; el registro de lo efectivamente ejecutado pertenece al subdominio de Ejecución.
*   **Es efímera respecto al POA, pero trazable:** cada Plan Semanal queda congelado a la versión del POA vigente al momento de su creación; una nueva versión del POA no altera planes ya generados.

### Fuente Contractual
La Programación deriva exclusivamente del dominio contractual del POA, conforme a `poa-domain.md`. Las decisiones de implementación que materializan esta derivación pertenecen a la documentación de arquitectura, no a este documento.

---

## Glosario y Definiciones del Dominio

*   **Plan Semanal:** Agrupa, para una zona y un período, las Actividades del POA programadas. Tiene un ciclo de vida propio, gobernado por el contrato de estados congelado en `workflow.md`.
*   **Línea Programada:** La incorporación de una Actividad del POA a un Plan Semanal. Es un **snapshot**: conserva el rendimiento y la frecuencia vigentes al momento de planificar, de modo que un período pasado pueda reconstruirse sin depender del estado actual del contrato (Principio de Reproducibilidad Histórica, `poa-domain.md`).
*   **Prioridad de Planificación:** Atributo propio de este subdominio que determina el orden de asignación de capacidad cuando no alcanza para programar todas las Actividades candidatas de un período. No es un término contractual y nunca afecta precio, frecuencia o facturación.
*   **Cantidad Planificada:** Cantidad que la Programación decide ejecutar en el período para una Actividad. Distinta de la Cantidad Contratada (`poa-domain.md`): la planificada es una decisión operativa de reparto; la contratada es el límite contractual de referencia contra el cual se compara el acumulado ejecutado.
*   **Capacidad Estimada:** Estimación del esfuerzo requerido para ejecutar la Cantidad Planificada, usada para dimensionar cuadrillas. No es un compromiso contractual.
*   **Secuencia Programada:** Orden de una Línea Programada dentro de su Plan Semanal.

---

## Principios Rectores

> [!IMPORTANT]
> **Herencia del Desacoplamiento del Cronograma:** Todo lo definido en este documento opera bajo el principio ya congelado en `poa-domain.md`: la Programación es una proyección temporal derivada, nunca una fuente contractual. Ante cualquier conflicto aparente entre este documento y `poa-domain.md`, prevalece `poa-domain.md` (regla de precedencia, `docs/domain/README.md`).

> [!IMPORTANT]
> **Snapshot sobre referencia viva:** Una Línea Programada nunca recalcula sus valores contra el estado actual de la fuente contractual una vez creada. Copia los valores vigentes al momento de planificar. Esto permite que un plan de un período anterior siga siendo auditable aunque el POA haya cambiado de versión desde entonces.

> [!TIP]
> **La Prioridad no es un derecho de cobro:** la Prioridad de Planificación decide qué se programa primero cuando falta capacidad; no decide qué se paga ni en qué orden. Confundir prioridad de planificación con prioridad de facturación mezclaría este subdominio con el de Facturación (`billing-domain.md`, pendiente).

---

## Reglas de Negocio del Subdominio

Las transiciones de estado del Plan Semanal están **congeladas en `workflow.md`** y no se repiten aquí. Las siguientes reglas son propias de este subdominio:

### Regla S1: Origen Contractual Único
Toda Línea Programada debe originarse en exactamente una Actividad del POA perteneciente a la versión del POA vigente al momento de crear el Plan Semanal. Ninguna Línea Programada puede crearse a partir de una actividad ajena al catálogo contractual vigente (consistente con la Regla 13 de `poa-domain.md`).

### Regla S2: Inmutabilidad del Snapshot
Una vez creada una Línea Programada, sus valores de rendimiento y frecuencia no se recalculan contra cambios posteriores en la fuente contractual o técnica. Un cambio posterior en la Actividad del POA o en el Catálogo Técnico no altera planes ya generados; solo aplica a planes futuros.

### Regla S3: Edición Limitada al Borrador
Las Líneas Programadas solo pueden agregarse, modificarse o eliminarse mientras el Plan Semanal se encuentre en su estado inicial de edición, según el contrato de estados de `workflow.md`. Una vez publicado, la lista de actividades programadas queda fija para ese período; su corrección posterior es competencia del subdominio de Ejecución, no de la Programación.

### Regla S4: La Prioridad no Reordena el Contrato
La Prioridad de Planificación afecta únicamente el orden de asignación de capacidad dentro de la Programación. No debe usarse para alterar el orden de facturación, verificación o liquidación.

---

## Fuera de Alcance

Estas áreas pertenecen conceptualmente al subdominio de Cronograma/Planificación, pero no forman parte del alcance de esta versión:

*   **Asignaciones:** este subdominio no define hoy un paso de planificación que asigne cuadrilla o líder a una Línea Programada antes de la ejecución. Esa asignación pertenece al subdominio de Ejecución.
*   **Calendario:** no existe una entidad ni vista de calendario propia de este subdominio, más allá de la ubicación temporal del Plan Semanal.
*   **Dependencias:** el negocio puede requerir relaciones de precedencia entre actividades, pero este subdominio no las define todavía sobre Actividades del POA.
*   **Reprogramación:** no forma parte del alcance de esta versión.

Cuando cualquiera de estas áreas empiece a formar parte del negocio operativo, se incorpora aquí como una nueva sección de reglas — no se diseña por anticipado.

---

## Diagrama de Dominio

```
POA
 └── Versión del POA
      └── Actividad del POA
           └── Cobertura por Zona
                └── Plan Semanal
                     └── Línea Programada
```
