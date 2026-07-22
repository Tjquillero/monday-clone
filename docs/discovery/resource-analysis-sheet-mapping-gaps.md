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

## Caso 2 — Etiquetas internas incorrectas en 3 hojas más (no bloqueante, la pestaña sí es confiable)

En estas 3 hojas, el nombre de la **pestaña** coincide claramente con un `group` real, pero el texto interno del bloque ("NOMBRE DEL PROYECTO:") está copiado de otro sitio:

| Hoja (pestaña) | Etiqueta interna encontrada | `group` real (por nombre de pestaña) |
|---|---|---|
| MERCADO DE LA SAZON | "CENTRO GASTRÓNOMICO - ZONA VERDE" | MERCADO LA SAZÓN |
| SANTA VERONICA | "PTO COLOMBIA - ZONA VERDE" / "... ZONA DE PLAYA" | SENDERO SANTA VERÓNICA |
| PLAYA MANGLARES | " ZONA DURA MANGLARES" (2º bloque; el contenido es de Zona de Playa, no Zona Dura) | MANGLARES |

**Propuesta de resolución** (para confirmar, no asumir): el importador usa el **nombre de la pestaña** como fuente de verdad del sitio, ignorando el texto interno del bloque cuando no coincide. ¿Confirmás que esta regla es correcta, o alguna de estas 3 hojas en realidad sí pertenece al sitio que dice la etiqueta interna (y es la pestaña la que está mal nombrada)?

- [ ] Confirmado: usar siempre el nombre de la pestaña, ignorar la etiqueta interna en estos 3 casos.
- [ ] Alguna excepción — indicar cuál hoja y por qué.

## Caso 3 — Sitio "PLAYA MIRAMAR" vs. `group` "MIRAMAR SECTOR EL FARO"

El nombre de la pestaña ("PLAYA MIRAMAR") no coincide exactamente con ningún `group.title` de la base de datos — el más parecido es "MIRAMAR SECTOR EL FARO".

- [ ] Confirmado: la hoja "PLAYA MIRAMAR" corresponde al sitio "MIRAMAR SECTOR EL FARO".
- [ ] No — son sitios distintos / falta un mapeo más específico.

## Caso 4 — 3 sitios de la base de datos sin ninguna hoja en este Excel

`PLAYA PUNTA ASTILLEROS` y `PRESUPUESTO GENERAL` (dos `group_id` distintos con el mismo nombre) no tienen hoja correspondiente en `COSTOS GENERALES (V2).xlsx`.

**Pregunta:** ¿existe una versión más reciente o complementaria de este documento que sí los incluya, o estos sitios simplemente no tienen Resource Analysis todavía (y deben quedar "sin estándares configurados" hasta que se levante esa información en campo)?

- [ ] No existe otra fuente — quedan pendientes de dato, no de desarrollo.
- [ ] Existe otro documento — indicar cuál.
- [ ] "PRESUPUESTO GENERAL" no es un sitio operativo real (es un grupo administrativo/resumen) y no debería tener Resource Analysis nunca — confirmar si corresponde excluirlo del barrido de factibilidad en vez de esperar datos para él.

## No bloqueante para el Incremento 2 (Parser)

El parser de lectura puede construirse y probarse contra los 9 sitios ya identificados con confianza alta (Sección 2 de `resource-analysis-import-design.md`) sin esperar estas respuestas — simplemente no escribirá nada en producción (Incremento 4) hasta que el Caso 1 quede resuelto, y reportará los Casos 2-4 como advertencias, no errores.
