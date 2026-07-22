# Mapeo Sitio → `group_id`: Resource Analysis (Tablero Principal)

**Estado: Congelado (2026-07-21).** Este documento es la única fuente de verdad para resolver `context.siteMappings` en `validateResourceAnalysis()` (`src/lib/resourceAnalysisImport/validate.ts`) y para el futuro Incremento 4 (Importación). No se infiere del nombre de la hoja ni de la etiqueta interna del bloque en tiempo de ejecución — ambos demostraron no ser confiables por sí solos (ver `docs/discovery/resource-analysis-sheet-mapping-gaps.md`, Casos 1-4, todos resueltos por el dueño del proceso el 2026-07-21).

Sigue el mismo principio que `poa_zone_mappings` (`docs/architecture/poa-excel-import-design.md`, Sección 5): el mapeo se resuelve una sola vez, por un humano, y se congela — nunca se adivina por coincidencia de texto en cada importación.

**El `group_id` proviene del board `Tablero Principal`** (`board_id = 3ea0326f-6ff7-409f-848a-1f296e6e3cc8`) — el único board con datos reales del Resource Analysis hasta ahora.

---

## Tabla de mapeo

Clave `${sheetName}#${blockIndex}` — el mismo formato que espera `ValidateResourceAnalysisContext.siteMappings` (`blockIndex` es 0-indexado, en el orden en que `parseResourceAnalysisExcel` detecta los bloques dentro de la hoja).

