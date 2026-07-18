# ADR-0008 — Origen y Reglas de Construcción de `board_activity_standards`

## Estado
Aceptado

## Fecha
2026-07-18

## Contexto
Al preparar la importación del POA 2026 sobre `Tablero Principal` (el único board con datos reales — 482 items, 10 groups) se encontró que `board_activity_standards` — el "Catálogo Técnico reducido" que ADR-0002 dejó como fuente de `rendimiento` para el motor de planificación — está vacío para ese board, y de hecho para toda la base (solo 7 filas en todo el sistema, todas `source: 'test'`, ningún `activity_key` real del POA 2026).

Antes de asumir que el rendimiento real "no existe en ningún lado" y que había que inventar una fuente nueva, se hizo una auditoría completa contra los datos reales de `Tablero Principal` (`docs/discovery/poa-vs-tablero-principal-audit.md`, `docs/discovery/poa-activity-equivalences.md`). Hallazgo central: el rendimiento **sí existe**, disperso dentro de `items.values` (el modelo legacy que ADR-0007 ya identificó como problema separado) — pero ese conjunto de items **no es un catálogo puro de actividades**. Verificado directamente contra código y base, no por inspección de nombres:

1. **`item_type: 'activity' | 'financial'` es un concepto real del dominio, nunca formalizado en el esquema.** No es una columna de `items` (`SELECT item_type FROM items` falla — no existe; un script suelto `db/add_item_type_column.sql`, fuera de `supabase/migrations/`, intentó promoverlo a columna y nunca se aplicó). Vive únicamente dentro del JSONB `values`, escrito activamente por 8 sitios de código vigente (`BoardViewContainer.tsx`, `ExecutionViewContainer.tsx`, `FinancialViewContainer.tsx`, `financial/BudgetImporter.tsx`, `BudgetSeeder.tsx`, `ActasModule.tsx`, `InitFinancialGroups.tsx`), tipado en `src/types/monday.ts` como discriminador de exactamente esos dos valores, y consumido activamente (`src/utils/itemUtils.ts: isFinancialItem/isActivityItem`; `ActasModule.isWorkActivity` excluye `'activity'` de los flujos de facturación). Verificación exhaustiva: **482/482 items de toda la base tienen uno de esos dos valores, sin excepción, sin deriva** (337 `financial`, 145 `activity`).
2. **La clasificación por nombre no es confiable; la clasificación por `item_type` sí.** Un matcher de texto sobre los 177 items operativos de Tablero Principal (9 zonas, excluye `PRESUPUESTO GENERAL`) solo detectó 14 de 32 items no-operativos reales — los 18 restantes (`SUPERVISORES - MTTO`, `Director`, `Jefe de Logística`, insumos como `COMPOST X 40KG`, `ROUNDUP (LTS)`...) tienen nombres que no siguen ningún patrón reconocible, pero **todos comparten `item_type: 'financial'`**.
3. **Esos 32 items `financial` son un artefacto de carga histórica, no un patrón de negocio.** Verificado por timestamp: los 32 están exclusivamente en el grupo `PLAZA PUERTO COLOMBIA`, creados en un único lote de 11 segundos (2026-07-18 aplica sobre datos con `created_at` 2026-03-01T15:36:27–38). Ningún otro de los 8 grupos operativos tiene un solo item `financial`.
4. **Una hipótesis de equivalencia (RIEGO MANUAL → POA `2.16`) se investigó, se intentó refutar, y no pasó la prueba** — evidencia mixta entre zonas (zonas con el conjunto completo de items muestran mayor discrepancia que zonas incompletas, patrón incompatible con una transformación sistemática del contrato). Queda registrado como ejemplo de método, no como regla: ninguna equivalencia de nombre se acepta sin evidencia numérica, y ni la evidencia numérica basta si no es consistente entre casos.

## Problema
Sin una regla explícita, la tentación más probable es "copiar `items` a `board_activity_standards`" o "hacer un matching de nombres y persistir lo que pase cierto umbral de similitud". Ambas repetirían exactamente el problema que esta auditoría encontró: mezclar actividades operativas con roles de personal e insumos porque compartían la misma tabla, y aceptar equivalencias no verificadas como si fueran hechos del catálogo técnico.

## Decisión
`board_activity_standards` se construye bajo estas reglas, sin excepción:

