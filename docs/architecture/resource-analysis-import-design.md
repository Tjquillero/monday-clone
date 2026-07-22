# Diseño: Importador del Excel de Resource Analysis

**Estado: Incrementos 1-5 completos (2026-07-21/22).** El importador corrió realmente contra Tablero Principal — ver Sección 10 para el resultado E2E completo y la comparación de factibilidad antes/después.

Depende de `docs/domain/resource-analysis-domain.md` (el *qué* y el *por qué*) — este documento responde el *cómo*.

---

## 1. Alcance

El workbook tiene 10 hojas: 9 hojas de sitio + `DETALLE DE GRUPO` (comparativo de personal, fuera de alcance — ver dominio Sección 4).

**El importador solo lee cantidades** (bloques "ITEM/DESCRIPCION/UND/CANTIDAD") de las 9 hojas de sitio. Las tablas de RENDIMIENTO/FRECUENCIA/CANT JORNALES de cada hoja se leen únicamente para el reporte de discrepancias (Sección 6), nunca se escriben en `board_activity_standards`.

## 2. Estructura real del archivo (verificada, no asumida)

Cada hoja de sitio tiene hasta **dos bloques** (Zona Verde y Zona de Playa), cada uno con esta forma:

```
Fila N:    "NOMBRE DEL PROYECTO:" | (vacío) | "<texto libre del sitio> - ZONA VERDE|ZONA DE PLAYA"
Fila N+1:  (vacía)
Fila N+2:  "ITEM" | "DESCRIPCION" | "UND" | "CANTIDAD" | ... | "TIPO DE RIEGO" (columna F/G, informativa, no se importa)
Fila N+3..: filas de cantidad, hasta 6 por bloque (algunas vacías/null si el sitio no tiene esa cantidad)
(vacías)
Fila M:     repetición del nombre del bloque (sin "NOMBRE DEL PROYECTO:")
Fila M+1:   "ITEM" | "ACTIVIDAD" | "UNIDAD" | "RENDIMIENTO" | "FRECUENCIA" | "FACTOR" | "CANTIDAD" | "CANT JORNALES MES" | "V. ACTIVIDAD"
Fila M+2..: una fila por actividad técnica (rendimiento/frecuencia/cantidad/JR ya calculado) — fuera de alcance de importación, ver Sección 6
(vacías)
Fila final: "CANT JORNALES MES" (total) | "CANT PERSONAL MES" (total) — agregados del bloque, no se importan (se recalculan)
```

No todas las hojas tienen los dos bloques con datos (PLAYA MIRAMAR: Zona de Playa presente pero todas las cantidades en `null`/`0`).

### Inventario de hojas verificado

| Hoja (pestaña real) | Bloque(s) de cantidad presentes | Mapeo a `group` propuesto | Confianza |
|---|---|---|---|
| PLAZA PUERTO COLOMBIA | Zona Verde + Zona de Playa | PLAZA PUERTO COLOMBIA | Alta (coincide exacto) |
| PLAYA MANGLARES | Zona Verde + "Zona de Playa" (bloque mal etiquetado como `" ZONA DURA MANGLARES"`) | MANGLARES | Alta (nombre de pestaña exacto; etiqueta interna del 2º bloque no confiable, ver `resource-analysis-sheet-mapping-gaps.md`) |
| CENTRO GASTRONOMICO | Solo Zona Verde | CENTRO GASTRONÓMICO | Alta |
| MERCADO DE LA SAZON | Solo Zona Verde (etiqueta interna mal copiada como "CENTRO GASTRÓNOMICO — ZONA VERDE") | MERCADO LA SAZÓN | Alta por nombre de pestaña; etiqueta interna incorrecta, no usarla como fuente de verdad |
| PLAYA MIRAMAR | Zona Verde (Zona de Playa presente pero vacía) | MIRAMAR SECTOR EL FARO | Media — el nombre de pestaña no coincide exacto con el `group.title`, requiere confirmación |
| COUNTRY 1 | Zona Verde + Zona de Playa | PLAYA DEL COUNTRY | Alta (cantidades ya verificadas contra `resource_analysis` real) |
| COUNTRY 2 | Zona Verde (etiqueta "PLAYAS SABANILLA") + Zona de Playa (etiqueta "PLAYAS DEL COUNTRY", duplicada de COUNTRY 1 pero con cantidades distintas) | PLAYA DE SABANILLA 2 (hoja completa — confirmado por el dueño del proceso, la etiqueta "PLAYAS DEL COUNTRY" del 2º bloque está mal y se ignora) | Alta (confirmado 2026-07-21, ver `resource-analysis-sheet-mapping-gaps.md` Caso 1) |
| SALINAS DEL REY | Zona Verde + Zona de Playa | SALINAS DEL REY | Alta (nombre de pestaña exacto) |
| SANTA VERONICA | Zona Verde (+ Zona de Playa, cantidades no verificadas en este pase) (etiqueta interna mal copiada como "PTO COLOMBIA") | SENDERO SANTA VERÓNICA | Alta por nombre de pestaña; etiqueta interna incorrecta |
| DETALLE DE GRUPO | N/A — no es un sitio | N/A | Fuera de alcance |

