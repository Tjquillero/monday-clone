# Auditoría: POA 2026 vs. el estado real de Tablero Principal

**Esto no es un ADR.** Es evidencia de investigación (lectura directa contra Supabase + el Excel real), producida antes de importar nada, para decidir con datos en vez de con opinión. Se convertirá en ADR (o en input de ADR-0007) cuando exista una decisión.

## Fecha
2026-07-18

## Por qué se hizo esto antes de importar

Al preparar la importación del POA 2026 sobre Tablero Principal se encontraron tres precondiciones incumplidas (no existe fila `poa`, no hay mapeo de zonas completo, `board_activity_standards` está vacío). Antes de resolver cada una por separado — y en particular antes de asumir que el rendimiento técnico "no existe en ningún lado" — se hizo una auditoría en cuatro niveles contra los datos reales de Tablero Principal (482 items, 10 groups) para entender qué relación tienen hoy con el POA.

## Hallazgo principal: Tablero Principal ya contiene TRES representaciones paralelas del mismo contrato

1. **Grupo "PRESUPUESTO GENERAL"** (305 items, 2 grupos con ese mismo nombre pero distinto color/id) — desglose financiero. Cada item trae `values.code` (= `activity_key` del POA, ej. `"1.09"`, `"2.08"`), `unit`, `unit_price`, `budget`, `item_type: "financial"`. **51 de estos códigos coinciden EXACTAMENTE con el POA 2026** (mismo código, misma descripción literal, verificado carácter por carácter para los primeros 10). No hay ambigüedad de nombres aquí — es una transcripción directa.

2. **8 grupos operativos** (MANGLARES, PLAZA PUERTO COLOMBIA, PLAYA DEL COUNTRY, PLAYA DE SABANILLA 2, MIRAMAR SECTOR EL FARO, CENTRO GASTRONÓMICO, SENDERO SANTA VERÓNICA, SALINAS DEL REY — 177 items en total). Cada item trae `values.rend` (rendimiento), `values.frec` (frecuencia, en días entre ejecuciones), `values.cant`, `unit`, `item_type: "activity"`, y un mapa `daily_execution` con el cronograma diario ya calculado — **este es exactamente el modelo legacy `daily_execution` que ADR-0007 identificó como problema separado**, aquí visto con datos reales de producción por primera vez. Estos items **NO tienen `code`** — usan nombres libres en español ("PODA DE ARBOLES Y PALMAS", "DESMALEZADO", "CONTROL FITOSANITARIO DE ARBOLES Y PALMAS"...).

3. **El POA 2026** (Excel, hoja "POA INICIAL 2026", 107 actividades con código `N.NN`).

## Nivel 1 — Zonas (RESUELTO 2026-07-18)

**Corrección de interpretación (decisión del responsable del proceso):** `MERCADO LA SAZÓN` y `PLAYA PUNTA ASTILLEROS` no eran un problema de mapeo — son zonas **nuevas** de la versión 2026 del contrato, sin alias en el board todavía. No existe ninguna relación real con `SALINAS DEL REY` (se intentó verificar por cantidad contratada, sin coincidencia — ver más abajo); forzar esa relación habría sido una correspondencia inventada, no respaldada por el negocio. `SALINAS DEL REY` permanece como un sitio independiente del board, sin zona correspondiente en esta versión del POA — no requiere ninguna acción (el importador nunca exige que cada grupo tenga zona, solo que cada zona tenga grupo).

`ADR-0004-poa-zone-catalog.md` ya había evaluado y rechazado la creación automática de un `group` cuando una zona no existe — la razón (decidir si una zona nueva es real o un error de tipeo es una decisión humana/contractual) es la misma que motivó no forzar la equivalencia con `SALINAS DEL REY`. El flujo correcto es exactamente el que ya existe: `ZoneMappingsResolver.tsx` (`/poa/[poaId]/zone-mappings`) exige que un humano confirme cada mapeo; solo faltaba crear los 2 grupos antes de que aparecieran en ese selector.

