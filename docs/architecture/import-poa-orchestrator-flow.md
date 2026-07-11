# Flujo del orquestador de importación del POA (`importPoaService`)

Referencia arquitectónica, no un ADR — una página para que el orquestador no se convierta en una clase que mezcla parser, validación, consultas a Supabase y llamadas SQL. Cada caja de este flujo es responsabilidad de un módulo distinto; `importPoaService` solo los conecta en orden, sin reimplementar ninguna de sus reglas.

**Estado: el orquestador completo (backend) está implementado — Commits 1-5, `src/lib/poaImport/service/`, 66/66 tests.** Este diagrama usa los nombres reales de las funciones ya construidas, no un plan.

```
Excel (ArrayBuffer)
      │
      ▼
parsePoaExcel()                    src/lib/poaImport/parseExcel.ts
      │
      ▼
resolveValidationContext()         src/lib/poaImport/service/resolveValidationContext.ts
      │                            (consulta poa_zone_mappings + board_activity_standards)
      ▼
validateParsedPoa()                src/lib/poaImport/validate.ts
      │
      ├── zona sin mapear ───────► unresolvedZones
      ├── Grupo B ────────────────► ambiguousFrequencyActivities
      ├── otros errores ─────────► validationErrors
      ▼
  ¿alguna de las tres no vacía?
      │
      ├── sí ────────────────────► createBlockedResult({ ... })  →  ImportPoaResult 'blocked'
      ▼ no
buildImportPayload()               src/lib/poaImport/service/buildImportPayload.ts
      │                            (ValidatedActivity[] → JSON snake_case)
      ▼
persistImportPoaVersion()          src/lib/poaImport/service/persistImportPoaVersion.ts
      │                            (RPC import_poa_version())
      ├── error ──────────────────► translatePersistenceError() → ImportPoaResult 'persistence_failed'
      ▼
ImportPoaResult 'success'
```

## Reglas de esta capa

- `importPoaService` **no valida nada por su cuenta**. Cada caja de arriba ya decide qué es válido; el orquestador solo enruta el resultado hacia el `ImportPoaResult` correspondiente.
- `resolveValidationContext()` es la única frontera de lectura de infraestructura de esta capa — consulta `poa_zone_mappings` y `board_activity_standards`, una consulta por tabla con `IN(...)` deduplicado. No decide qué hacer con una zona sin mapear — eso lo decide `buildBlockedResult()`, empaquetándolo en `unresolvedZones`.
- `buildImportPayload()` es una función pura de mapeo (`ValidatedActivity[]` → el JSON exacto que espera `import_poa_version()`, ver [`import-poa-version-contract.md`](./import-poa-version-contract.md)) — no contiene ninguna decisión, solo traducción de forma.
- Los tres motivos de `blocked` se acumulan a lo largo del flujo (no se corta en el primero) — un mismo intento puede tener zonas sin mapear Y actividades del Grupo B Y errores de validación a la vez, y `createBlockedResult()` los recibe juntos.
- `import_operation_id` **nunca se genera dentro de este flujo** — viene en `ImportPoaInput`, generado una vez por quien invoca al servicio (nunca el usuario final, nunca `importPoaService`). Ver `src/lib/poaImport/service/types.ts`.

## UI que consume `unresolvedZones` (ADR-0004)

`ImportPoaResult.blocked.unresolvedZones` se resuelve manualmente por un admin en `/poa/[poaId]/zone-mappings` (`src/app/poa/[poaId]/zone-mappings/page.tsx`, componente `src/components/poa/ZoneMappingsResolver.tsx`, hook `src/hooks/usePoaZoneMappings.ts`). **Ruta independiente, deliberadamente fuera de `src/config/navigation.ts`** (navegación congelada) — se llega por enlace directo hasta que exista un punto de entrada de "Importar POA".

Alcance actual de esa UI: resuelve mapeos *ya existentes* con `group_id = NULL` (Regla 5 de ADR-0004 — el group se eliminó, vía el índice parcial `idx_poa_zone_mappings_pending`). Zonas *completamente nuevas*, detectadas por primera vez en un Excel (`unresolvedZones` que todavía no tienen ninguna fila en `poa_zone_mappings`), requieren que la futura UI de importación inserte esa fila pendiente al detectarlas — entonces aparecerán aquí automáticamente, sin cambiar este hook ni este componente.

## Documentos relacionados

- [`import-poa-version-contract.md`](./import-poa-version-contract.md) — contrato de la función SQL que este flujo invoca al final.
- [`poa-excel-import-design.md`](./poa-excel-import-design.md) — diseño del parser y la estructura del Excel.
- `src/lib/poaImport/service/types.ts` — contrato de `ImportPoaResult`/`ImportPoaInput` que este flujo produce.