**3 sitios activos en la base de datos sin hoja en este Excel**: PLAYA PUNTA ASTILLEROS, PRESUPUESTO GENERAL (×2 `group_id` distintos). El importador no puede poblarlos con este archivo — quedan fuera de alcance hasta que exista una fuente para ellos.

## 3. Identidad de un sitio

A diferencia del POA (identidad = código contractual, columna B, nunca el nombre), **este Excel no tiene ningún código estable por sitio** — ni por hoja ni por bloque. La única pista disponible es texto libre (nombre de pestaña + etiqueta interna del bloque), y la etiqueta interna ya demostró no ser confiable (Sección 2, casos MANGLARES/MERCADO/SANTA VERONICA/COUNTRY 2).

**Decisión de diseño propuesta** (pendiente de aprobación): igual que el POA resuelve zonas por una tabla puente persistente (`poa_zone_mappings`, nunca coincidencia de texto), este importador necesita una tabla equivalente — ej. `resource_analysis_sheet_mappings (sheet_name, block_label, group_id)` — resuelta una sola vez por un humano, no adivinada por el parser. Ningún bloque se importa sin mapeo confirmado; un bloque sin mapeo bloquea únicamente ese bloque, no el archivo completo (a diferencia del POA, aquí cada sitio es independiente — no hay una única "versión" atómica que dependa de todos los sitios a la vez).

## 4. Qué SÍ y qué NO se importa (ver dominio Sección 3-4)

**Se importa**, por sitio × `scope_key` (hacia `resource_analysis.scope_data`):
- Las cantidades de los bloques "ITEM/DESCRIPCION/UND/CANTIDAD" (Zona Verde + Zona de Playa), mapeadas por la tabla de la Sección 3 de `resource-analysis-domain.md`.

**NO se importa, deliberadamente:**
- RENDIMIENTO/FRECUENCIA/CANT JORNALES/V. ACTIVIDAD de la segunda tabla de cada bloque (dominio del Catálogo Técnico, Regla de Gobierno de Datos).
- Los totales "CANT JORNALES MES"/"CANT PERSONAL MES" (derivados, se recalculan).
- La columna "TIPO DE RIEGO" (F/G) — anotación operativa sin tabla destino conocida hoy; queda como hallazgo sin resolver, no se descarta activamente, simplemente ninguna tabla la almacena.
- La hoja "DETALLE DE GRUPO".

## 5. Flujo de importación propuesto

```
1. Cargar el archivo (.xlsx) → iterar cada hoja de sitio (excluir "DETALLE DE GRUPO").
2. Por cada hoja, detectar bloques por el patrón "NOMBRE DEL PROYECTO:" (fila) → extraer
   el bloque de cantidades hasta la siguiente fila en blanco / próximo bloque.
3. Resolver cada bloque contra resource_analysis_sheet_mappings (sheet_name + posición
   del bloque en la hoja, NUNCA el texto de la etiqueta interna, que ya se demostró
   no confiable) → group_id.
   - Si NO tiene mapeo → no se importa ese bloque. Se reporta en la UI de importación
     como "pendiente de asignar zona", igual que el patrón de poa_zone_mappings.
4. Por cada scope_key reconocido (tabla de mapeo, dominio Sección 3) con cantidad > 0:
   UPSERT resource_analysis (board_id, site_id=group_id, scope_data) — merge del
   scope_data existente, nunca un reemplazo ciego (un sitio ya cargado, ej. PLAYA DEL
   COUNTRY, no debe perder claves que el Excel actual no traiga).
5. Reportar, por sitio: cuántos scope_key se importaron, cuáles quedaron sin
   reconocer (texto de descripción no está en la tabla de mapeo) — no se inventan
   scope_key nuevos automáticamente.
```

