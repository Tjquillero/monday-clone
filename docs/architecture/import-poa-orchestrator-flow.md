# Flujo del orquestador de importación del POA (`importPoaService`)

Referencia arquitectónica, no un ADR — una página para que el orquestador no se convierta en una clase que mezcla parser, validación, consultas a Supabase y llamadas SQL. Cada caja de este flujo es responsabilidad de un módulo distinto; `importPoaService` solo los conecta en orden, sin reimplementar ninguna de sus reglas.

```
Excel (ArrayBuffer)
      │
      ▼
parsePoaExcel()                    src/lib/poaImport/parseExcel.ts
      │
      ▼
validateParsedPoa()                src/lib/poaImport/validate.ts
      │
      ├── errors no vacíos ──────► validationErrors
      ▼
resolveZoneMappings()              (por construir — consulta poa_zone_mappings)
      │
      ├── zona sin mapear ───────► unresolvedZones
      ▼
(actividades frecuencia_pendiente_regla_negocio, ya separadas por validate.ts)
      │
      ├── alguna presente ───────► ambiguousFrequencyActivities
      ▼
  ¿unresolvedZones ∪ ambiguousFrequencyActivities ∪ validationErrors ≠ ∅?
      │
      ├── sí ────────────────────► createBlockedResult({ ... })  →  ImportPoaResult 'blocked'
      ▼ no
buildImportPayload()               (por construir — ValidatedActivity[] → JSON snake_case)
      │
      ▼
import_poa_version()               supabase/migrations/20260721-25_import_poa_version*.sql
      │
      ├── SQLSTATE / RAISE ───────► ImportPoaResult 'persistence_failed'
      ▼
ImportPoaResult 'success'
```

## Reglas de esta capa

- `importPoaService` **no valida nada por su cuenta**. Cada caja de arriba ya decide qué es válido; el orquestador solo enruta el resultado hacia el `ImportPoaResult` correspondiente.
- `resolveZoneMappings()` es la única pieza nueva de lógica propia de esta capa (no existía en `src/lib/poaImport/`) — consulta `poa_zone_mappings` por `poa_id` + `excel_zone_name` y devuelve, para cada zona detectada por el parser, un `group_id` resuelto o `undefined`. No decide qué hacer si falta uno — eso lo decide el orquestador, empaquetándolo en `blocked`.
- `buildImportPayload()` es una función pura de mapeo (`ValidatedActivity[]` + resolución de zonas → el JSON exacto que espera `import_poa_version()`, ver [`import-poa-version-contract.md`](./import-poa-version-contract.md)) — no debería contener ninguna decisión, solo traducción de forma.
- Los tres motivos de `blocked` se acumulan a lo largo del flujo (no se corta en el primero) — un mismo intento puede tener zonas sin mapear Y actividades del Grupo B Y errores de validación a la vez, y `createBlockedResult()` los recibe juntos.
- `import_operation_id` se genera **dentro del orquestador**, una vez por invocación de `importPoaVersion()` — nunca antes (el parser/validador no lo necesitan) ni lo decide el llamador de la UI.

## Documentos relacionados

- [`import-poa-version-contract.md`](./import-poa-version-contract.md) — contrato de la función SQL que este flujo invoca al final.
- [`poa-excel-import-design.md`](./poa-excel-import-design.md) — diseño del parser y la estructura del Excel.
- `src/lib/poaImport/service/types.ts` — contrato de `ImportPoaResult`/`ImportPoaInput` que este flujo produce.