**Acciones ejecutadas** (con confirmación explícita, mutación real sobre Tablero Principal):
- Creados los grupos `MERCADO LA SAZÓN` (`55d65880-8a87-4c7d-be45-0d26821194cc`) y `PLAYA PUNTA ASTILLEROS` (`dd03bed4-cf5e-4d52-876f-ba906d371174`) — nombres verificados carácter por carácter contra la fila de zonas del Excel real (no contra una paráfrasis).
- Creada la fila `poa` para el board (`poa_id: c67be574-9006-406b-9406-b48896845780`).
- Insertados los 9 `poa_zone_mappings`, las 9 zonas del Excel resueltas contra un `group_id` real.

Las 7 zonas restantes calzan con un grupo del board por nombre equivalente (tilde/redacción distinta, sin ambigüedad real):

| Zona POA | Grupo Tablero Principal |
|---|---|
| PLAZA DE PTO COLOMBIA | PLAZA PUERTO COLOMBIA |
| PLAYA MANGLARES | MANGLARES |
| SALGAR PLAYAS DEL COUNTRY 1 | PLAYA DEL COUNTRY |
| SALGAR PLAYAS DE SABANAILLA 2 | PLAYA DE SABANILLA 2 |
| PLAYAS DE MIRAMAR SECTOR EL FARO | MIRAMAR SECTOR EL FARO |
| CENTRO GASTRONOMICO | CENTRO GASTRONÓMICO |
| SENDERO SANTA VERÓNICA | SENDERO SANTA VERÓNICA |

**Verificación numérica realizada (no concluyente por sí sola, pero consistente con la interpretación de "zona nueva"):** se comparó `cant` de items reales de SALINAS DEL REY contra la columna `CANT.` de cada zona del POA para los mismos códigos (`1.01`, `2.14`) — no hubo coincidencia exacta con ninguna zona candidata, lo cual es consistente con que SALINAS DEL REY simplemente no es ninguna de las dos zonas nuevas, sino un sitio distinto que esta versión del POA no cubre.

## Nivel 2 — Actividades

La comparación **por código** (`values.code` en PRESUPUESTO GENERAL) es exacta y confiable — sin trabajo adicional.

La comparación **por nombre** (los 177 items operativos, que no tienen `code`) se intentó con un matcher automático (similitud de tokens tras quitar tildes/stopwords). Resultado: **0 coincidencias "exactas", 68 "similares" (score 0.4-0.85), 109 "sin match" confiable**. La causa no es que sean actividades distintas — es que el matcher de texto es demasiado simple para lidiar con variaciones de raíz de palabra (ej. "FERTILIZACIÓN" vs. "FERTILIZANTES", "CONTROL FITOSANITARIO" vs. "FUNGICIDAS E INSECTICIDAS SEGÚN CONTROL FITOSANITARIO"). La correspondencia real SÍ existe — se confirma de forma indirecta y mucho más confiable en el Nivel 3.

No se generó una tabla de equivalencias definitiva automáticamente — sería falsa precisión. Requiere revisión humana caso por caso (o un matcher más sofisticado), 177 filas.

## Nivel 3 — Frecuencias (validación cruzada, alta confianza)

Los items operativos ya traen `frec` en la unidad natural "días entre ejecuciones" — la misma unidad en la que el administrador del proceso definió las reglas resueltas esta sesión (`docs/discovery/poa-frequency-per-zone.md`). Cruce directo:

| Item (Tablero Principal) | `frec` (días) | Actividad POA correspondiente | Regla resuelta 2026-07-18 |
|---|---|---|---|
| FERTILIZACIÓN DE GRAMA (Centro Gastronómico, cant=66) | 75 | `2.10` (cant POA=65.99≈66) | Cada 75 días ✔ |
| PODA DE ARBOLES Y PALMAS (Playa del Country, cant=111) | 75 | `2.14` (cant POA=111) | Cada 75 días ✔ |
| CONTROL FITOSANITARIO DE ARBOLES Y PALMAS (Sabanilla 2, cant=127) | 50 | `2.08` (cant POA=127) | Cada 50 días ✔ |

