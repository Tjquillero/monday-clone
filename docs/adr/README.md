# Architecture Decision Records (ADR) — Mantenix

Este directorio registra las decisiones de arquitectura del proyecto: **por qué** se tomó una decisión, no **qué** es el negocio (eso vive en [`docs/domain/`](../domain/README.md)) ni **cómo** se implementa (eso vive en el código).

| Artefacto | Propósito |
|---|---|
| `docs/domain/` | Define el negocio |
| `docs/adr/` (este directorio) | Explica por qué se tomó una decisión |
| Código fuente, migraciones y APIs | Implementan la decisión |

## Índice

| ADR | Título | Estado |
|---|---|---|
| [ADR-0001](./ADR-0001-domain-freeze.md) | Congelamiento del Dominio POA v1 | Aceptado |

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