1. **Fuente: únicamente items con `item_type = 'activity'`.** Ningún item con `item_type = 'financial'` (ni ningún item sin `item_type` reconocible) participa en la construcción del catálogo técnico, sin importar su nombre o su contenido aparente.
2. **Ninguna equivalencia items↔POA se persiste sin confirmación humana explícita.** Un matcher automático (nombre, sinónimos, similitud de tokens) puede *proponer* candidatos y una puntuación de confianza, pero nunca decide ni escribe. La confianza del matcher es una prioridad de revisión, no un umbral de aceptación.
3. **Las actividades sin equivalente contractual claro quedan fuera del catálogo hasta que exista una decisión de negocio.** No se importan "por si acaso", no se descartan silenciosamente. Se documentan y esperan.
4. **El rendimiento es único por actividad, no por zona — mismo principio que Regla 18 (`poa-domain.md`) ya exige para la frecuencia.** Si el `rend` de una actividad varía entre zonas del legacy, eso es una pregunta de negocio nueva (¿cuál vale?, ¿por qué varía?), no una que este proceso resuelva promediando o eligiendo arbitrariamente.
5. **El proceso es reproducible y auditable.** Cada fila de `board_activity_standards` construida a partir de este proceso debe poder rastrearse hasta el item legacy de origen y la evidencia de la equivalencia (score, motivo, quién la confirmó) — no una carga silenciosa sin registro.

## Alternativas consideradas
- **Copiar todos los items de las zonas operativas tal cual.** Descartada: ya demostrado que ese conjunto mezcla actividades con roles/insumos (`item_type='financial'` sin filtrar) y con items sin equivalente contractual — copiar sin filtrar reintroduce exactamente el problema que esta investigación destapó.
- **Persistir automáticamente las equivalencias de alta confianza del matcher (≥95%) y solo revisar el resto.** Descartada: incluso las 25 equivalencias de mayor confianza fueron revisadas manualmente antes de darlas por buenas — automatizar ese paso ahorra poco tiempo real y le quita a un humano la última palabra sobre un dato que alimenta directamente la planificación.
- **Usar el nombre del item como criterio de filtrado (regex de roles conocidos).** Descartada con evidencia: un intento real de esto (esta misma sesión) dejó pasar 18 de 32 items no-operativos porque sus nombres no seguían ningún patrón — el campo estructural (`item_type`) es la única señal confiable.

## Consecuencias
- Ningún incremento futuro puede poblar `board_activity_standards` con un script de copia directa o un matcher que persista por su cuenta — cualquier PR que lo intente contradice este ADR.
- El paso de "construir el catálogo técnico" queda, a partir de aquí, como trabajo de diseño/decisión (qué hacer con las actividades sin equivalente, cómo confirma un humano cada fila) — no como investigación adicional; el descubrimiento de dominio que motivó este ADR se considera cerrado.
- `docs/discovery/poa-activity-equivalences.md` (177 items clasificados, con evidencia) es el insumo de entrada para ese trabajo de diseño, no una decisión en sí mismo.

## Documentos afectados
- `docs/discovery/poa-vs-tablero-principal-audit.md` (referenciado, evidencia original)
- `docs/discovery/poa-activity-equivalences.md` (referenciado, clasificación item por item)
- `docs/adr/ADR-0002-schedule-contractual-source.md` (referenciado — define `board_activity_standards` como Catálogo Técnico reducido; este ADR no lo modifica, solo fija cómo se puebla)
- `docs/adr/ADR-0007-daily-execution-legacy-model.md` (referenciado — `items.values` como modelo legacy es el mismo problema de fondo; este ADR resuelve la pieza de origen de datos técnicos, no la migración completa de consumidores)

## Criterio para revisar esta decisión
Si en el futuro `item_type` deja de ser un discriminador confiable (por ejemplo, si aparece un tercer valor, o si algún flujo empieza a dejarlo vacío de forma sistemática), este ADR se revisa — la Regla 1 depende explícitamente de que esa señal siga siendo estable.

## Criterio de finalización del ADR
Este ADR se considera aplicado cuando existe una implementación de poblado de `board_activity_standards` que: (a) filtra por `item_type='activity'` antes de cualquier otro procesamiento, (b) no persiste ninguna equivalencia sin un paso de confirmación humana registrado, (c) dejó fuera del catálogo, de forma explícita y documentada, toda actividad sin equivalente confirmado, y (d) es reproducible contra los mismos datos de origen sin producir un resultado distinto.