| Clave (hoja#bloque) | Etiqueta interna del bloque (Excel, no confiable por sí sola) | Sitio lógico | `group_id` | Estado |
|---|---|---|---|---|
| `PLAZA PUERTO COLOMBIA#0` | PTO COLOMBIA - ZONA VERDE | Plaza Puerto Colombia | `98153f4c-18b9-4bff-abda-39d62db8a931` | Confirmado |
| `PLAZA PUERTO COLOMBIA#1` | PTO COLOMBIA - ZONA DE PLAYA | Plaza Puerto Colombia | `98153f4c-18b9-4bff-abda-39d62db8a931` | Confirmado |
| `PLAYA MANGLARES#0` | MANGLARES - ZONA VERDE | Manglares | `662748a7-7731-4e90-9782-527ba0caacc4` | Confirmado |
| `PLAYA MANGLARES#1` | " ZONA DURA MANGLARES" (mal etiquetado — el contenido es Zona de Playa) | Manglares | `662748a7-7731-4e90-9782-527ba0caacc4` | Confirmado |
| `CENTRO GASTRONOMICO#0` | CENTRO GASTRÓNOMICO - ZONA VERDE | Centro Gastronómico | `e45851b6-73f7-46ad-b6dd-ea4f5920d747` | Confirmado |
| `MERCADO DE LA SAZON#0` | "CENTRO GASTRÓNOMICO - ZONA VERDE" (mal etiquetado — es Mercado La Sazón, no Centro Gastronómico) | Mercado La Sazón | `55d65880-8a87-4c7d-be45-0d26821194cc` | Confirmado |
| `PLAYA MIRAMAR#0` | PLAYA MIRAMAR - ZONA VERDE | Miramar Sector El Faro | `0230dceb-1ea2-4273-9a44-a5ff19da7ad9` | Confirmado |
| `COUNTRY 1#0` | PLAYAS DEL COUNTRY - ZONA VERDE | Playa del Country | `6366520a-d981-4c7c-8d4d-72fbf06bb7f3` | Confirmado |
| `COUNTRY 1#1` | PLAYAS DEL COUNTRY - ZONA DE PLAYA | Playa del Country | `6366520a-d981-4c7c-8d4d-72fbf06bb7f3` | Confirmado |
| `COUNTRY 2#0` | PLAYAS SABANILLA - ZONA VERDE | Playa de Sabanilla 2 | `a59b5a16-30f1-4e83-aa68-342d791e2d97` | Confirmado |
| `COUNTRY 2#1` | "PLAYAS DEL COUNTRY - ZONA DE PLAYA" (mal etiquetado — la hoja completa es Sabanilla 2, ver Caso especial abajo) | Playa de Sabanilla 2 | `a59b5a16-30f1-4e83-aa68-342d791e2d97` | Confirmado |
| `SALINAS DEL REY#0` | SALINAS DEL REY - ZONA VERDE | Salinas del Rey | `b050df1c-161a-435e-9f82-e1fb537a6376` | Confirmado |
| `SALINAS DEL REY#1` | PLAYAS DE SALINAS DEL REY - ZONA DE PLAYA | Salinas del Rey | `b050df1c-161a-435e-9f82-e1fb537a6376` | Confirmado |
| `SANTA VERONICA#0` | "PTO COLOMBIA - ZONA VERDE" (mal etiquetado — es Sendero Santa Verónica, no Plaza Puerto Colombia) | Sendero Santa Verónica | `0b846b6a-e9f7-4df4-a2ac-89fcefab164d` | Confirmado |
| `SANTA VERONICA#1` | "PTO COLOMBIA - ZONA DE PLAYA" (mal etiquetado; además sin cantidades — ver nota) | Sendero Santa Verónica | `0b846b6a-e9f7-4df4-a2ac-89fcefab164d` | Confirmado |

**Sin bloque en el Excel — pendientes o excluidos** (no reciben fila en `siteMappings`, quedan sin `resource_analysis` hasta que se resuelva su caso):

| Sitio lógico | `group_id` | Estado | Razón |
|---|---|---|---|
| Playa Punta Astilleros | `dd03bed4-cf5e-4d52-876f-ba906d371174` | Pendiente de dato | Sitio real, sin hoja en este Excel. No es un problema de desarrollo — falta que Operaciones levante la información. |
| Presupuesto General | `7e31e486-82ca-498e-8cb1-f845456f3a1f` | Excluido permanentemente | No es un sitio operativo real (grupo administrativo/resumen) — nunca debería tener `resource_analysis` ni evaluarse en el barrido de factibilidad. |
| Presupuesto General | `41bdd7d8-f199-45da-b781-5a00e5ccde05` | Excluido permanentemente | Ídem — segundo `group_id` con el mismo nombre. |

---

## Casos especiales (para no repetir la investigación)

1. **La hoja "COUNTRY 2" completa pertenece a Playa de Sabanilla 2**, no a "Playas del Country" — su bloque de Zona de Playa quedó con la etiqueta interna de la hoja "COUNTRY 1" pegada por error al construir el Excel (mismo texto exacto, cantidades distintas). Confirmado directamente por el dueño del proceso (2026-07-21).
2. **El nombre de la pestaña identifica el sitio; la etiqueta interna del bloque ("NOMBRE DEL PROYECTO:") no es confiable** — 4 de las 9 hojas tienen el texto de otro sitio copiado y pegado (Mercado de la Sazón, Santa Verónica, Manglares 2º bloque, y el caso especial de Country 2 de arriba). El importador debe identificar el sitio por esta tabla (clave hoja+bloque), nunca leyendo el texto de la celda en tiempo de ejecución.
3. **`SANTA VERONICA#1` (Zona de Playa) no tiene ninguna cantidad** — todas las celdas de cantidad están vacías en el Excel real. Es un mapeo válido (el sitio existe), simplemente no aporta cantidades hoy; el Incremento 4 no debería fallar por esto, solo no crear entradas de `scope_data` para ese bloque.
4. **Todos los `group_id` de esta tabla pertenecen a `Tablero Principal`** (`3ea0326f-6ff7-409f-848a-1f296e6e3cc8`). Si en el futuro aparece un Resource Analysis de otro board, este documento no aplica — se congela una tabla nueva para ese board.

---

## Implementación

La tabla vive en código, no solo en este documento: `src/lib/resourceAnalysisImport/siteMappings.ts` (`RESOURCE_ANALYSIS_SITE_MAPPINGS`, `RESOURCE_ANALYSIS_UNMAPPED_SITES`). `siteMappings.test.ts` la verifica contra el archivo real en cada corrida de CI — dos aserciones:

1. `validateResourceAnalysis(parsed, { siteMappings: RESOURCE_ANALYSIS_SITE_MAPPINGS })` produce `isValid=true`, `blockedBlocks=0`, `validBlocks=15`.
2. Las claves del mapeo coinciden exactamente con las claves que el parser detecta hoy (ni de más ni de menos) — si el Excel cambia de estructura (nueva hoja, hoja renombrada, bloque nuevo), este test falla antes de que el Incremento 4 intente importar con un mapeo desactualizado.

Si el archivo real cambia de estructura, este documento y `siteMappings.ts` se actualizan juntos — nunca uno sin el otro.

## Próximo paso

Con esta tabla congelada y verificada, el Incremento 4 (Importación) queda reducido a ingeniería mecánica: `parse → validate(con RESOURCE_ANALYSIS_SITE_MAPPINGS) → si isValid, UPSERT resource_analysis.scope_data por group_id`. No quedan decisiones de negocio pendientes para los 9 sitios cubiertos por este Excel.