Los tres casos cruzados coinciden exactamente en `cant` **y** en `frec` con las reglas ya congeladas en código (`RESOLVED_FRECUENCIA_OVERRIDES`, `src/lib/poaImport/validate.ts`). Esto es evidencia independiente (no pedida ni buscada a propósito) de que las reglas de frecuencia resueltas esta sesión son correctas — el legado del board ya las venía aplicando por su cuenta.

## Nivel 4 — Rendimientos

**Corrección a lo reportado antes de esta auditoría:** no es cierto que el rendimiento "no exista en ningún lado". Existe, real, en `items.values.rend` de los 177 items operativos — simplemente no está en `board_activity_standards` ni indexado por `activity_key`. Ejemplos: `PODA DE ARBOLES Y PALMAS` → rend=200 (UN); `FERTILIZACIÓN DE GRAMA` → rend=2500 (M2); `CONTROL FITOSANITARIO DE ARBOLES Y PALMAS` → rend=240 (UND).

Pendiente de verificar (no se hizo en esta auditoría): si el rendimiento de una misma actividad es **constante entre zonas** — igual que se exigió para `frecuencia` (Regla 18) — o si varía por sitio. Con los datos vistos (ej. `PODA DE ARBOLES Y PALMAS` → rend=200 en Miramar, Country y Sendero) parece constante, pero no se verificó sistemáticamente para las 50 actividades.

## Conclusión

No hay un problema de dominio (Caso C de la hipótesis original) — las tres representaciones describen el mismo contrato. El catálogo técnico (`board_activity_standards`) nunca se terminó de construir como pieza independiente; el rendimiento vive hoy disperso dentro del modelo legacy `items`/`daily_execution`, exactamente el mismo modelo que ADR-0007 ya señaló como legacy a migrar. Importar el POA sin resolver esto construiría el catálogo técnico "a ciegas" (sin rendimiento) cuando la información real ya existe, solo que no está en el lugar correcto.

**Nota (2026-07-18, posterior a este documento):** las preguntas 2-4 de abajo quedaron resueltas por una investigación posterior — ver `docs/discovery/poa-activity-equivalences.md` (clasificación item por item, con el hallazgo de que `item_type` — no el nombre — es la señal correcta para separar actividades de roles/insumos) y `docs/adr/ADR-0008-board-activity-standards-origin.md` (reglas de construcción ya aceptadas). Esta sección se conserva como registro de las preguntas originales, no se reescribe.

## Qué falta decidir

1. ~~Zona de SALINAS DEL REY~~ — **RESUELTO 2026-07-18**: es un sitio independiente, sin zona correspondiente en el POA 2026; no requiere acción. Ver Nivel 1 arriba.
2. ~~Tabla de equivalencias actividad↔actividad~~ — **AVANZADO 2026-07-18**: no son 177 items, son 145 con `item_type='activity'` (los otros 32 son roles/insumos, `item_type='financial'` — ver `poa-activity-equivalences.md`). De esos 145, 1 es un dato de prueba y 144 son actividades reales: 101 con propuesta de equivalencia, 43 sin equivalente. Confirmación humana pendiente (Flujo A/B), no un ajuste de algoritmo.
3. ~~¿El rendimiento es único por actividad, como ya se exige para la frecuencia?~~ — sigue sin verificarse sistemáticamente para las 50 actividades; queda dentro del alcance de Flujo A (confirmar candidatas) en `poa-activity-equivalences.md`.
4. ~~Construir el poblado de `board_activity_standards`~~ — las reglas de cómo hacerlo ya están congeladas en **ADR-0008** (solo `item_type='activity'`, ninguna equivalencia sin confirmación humana). Falta ejecutar Flujo A/B, no diseñar las reglas.
