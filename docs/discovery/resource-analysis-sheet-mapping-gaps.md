# Decisiones requeridas para mapear las hojas del Resource Analysis a sitios reales

**Para:** dueño del proceso / responsable de la operación
**De:** equipo de desarrollo de Mantenix
**Fecha:** 2026-07-21
**Evidencia completa:** `docs/domain/resource-analysis-domain.md` (Sección 5), `docs/architecture/resource-analysis-import-design.md` (Sección 2)

## Contexto

Al hacer el discovery del Excel `COSTOS GENERALES (V2).xlsx` para diseñar su importador, se encontró que las etiquetas internas de varias hojas ("NOMBRE DEL PROYECTO:") no coinciden con el sitio real de esa hoja — parecen copiadas de otra hoja al construir el archivo. El importador **no puede resolver esto por sí solo sin arriesgar cargar cantidades al sitio equivocado**, así que se detiene y lo reporta en vez de adivinar, mismo principio que ya se aplicó con las ambigüedades de frecuencia del POA (`docs/discovery/poa-frequency-decision-request.md`).

**Esto no es un error del discovery.** Es exactamente lo que un discovery cuidadoso debe encontrar antes de escribir el parser — evita construir un importador que cargue cantidades al `group_id` equivocado silenciosamente.

## Caso 1 — Hoja "COUNTRY 2" mezcla dos sitios distintos — RESUELTO (2026-07-21)

**Respuesta del dueño del proceso:** la hoja "COUNTRY 2" completa (ambos bloques, Zona Verde y Zona de Playa) pertenece al sitio **PLAYA DE SABANILLA 2**. La etiqueta interna "PLAYAS DEL COUNTRY - ZONA DE PLAYA" del segundo bloque es un error de copiado — se ignora, igual que los demás casos del Caso 2 más abajo.

- [x] Pertenece a PLAYA DE SABANILLA 2 (la etiqueta de Zona de Playa está mal, ignorarla).

Contexto original de la pregunta, conservado para trazabilidad:

La hoja "COUNTRY 2" tiene dos bloques:
- **Zona Verde**, etiquetado internamente como **"PLAYAS SABANILLA - ZONA VERDE"**.
- **Zona de Playa**, etiquetado internamente como **"PLAYAS DEL COUNTRY - ZONA DE PLAYA"** — el mismo texto exacto que usa la hoja "COUNTRY 1", pero con cantidades distintas (ej. `ZONA DE PLAYA` = 18.070 m² en COUNTRY 2 vs. 19.287 m² en COUNTRY 1; `CORTE DE TRONCOS` = 350 UND en ambas).

**Bloqueante:** sin esta respuesta, el importador (Incremento 2+) no puede cargar el bloque de Zona de Playa de esta hoja para ningún sitio.

## Caso 2 — Etiquetas internas incorrectas en 3 hojas más — RESUELTO (2026-07-21)

**Respuesta del dueño del proceso:** confirmado, usar siempre el nombre de la pestaña como fuente de verdad del sitio, ignorando el texto interno del bloque cuando no coincide.

- [x] Confirmado: usar siempre el nombre de la pestaña, ignorar la etiqueta interna en estos 3 casos.

Contexto original, conservado para trazabilidad — en estas 3 hojas, el nombre de la **pestaña** coincide claramente con un `group` real, pero el texto interno del bloque ("NOMBRE DEL PROYECTO:") está copiado de otro sitio:

| Hoja (pestaña) | Etiqueta interna encontrada | `group` real (por nombre de pestaña) |
|---|---|---|
| MERCADO DE LA SAZON | "CENTRO GASTRÓNOMICO - ZONA VERDE" | MERCADO LA SAZÓN |
| SANTA VERONICA | "PTO COLOMBIA - ZONA VERDE" / "... ZONA DE PLAYA" | SENDERO SANTA VERÓNICA |
| PLAYA MANGLARES | " ZONA DURA MANGLARES" (2º bloque; el contenido es de Zona de Playa, no Zona Dura) | MANGLARES |

## Caso 3 — Sitio "PLAYA MIRAMAR" vs. `group` "MIRAMAR SECTOR EL FARO" — RESUELTO (2026-07-21)

**Respuesta del dueño del proceso:** confirmado — la hoja "PLAYA MIRAMAR" corresponde al sitio "MIRAMAR SECTOR EL FARO" (único candidato razonable de los 12 sitios).

- [x] Confirmado: la hoja "PLAYA MIRAMAR" corresponde al sitio "MIRAMAR SECTOR EL FARO".

## Caso 4 — 3 sitios de la base de datos sin ninguna hoja en este Excel — RESUELTO (2026-07-21)

**Respuesta del dueño del proceso:**
- `PLAYA PUNTA ASTILLEROS` es un sitio real, pendiente de dato (no de desarrollo) — no existe otra fuente todavía.
- `PRESUPUESTO GENERAL` (los dos `group_id`) **no es un sitio operativo real** — es un grupo administrativo/resumen. Se excluye explícitamente del barrido de factibilidad del Cronograma; nunca debería tener `resource_analysis` propio.

- [x] Punta Astilleros: pendiente de dato, no de desarrollo.
- [x] Presupuesto General (×2): excluido permanentemente del barrido — no es un sitio operativo.

## No bloqueante para el Incremento 2 (Parser)

El parser de lectura pudo construirse y probarse contra los 9 sitios ya identificados con confianza alta (Sección 2 de `resource-analysis-import-design.md`) sin esperar estas respuestas. Con los 4 casos ya resueltos, la tabla de mapeo completa vive en `docs/architecture/resource-analysis-site-mapping.md` — ese documento es la fuente de verdad para el Incremento 4 (Importación), no este.
