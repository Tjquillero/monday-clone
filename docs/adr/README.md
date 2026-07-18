# Architecture Decision Records (ADR) — Mantenix

Este directorio registra las decisiones de arquitectura del proyecto: **por qué** se tomó una decisión, no **qué** es el negocio (eso vive en [`docs/domain/`](../domain/README.md)) ni **cómo** se materializa hoy (eso vive en `docs/architecture/` y en el código).

| Artefacto | Propósito |
|---|---|
| `docs/domain/` | Define el negocio |
| `docs/adr/` (este directorio) | Explica por qué se tomó una decisión |
| `docs/architecture/` | Traduce un concepto del dominio a su implementación actual (mapeos que envejecen con el código) |
| `docs/discovery/` | Evidencia de investigación sobre una decisión que aún depende de alguien fuera del repositorio. No es un ADR — se promueve a uno solo cuando esa decisión externa exista |
| Código fuente, migraciones y APIs | Implementan la decisión |

## Índice

| ADR | Título | Estado |
|---|---|---|
| [ADR-0001](./ADR-0001-domain-freeze.md) | Congelamiento del Dominio POA v1 | Aceptado |
| [ADR-0002](./ADR-0002-schedule-contractual-source.md) | Fuente Contractual del Cronograma | Aceptado |
| [ADR-0003](./ADR-0003-billing-source.md) | Fuente y Mecanismo de Generación del Acta | Aceptado (con 2 puntos pendientes de confirmación) |
| [ADR-0004](./ADR-0004-poa-zone-catalog.md) | Catálogo de Zonas del POA y Mapeo Persistente con el Board | Aceptado |
| [ADR-0005](./ADR-0005-poa-frecuencia-ausente.md) | Frecuencia Ausente como Estado de Negocio Válido | Aceptado |
| [ADR-0006](./ADR-0006-execution-engine-consolidation.md) | Consolidación del Motor de Ejecución — `ExecutionView` deja de ser el motor operativo | Aceptado |
| [ADR-0007](./ADR-0007-daily-execution-legacy-model.md) | Retiro progresivo de `daily_execution` como fuente operativa | Propuesto |

## Estados

- **Propuesto** — en discusión, aún no vinculante.
- **Aceptado** — vigente, guía las decisiones de implementación.
- **Reemplazado** — existe un ADR posterior que lo sustituye; ambos se referencian mutuamente.
- **Obsoleto** — dejó de aplicar sin que otra decisión ocupe su lugar.

## Convención

- Un ADR nuevo por decisión arquitectónica relevante (no por cada commit).
- Numeración secuencial: `ADR-000N-titulo-en-kebab-case.md`.

## Principio

Un ADR representa el contexto y la decisión tomada en un momento determinado. Su contenido no se reescribe para reflejar decisiones posteriores. Cuando una decisión cambie, deberá emitirse un nuevo ADR que referencie al anterior y explique el motivo del cambio.

Esta convención sigue el enfoque de Architecture Decision Records (ADR), adaptado a las necesidades de Mantenix.