Deliberadamente **no es todo-o-nada como el POA**: cada sitio (bloque) es independiente. Un sitio con mapeo pendiente no bloquea la importación de los demás — a diferencia del POA, aquí no existe el concepto de "versión" atómica que amarre todos los sitios entre sí.

## 6. Reporte de discrepancias (no bloqueante, informativo)

Para cada actividad donde el Excel trae RENDIMIENTO/FRECUENCIA y existe una fila correspondiente en `board_activity_standards`, el importador (o una vista aparte) debería poder mostrar una comparación —nunca escribirla— siguiendo la Regla de Gobierno de Datos:

```
Actividad: Corte de troncos (1.09)
  Excel (COUNTRY 1, Zona de Playa):        rendimiento=10, frecuencia=4
  Catálogo Técnico vigente (Tablero Ppal): rendimiento=30
  → Discrepancia conocida, documentada en resource-analysis-domain.md Sección 2.
    No se corrige automáticamente.
```

Esto es explícitamente fuera de alcance del Incremento 2 (Parser) — se deja anotado aquí para que el Incremento 3+ (Validación) decida si vale la pena construirlo como una pantalla real o si basta con la documentación estática.

## 7. Validaciones antes de aceptar un bloque — Incremento 3 implementado

`src/lib/resourceAnalysisImport/validate.ts::validateResourceAnalysis(parseResult, context)` — función pura, no conoce Supabase. `context.siteMappings` (`Map<"sheetName#blockIndex", string | null | undefined>`) se lo pasa el caller ya resuelto (Incremento 4) — hoy, sin esa tabla construida todavía, se llama con un `Map` vacío y refleja correctamente que nada es importable aún (`isValid=false`, todos los bloques en RA002).

`isValid = errors.length === 0`, pero **no significa "se puede importar el archivo completo"** — a diferencia del POA (todo-o-nada), aquí cada bloque es independiente (Sección 5); el `summary` (`totalBlocks`/`validBlocks`/`blockedBlocks`) es lo que un futuro Incremento 4 usaría para decidir qué bloques importar aunque `isValid` sea `false` por otros bloques.

Códigos estables, para que tests/UI/documentos se refieran a la regla sin copiar el mensaje:

| Código | Regla | Severidad |
|---|---|---|
| `RA001` | Hoja sin ningún bloque reconocible (patrón "NOMBRE DEL PROYECTO:" no encontrado) | Error |
| `RA002` | Bloque sin sitio resuelto en `context.siteMappings` | Error |
| `RA003` | Descripción de cantidad no reconocida contra la tabla de `scope_key` | Informativo |
| `RA004` | Cantidad negativa | Error |
| `RA005` | Dos bloques del mismo sitio comparten al menos un `scopeKey` (riesgo real: importar la misma cantidad física dos veces). Zona Verde y Zona de Playa del mismo sitio NO disparan esto — sus `scopeKey` nunca se solapan por diseño. No es la regla que detectó el caso de "COUNTRY 2" (eso fue discovery humano sobre texto copiado entre hojas distintas, no dos bloques de una misma hoja) | Error |
| `RA006` | Rendimiento leído en el bloque — informativo, nunca se persiste (Regla de Gobierno de Datos) | Informativo |
| `RA007` | Frecuencia leída en el bloque — informativa, nunca se persiste (Regla de Gobierno de Datos) | Informativo |

Verificado contra el archivo real (`validate.test.ts`, 23/23 tests entre parser+validación): con `siteMappings` vacío (estado actual del sistema) → 15/15 bloques bloqueados por RA002, 15 RA006, 15 RA007, 3 RA003 (`ARBOLES FUERA DE CAMASIEMBRA`), 0 RA001/RA004/RA005. RA001, RA004 y RA005 se probaron con fixtures sintéticos porque no ocurren en el archivo real.

## 8. Fuera de alcance de este diseño

