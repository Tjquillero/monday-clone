# Política de fixtures: documentos operativos reales en el repo

**Contexto:** este repositorio es **público** en GitHub. Varios importadores (POA, Resource Analysis) verifican su parser contra una copia de un Excel operativo real, comiteada en la raíz del repo — necesario para no depender de fixtures inventados que podrían no representar fielmente los quiebres reales del documento (ver la disciplina de discovery en `docs/domain/`).

## Regla

**Los archivos Excel incluidos en el repositorio son versiones saneadas de los documentos operativos, nunca el original sin editar.** Se preserva toda la estructura necesaria para las pruebas — hojas, bloques, actividades, cantidades, rendimientos, frecuencias, fórmulas — pero se reemplaza cualquier dato que no aporte a los tests y que exponga información interna:

- **Nombres de personas reales** → reemplazados por un identificador genérico (ej. "Operario").
- **Tarifas salariales / jornales en pesos** → reemplazadas por un valor ficticio consistente (ej. `80000`), recalculando cualquier total dependiente (fórmulas de Excel que multiplican o suman esa tarifa) para que el archivo siga siendo internamente coherente si alguien lo abre en Excel.
- **Cualquier otro dato que el equipo identifique como sensible** al hacer el discovery de un documento nuevo, aunque no esté en esta lista.

**Lo que NO se sanea** — porque los tests dependen de que sea exactamente el dato real: nombres de hojas, cantidades contratadas, rendimientos, frecuencias, precios unitarios (cuando el propio dominio los trata como públicos del contrato, ej. POA), estructura de bloques, fórmulas de cálculo.

## Por qué existe esta política

Un repositorio público tiene memoria infinita — un archivo real subido "por error" y luego corregido sigue estando en el historial de git para siempre, salvo una reescritura de historia deliberada (que tiene su propio costo y riesgo). La sanitización se hace **antes** de comitear, no después.

## Registro de fixtures saneados

| Archivo | Documento original | Qué se saneó | Fecha |
|---|---|---|---|
| `COSTOS GENERALES (V2).xlsx` | Resource Analysis operativo (`docs/domain/resource-analysis-domain.md`) | Tarifa salarial recurrente (79.773,16 → 80.000 ficticio, totales recalculados) + 1 nombre propio ("Omar" → "Operario") en la hoja `DETALLE DE GRUPO` | 2026-07-21 |
| `POA 2026 V.02 Ene.26-2026.xlsx` | POA 2026 (`docs/domain/poa-domain.md`) | **Pendiente de revisión** — comiteado antes de que existiera esta política; no se auditó todavía si contiene datos que ameriten sanear. | — |

## Cuándo revisar un fixture nuevo antes de comitear

Antes de copiar cualquier Excel/documento operativo real al repo como fixture de test:
1. ¿Aparece algún nombre de persona real en cualquier celda (no solo en las columnas que el parser lee)?
2. ¿Aparece alguna tarifa, salario o costo unitario que no sea información contractual ya pública del dominio (ej. precio unitario del POA, que sí es del contrato)?
3. ¿Aparece cualquier otro dato que un tercero externo a Mantenix no debería poder ver en un repo público?

Si la respuesta a cualquiera es sí, sanear antes de comitear — no depender de "ya se hizo así antes" como justificación. Este documento existe justamente para que ese antes no sea la única evidencia disponible después.
