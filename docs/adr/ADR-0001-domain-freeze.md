# ADR-0001 — Congelamiento del Dominio POA v1

## Estado
Aceptado

## Fecha
2026-07-05

## Contexto
El Plan Operativo Anual (POA) es el instrumento contractual que gobierna la planificación, programación, ejecución, verificación, liquidación y facturación del contrato de mantenimiento. Antes de esta decisión, conceptos como el precio unitario, la frecuencia contractual, la cantidad contratada y la vigencia de una versión estaban descritos de forma incompleta o implícita, lo que dejaba abierto el riesgo de que futuras implementaciones (modelo de datos, APIs, lógica de negocio) reinterpretaran el contrato en lugar de reflejarlo.

## Decisión
Se congela la versión 1 del dominio contractual del POA en `docs/domain/poa-domain.md`, como especificación canónica de la cual deben derivarse el modelo de datos, las reglas de negocio y las APIs — nunca al revés. El documento define:

- POA_ACTIVITY como la unidad contractual fundamental del sistema.
- Diecinueve reglas de negocio invariantes (Reglas 1-19), incluyendo la inmutabilidad del precio (Regla 17), la inmutabilidad de la frecuencia (Regla 18) y la conservación histórica / no eliminación física (Regla 19).
- La cantidad contratada como referencia simétrica: la ejecución puede ser inferior, igual o superior, sin que la ejecución modifique nunca la cantidad contractual.
- La vigencia de una versión, que termina por publicación de una nueva versión o por finalización del contrato.
- El principio de Desacoplamiento del Cronograma: el cronograma es una representación temporal derivada del POA vigente y no modifica, reemplaza ni complementa la información contractual.

Se establece además `docs/domain/README.md` como índice del dominio, con una regla explícita de precedencia: ante conflicto entre el dominio, el modelo de datos, las APIs, el código fuente o la documentación técnica, prevalece el documento marcado como Congelado.

## Alternativas consideradas
- **Mantener el dominio implícito en el código.** Descartada: el conocimiento del negocio quedaría disperso en implementaciones puntuales, sin una fuente única verificable.
- **Documentar únicamente el modelo de datos.** Descartada: un esquema de tablas no expresa invariantes de negocio (por qué el precio es inmutable, por qué la cantidad ejecutada no altera el contrato), solo su forma final.
- **Posponer el congelamiento hasta finalizar la implementación.** Descartada: invierte el orden deseado (negocio → dominio → implementación) y aumenta el riesgo de que el código termine definiendo el negocio por omisión.

Las tres alternativas incrementaban el riesgo de divergencia entre negocio e implementación, que es exactamente lo que este ADR busca prevenir.

## Consecuencias
- El modelo de datos, las políticas RLS, las APIs y las pruebas relacionadas con el POA deben alinearse con `poa-domain.md`, no al revés.
- Cualquier propuesta que contradiga un invariante congelado (ej. permitir editar el precio de una Actividad del POA dentro de la misma versión) requiere primero una nueva versión del dominio, no un ajuste silencioso en el código.
- Los subdominios futuros (Cronograma/Planificación, Ejecución, Facturación) se documentan en sus propios archivos (`schedule-domain.md`, `execution-domain.md`, `billing-domain.md`, marcados como Planeado en el índice), referenciando al POA sin reabrir su contrato conceptual.

## Documentos afectados
- `docs/domain/poa-domain.md` (creado/congelado v1)
- `docs/domain/README.md` (creado, índice y regla de precedencia)
- `docs/domain/workflow.md` (referenciado; sin cambios en este ADR)

## Criterio para una futura v2
Una nueva versión del dominio (v2) solo podrá emitirse cuando exista un cambio en las reglas del negocio. Cambios motivados exclusivamente por la implementación, el modelo de datos o limitaciones técnicas no justifican una nueva versión del dominio.