- La interfaz de resolución de mapeos de bloque→sitio (se define al implementar, mismo patrón que POA).
- Rendimiento/frecuencia/Catálogo Técnico — gobernado aparte (ADR-0008, Regla de Gobierno de Datos).
- La hoja "DETALLE DE GRUPO" y cualquier comparación motor-vs-escenario-manual de personal.
- Los 3 sitios sin hoja en este Excel (PLAYA PUNTA ASTILLEROS, PRESUPUESTO GENERAL ×2).

## Próximo paso

El único caso bloqueante (COUNTRY 2, Sección 2) ya quedó resuelto (2026-07-21): pertenece íntegramente a PLAYA DE SABANILLA 2. Quedan pendientes, no bloqueantes, los Casos 2-4 de `docs/discovery/resource-analysis-sheet-mapping-gaps.md`.

**Incremento 2 (Parser) — completo (2026-07-21):** `src/lib/resourceAnalysisImport/` (`types.ts`, `parseExcel.ts`, `parseExcel.test.ts`, `testFixtures.ts`). Lee las 9 hojas de sitio, extrae cantidades por `scope_key` y captura rendimiento/frecuencia crudos (solo informativo). No resuelve `group_id`, no valida reglas de negocio, no escribe nada — confirmado con los 9 sitios reales del archivo, incluida la verificación cruzada contra `resource_analysis.scope_data` ya cargado para PLAYA DEL COUNTRY.

**Incremento 3 (Validación) — completo (2026-07-21):** `validate.ts` (Sección 7 arriba) — función pura, códigos RA001-RA007. Confirma con el archivo real que hoy nada es importable todavía (todos los bloques en RA002) porque la tabla de mapeo sitio→`group_id` no existe — comportamiento correcto, no un bug.

## 9. Incremento 4 (Importación) — completo (2026-07-22)

`src/lib/resourceAnalysisImport/service/` (`types.ts`, `buildImportPayload.ts` + test, `persistResourceAnalysisImport.ts`, `importResourceAnalysisService.ts` + test). Contrato congelado antes de implementar (decisiones explícitas del usuario):

- **`scope_data`: REPLACE completo por sitio, nunca merge con la fila existente.** Un solo escritor (`ResourceEfficiencyWidget.tsx`) ya trataba esa columna como snapshot completo — el importador respeta esa misma semántica en vez de introducir un segundo comportamiento (merge) sobre la misma columna. Si el Excel deja de traer una actividad que existía antes, el `scope_data` resultante refleja exactamente eso — no arrastra datos fantasma de una versión anterior.
- **Condición del replace: solo si el sitio está completo.** Un sitio se reemplaza únicamente si TODOS sus bloques (1 o 2 — Zona Verde / Zona de Playa) están libres de error. Si falta un bloque o alguno tiene RA002/RA005, el sitio completo se saltea — nunca se persiste un `scope_data` parcial (`buildImportPayload.ts`, ver test "sitio con un bloque válido y otro bloqueado... se saltea completo").
- **`workers_data`/`wages_data`: nunca se tocan.** Misma Regla de Gobierno de Datos que rendimiento/frecuencia — son datos que hoy mantiene un humano vía el formulario manual, y este Excel puede estar desactualizado para ellos también. Para una fila nueva se inicializan a los mismos valores vacíos que ya usa el formulario (`{}`/`0`); para una fila existente, simplemente no se incluyen en el payload del UPSERT.
- **No es todo-o-nada.** Cada sitio se persiste (o se saltea) de forma independiente — un error en un sitio no bloquea la importación de los demás.
- **Explícitamente fuera de alcance de este incremento**: recalcular Cronograma/factibilidad, tocar `board_activity_standards`, leer automáticamente la Biblioteca Documental, cambiar el Scheduler o cualquier fórmula.

Contrato del servicio:
```ts
createImportResourceAnalysisService(deps: {
  fetchExistingSiteIds(boardId): Promise<Set<string>>;
  upsertResourceAnalysisSite(boardId, site, isNew): Promise<void>;
}): { importResourceAnalysis(input: { boardId, file, importedBy }): Promise<ImportResourceAnalysisResult> }
```
`ImportResourceAnalysisResult` = `{ importedBy, sitesImported, sitesUpdated, sitesSkipped, details[], skipped[], warnings[] }` — sin campo de éxito/fallo global, los números ya son autoexplicativos dado que no es todo-o-nada.

