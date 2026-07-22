# Diseño: Importador del Excel de Resource Analysis

**Estado: Incrementos 2 (Parser) y 3 (Validación) implementados.** `src/lib/resourceAnalysisImport/` — lectura y validación puras, sin escribir en producción, verificado contra el archivo real (`COSTOS GENERALES (V2).xlsx`, copia saneada en la raíz del repo, ver `docs/testing/fixtures-policy.md`). 23/23 tests verdes (`parseExcel.test.ts` + `validate.test.ts`). Incrementos 4 (Importación) y 5 (Verificación) siguen sin construir.

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
| `RA005` | Dos bloques de la misma hoja resuelven al mismo sitio (el caso real que motivó esta regla: la hoja "COUNTRY 2", ver discovery) | Error |
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

Pendiente: (1) Incremento 4 — importación real (UPSERT merge), que requiere antes construir la tabla de mapeo sitio→`group_id` de la Sección 3 (Casos 2-4 del discovery) para poder llenar `context.siteMappings` con datos reales; (2) Incremento 5 — re-ejecutar el barrido de factibilidad del Cronograma (`docs/operacion/investigaciones/costos/`, mismo patrón que el barrido ya hecho el 2026-07-21) para poder evaluar los 12/12 sitios en vez de 1/12.