Verificado contra el archivo real con dependencias falsas (sin tocar Supabase): 9 sitios importados cuando el board no tiene datos previos; clasifica correctamente como "updated" el sitio que ya existía (Playa del Country); el `scope_data` pasado al upsert es el replace completo de 8 claves. 37/37 tests del módulo (parser+validate+siteMappings+service), 429/429 en la suite completa, `tsc` limpio.

## 10. Incremento 5 (Verificación E2E) — completo (2026-07-22)

Corrida real contra Tablero Principal (no un board sintético — `RESOURCE_ANALYSIS_SITE_MAPPINGS` tiene los `group_id` reales, no aplica a ningún otro board). Snapshot previo guardado antes de escribir, para poder comparar o revertir.

**Fase 1 — Validación en base de datos:**
- Filas: 2 → 9 (7 importadas, 2 actualizadas). Sin duplicados.
- `scope_data` verificado por valor (no por texto crudo — JSONB no preserva orden de claves) contra el payload del parser: coincide exacto en los 9 sitios.
- `workers_data`/`wages_data` de los 2 sitios preexistentes: intactos, verificado campo por campo contra el snapshot previo.
- Sitios nuevos: inicializados a `{}`/`0`, nunca con datos del Excel.

**Fase 2 — Validación funcional (`ResourceEfficiencyWidget`):** bloqueada inicialmente por un bug preexistente y no relacionado en `SCurveWidget.tsx` (`useMemo` anidado dentro de otro `useMemo`, viola las Rules of Hooks, crashea toda la vista Costos). Corregido en un commit aparte (`fix(financial): resolve Rules of Hooks violation in SCurveWidget`) antes de continuar. Tras el fix: los 8 sitios visibles en el widget (Mercado La Sazón no aparece ahí por un filtro no relacionado — exige items de actividad en el tablero, no resource_analysis) muestran su `scope_data` real al cambiar de pestaña.

**Fase 3 — Barrido del Cronograma (criterio de aceptación real):**

| Sitio | Antes (2026-07-21) | Después (2026-07-22) |
|---|---|---|
| Plaza Puerto Colombia | Sin estándares | **Infactible, 667%** |
| Playa del Country | Infactible, 563% | Infactible, 563% (sin cambio — ya tenía datos) |
| Playa de Sabanilla 2 | Sin estándares | **Infactible, 1173%** |
| Manglares | Sin estándares | **Infactible, 776%** |
| Salinas del Rey | Sin estándares | Sin estándares (`scope_data` confirmado correcto en DB — falta `board_activity_standards`/Catálogo Técnico para este sitio, causa distinta, no del importador) |
| Miramar Sector El Faro | Sin estándares | **Infactible, 1100%** |
| Centro Gastronómico | Sin estándares | **Infactible, 680%** |
| Sendero Santa Verónica | Sin estándares | **Infactible, 1070%** |
| Mercado La Sazón | Sin estándares | **Infactible, 0%/déficit 86.72 JR** (anomalía separada: `siteCapacity.ts` — deuda técnica ya documentada de capacidad hardcodeada por nombre de zona, no relacionada con este importador) |
| Playa Punta Astilleros | Sin estándares | Sin estándares (esperado — sin hoja en el Excel, Caso 4) |
| Presupuesto General (×2) | Sin estándares | Sin estándares (esperado — excluido, no es un sitio operativo, Caso 4) |

**Criterio de aceptación cumplido:** de 12 sitios, 8 pasaron de "sin datos" a "factibilidad calculada" (aunque el resultado sea "infactible" — eso es información de negocio real, no una limitación del importador). 1 (Salinas del Rey) tiene `resource_analysis` correcto pero sigue bloqueado por Catálogo Técnico, causa distinta y ya distinguida. 3 quedan sin datos por diseño (documentado en `resource-analysis-site-mapping.md`). Ninguno de los sitios restantes está bloqueado por un defecto del importador.

Ningún sitio quedó "180%, 320% o 40%" trivialmente factible — los 8 nuevos sitios evaluables resultaron infactibles con utilizaciones muy altas (563%-1173%), consistente con la reversión de ADR-0009 (INV-0002): la fórmula con frecuencia infla los JR de actividades de baja frecuencia, y ningún sitio de este contrato tiene capacidad de cuadrilla dimensionada para esos totales todavía. Esto es exactamente el tipo de hallazgo de negocio que este incremento existía para exponer — no algo que corregir en el importador.
