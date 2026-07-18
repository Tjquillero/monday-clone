# Equivalencias propuestas: items operativos (legacy) vs. actividades del POA 2026

**Esto no es un ADR ni una decisión.** Es la salida de un matcher automático (normalización + sinónimos de dominio + similitud de tokens, script desechable en `scratch/`, no forma parte del código de producción) sobre los items de `item_type = 'activity'` de Tablero Principal, emparejados contra las 50 actividades del POA 2026 con cantidad contratada. **Nada se persiste en `board_activity_standards` todavía — cada fila necesita confirmación humana.**

## Fecha
2026-07-18 (revisado tras verificación adicional el mismo día — ver "Correcciones" abajo)

## Hallazgo arquitectónico

Los items del board no constituyen un catálogo puro de actividades — pero la señal correcta para separarlos **no es el nombre, es el campo `item_type`**. De 177 items en las 9 zonas operativas, 145 tienen `item_type: 'activity'` (candidatos reales) y 32 tienen `item_type: 'financial'` (ítems no operativos: roles de personal e insumos/materiales, ver sección 3 — ninguno debe mapearse a `board_activity_standards`). `board_activity_standards` debe poblarse filtrando por `item_type = 'activity'` primero, no por un matching de texto sobre el nombre. (Ver más abajo la verificación de que esta separación es un concepto real del dominio, no una coincidencia de un solo script.)

## Correcciones tras verificación adicional (mismo día)

**1. Los "roles/recursos" no eran 14, eran 32 — y la causa es un artefacto de carga histórica, no una regla del dominio.** Los 32 items con `item_type: 'financial'` (antes solo se habían detectado 14 por nombre) están **todos y exclusivamente en el grupo `PLAZA PUERTO COLOMBIA`**, y los 32 fueron creados en una sola operación el **2026-03-01 entre las 15:36:27 y 15:36:38** (11 segundos, inserción secuencial en lote — mismo patrón de timestamps consecutivos). Ningún otro de los 8 grupos operativos tiene un solo item `financial`; los 145 restantes son 100% `activity`. Conclusión: esto fue una carga puntual de detalle de costos (mano de obra + insumos) hecha una sola vez para un solo sitio, nunca replicada — no un patrón de negocio. No requiere ninguna decisión de dominio, solo confirmar si esos 32 items deben limpiarse o dejarse como están (no afectan la importación del POA).

**2. La hipótesis de "RIEGO MANUAL consolidado en 2.16" NO se confirma — evidencia mixta.** Se extendió la comprobación a las 6 zonas reales con `2.16` contratado:

| Zona | Items RIEGO encontrados | Suma legacy | `2.16` POA | Diferencia relativa |
|---|---|---|---|---|
| Miramar Sector El Faro | 3/3 | 5977 | 5976.7 | 0.0% |
| Sendero Santa Verónica | 2/3 (falta "árboles y palmas") | 5888 | 5887 | 0.0% |
| Plaza Puerto Colombia | 3/3 completos | 2108 | 2620.0 | 19.5% |
| Centro Gastronómico | 3/3 completos | 901 | 1053.5 | 14.5% |
| Playa del Country | 2/3 | 2406 | 2295 | 4.8% |
| Playa de Sabanilla 2 | 2/3 | 3764 | 3636.5 | 3.5% |

El patrón es contrario al esperado: las dos zonas con el conjunto **completo** de los 3 items (Plaza, Centro Gastronómico) muestran las mayores diferencias (14-20%), mientras que Sendero coincide casi exacto pese a faltarle un item. Ese comportamiento es incompatible con una transformación sistemática del contrato. Se confirmó, además, que ningún otro código del POA compite por esa cantidad (`2.17` = agua en carro tanque, unidad distinta; `3.1`/`3.11`/`3.12` = mantenimiento de infraestructura hidráulica, no riego de plantas) y que `2.16` no distingue tipo de vegetación en su redacción.

**Conclusión (redactada para evitar que se lea como un hecho dentro de seis meses):** se investigó la hipótesis de que el código `2.16` del POA consolidara las tres variantes legacy de RIEGO MANUAL. La verificación en las seis zonas con datos no produjo un patrón consistente. **La hipótesis queda descartada como regla general** y permanece únicamente como un candidato que requiere validación de negocio caso por caso, zona por zona — no como una equivalencia de catálogo (confianza degradada de 90% a 60% en la tabla de abajo).

## Procedencia de `item_type` (verificado antes de aceptar la separación como un hecho del dominio)

Antes de tratar `item_type = 'activity' | 'financial'` como un concepto real del dominio (y no una coincidencia de un solo script de carga), se verificaron sus cuatro preguntas clave directamente contra el código y la base:

1. **¿Quién lo escribe?** Código de aplicación real y vigente, no un script huérfano: `BoardViewContainer.tsx` y `ExecutionViewContainer.tsx` lo fijan en `'activity'` al crear un item normal del tablero; `FinancialViewContainer.tsx`, `financial/BudgetImporter.tsx`, `financial/BudgetSeeder.tsx`, `financial/ActasModule.tsx` e `InitFinancialGroups.tsx` lo fijan en `'financial'` al crear ítems de presupuesto/acta. Son 8 sitios de escritura activos, no uno solo.
2. **¿Existe una restricción CHECK o ENUM en la base?** **No.** `item_type` **no es una columna de la tabla `items`** — verificado directamente (`SELECT item_type FROM items` falla: `column items.item_type does not exist`). Vive exclusivamente dentro del JSONB `values`, sin ninguna restricción de esquema. Existe un script suelto (`db/add_item_type_column.sql`, fuera de `supabase/migrations/`, sin tracking de migración) que intentaba promoverlo a columna con `DEFAULT 'activity'` — nunca se aplicó a la base real.
3. **¿Siempre tuvo únicamente `'activity'`/`'financial'`?** Se consultaron los 482 items de **toda la base** (no solo Tablero Principal): **337 `financial` + 145 `activity` = 482, sin un solo valor ausente, nulo, o distinto a esos dos.** Cobertura del 100%, sin deriva. `src/types/monday.ts:12` lo documenta como discriminador de exactamente esos dos valores; `src/utils/itemUtils.ts` (`isFinancialItem`/`isActivityItem`) incluye un *fallback* a `rubro` precisamente para los pocos ítems históricos anteriores a la convención — evidencia de que se retrofiteó, no de que sea inconsistente hoy.
4. **¿Lo usa el frontend, o quedó olvidado?** Se usa activamente: `ActasModule.tsx` excluye explícitamente los ítems `item_type === 'activity'` de los flujos de facturación (`isWorkActivity`), y `FinancialViewContainer`/`ExecutionViewContainer` lo fijan como parte central de sus mutaciones de creación de ítems.

**Conclusión: no es un accidente histórico — es un concepto del dominio real y activamente usado, que nunca se promovió al nivel de esquema.** El modelo `items` ya distingue, en la práctica (aunque no en el schema), tres capas: **Contrato** (POA), **Operación** (`item_type='activity'`) y **Costos y recursos** (`item_type='financial'`, que a su vez mezcla roles de personal e insumos/materiales). Esa separación implícita es la explicación real de por qué el legacy parecía heterogéneo — no es que falte estructura, es que la estructura existe en el código de aplicación y nunca migró al modelo de datos.

## Resumen de la clasificación (177 items, 9 zonas operativas)

| Resultado | Cantidad |
|---|---|
| Items legacy analizados | 177 |
| No operativos (`item_type='financial'`) | 32 |
| **`item_type='activity'`** | **145** |
| — Basura / prueba (`QA-Engine-...`, ver sección 4) | 1 |
| — **Operativas reales** | **144** |
| —— Candidatas con propuesta de equivalencia (Flujo A) | 101 |
| —— Sin equivalente (Flujo B) | 43 |

Esta tabla reconstruye de dónde sale el catálogo final, en dos niveles: 177 = 32 (`financial`) + 145 (`activity`); y dentro de los 145 con `item_type='activity'`, 1 es basura/prueba (tiene el `item_type` correcto pero no es una actividad real) y 144 sí lo son, de las cuales 101 tienen candidato y 43 no. Nada se pierde ni se cuenta dos veces.

| Categoría | Cantidad | Acción |
|---|---|---|
| Actividades (`item_type='activity'`) → candidatas a `board_activity_standards` | 101 | Flujo A — confirmación humana, ver sección 1 |
| Actividades sin equivalente contractual claro | 43 | Flujo B — clasificación + decisión de negocio, ver sección 2 |
| Roles / insumos (`item_type='financial'`, todos en Plaza Puerto Colombia, carga histórica del 2026-03-01) | 32 | Excluidos por diseño — no son actividades |
| Datos de prueba / basura | 1 | Excluir y documentar su eliminación |

## Próximo incremento (fuera de alcance de este documento — no se ejecuta aquí)

Este documento cierra la fase de **descubrimiento**. El trabajo que sigue es de **diseño**, dividido en dos flujos independientes (no se mezclan):

- **Flujo A — confirmación de las 101 candidatas.** Es prácticamente una validación: para cada fila, terminar en `Confirmada` (con el código POA) o corregida. Al cerrar, esas filas pueblan `board_activity_standards` (bajo las reglas de ADR-0008).
- **Flujo B — clasificación de las 43 sin equivalente**, antes de decidir nada caso por caso. Cada una debe terminar en una de estas categorías: (1) actividad eliminada del contrato 2026, (2) actividad absorbida por otra del POA, (3) actividad operativa interna que nunca existió en el POA, (4) error histórico/duplicado/dato legacy, (5) actividad contractual nueva que el matcher no detectó. Solo después se decide qué hacer con cada grupo.

## Flujo A: EJECUTADO (2026-07-18)

Las 101 filas se redujeron a **17 nombres de actividad distintos** (0 inconsistencias de código entre zonas — cada nombre siempre propuso el mismo código POA). De los 17:

- **14 confirmados y poblados en `board_activity_standards`** (board-level, `group_id = NULL`, `source = 'poa_2026_legacy_confirmed'`): `1.09`, `1.10`, `1.11`, `1.15`, `2.06`–`2.14` (excepto `2.15`–`2.22`, no propuestas), `3.04`. Rendimiento consistente entre zonas en 13 de 14 — la única excepción (`3.04`, Lavado a presión de zonas duras: 3 zonas con rend=7000, 1 con rend=3000 en Centro Gastronómico) se resolvió usando el valor mayoritario (7000), sin investigar la causa de la zona atípica — decisión explícita del responsable del proceso, no un supuesto del sistema.
- **3 nombres (RIEGO MANUAL — grama/árboles y palmas/arbustos y cubresuelos, 18 filas) se movieron a Flujo B.** Ya se había documentado que la hipótesis de consolidación en `2.16` no se confirmó como regla general (ver "Correcciones" arriba) — no correspondía confirmarlas en Flujo A con una confianza degradada del 60%.

> **Nota ligada a `board_activity_standards.activity_key = '3.04'`** (la única excepción al principio de "un rendimiento por actividad" en este lote): 3 zonas (Sendero Santa Verónica, Miramar Sector El Faro, Playa del Country) reportan `rend=7000`; Centro Gastronómico reporta `rend=3000`. Se insertó `rendimiento=7000` por decisión explícita del responsable del proceso, tomada por mayoría (3 de 4) — **no se investigó** si Centro Gastronómico tiene una condición real distinta (superficie, equipo, tipo de piso) que justifique el valor menor. Si en el futuro se detecta una diferencia real de rendimiento por sitio para esta actividad, la vía correcta es una excepción de sitio (`board_activity_standards.group_id = <group de Centro Gastronómico>`), no reabrir esta decisión de contrato.

**Hallazgo adicional durante la ejecución, resuelto antes de insertar:** existe `docs/MAINTENANCE_SCHEDULING_ENGINE_v1.md` (2026-06-28, "CONGELADO"), un documento de diseño anterior a ADR-0002 con una "Seed inicial (23 actividades)" que se solapa parcialmente con estas 14 (por nombre/rendimiento, usando una convención de `activity_key` en snake_case distinta a la adoptada — código POA). De 11 actividades comparables, 3 coincidieron en rendimiento exacto y 8 no (algunas con más de 70% de diferencia). Se decidió **no usar ese documento como fuente** — nunca se cargó a `board_activity_standards` real, y su convención de `activity_key` quedó superada por ADR-0002. El rendimiento usado es el de los items legacy reales (`items.values.rend`), no el del documento de diseño.

**Flujo B queda ahora con 43 + 18 (riego) = 61 filas por clasificar** — las 43 originales de la sección 2, más las 18 filas de RIEGO MANUAL (3 nombres distintos) que se movieron aquí. Aún no se dedujo por nombre único dentro de las 43 originales; eso puede ahorrar trabajo de revisión en Flujo B tal como ocurrió en Flujo A.

No se resuelven las 144 actividades juntas — son dos preguntas distintas con dos criterios de cierre distintos.

## Flujo B: EJECUTADO (parcial, 2026-07-18)

Las 61 filas se redujeron a **11 nombres distintos** (mismo ahorro que en Flujo A). Se buscó evidencia por palabra clave contra el texto completo del POA (no solo contra las 50 actividades ya contratadas) antes de clasificar cada uno, y se verificó por cantidad contratada antes de aceptar cualquier candidato.

**Categorías finales usadas** (refinadas durante la ejecución, separando "absorbida" — consolidación real de varias actividades legacy en una — de "el matcher no detectó" — correspondencia 1:1 real que el texto no encontró por vocabulario distinto):
1. Absorbida por otra actividad del POA (consolidación muchos→uno)
2. Eliminada del contrato 2026
3. Actividad operativa interna / de cronograma, fuera del alcance del POA
4. Placeholder / dato de prueba / legacy
5. Actividad contractual real que el matcher no detectó (correspondencia 1:1)

### Categoría 5 — confirmadas e insertadas en `board_activity_standards` (5 filas)

| Item legacy | `activity_key` | rendimiento | Evidencia |
|---|---|---|---|
| `LIMPIEZA GENERAL DE MARMOL` | `3.06` PULIDO Y ENCERADO DE PISOS DE MÁRMOL | 300 | 2/2 zonas coinciden exacto en cantidad. Rendimiento con empate real entre 2 sitios contratados (Plaza Puerto Colombia=600, Centro Gastronómico=300, Salinas del Rey=600 pero `cant=0` no cuenta) — se usó el valor del sitio con volumen real alto (Centro Gastronómico), no una mayoría (no la había). |
| `OXIGENACIÓN DE ARENA CON TRACTOR Y RASTRA` | `1.14` NIVELACIÓN MECÁNICA DE PLAYAS | 18000 | **Corrección durante la revisión:** `1.14` no dice "oxigenación" — dice "nivelación mecánica de playas". La hipótesis inicial ("es un duplicado de `1.15`") se descartó por evidencia, no por suposición: `1.14` y `1.15` comparten la cantidad contratada exacta en cada zona (mismo M2 de playa) pero tienen `frecuencia` distinta por zona (1.14 siempre 1; 1.15 varía 1-6) — son dos servicios reales sobre la misma superficie, no un duplicado. El item legacy que ya se confirmó como `1.15` en Flujo A tiene un nombre casi textual al POA; este otro (más informal, de campo) quedó asignado a `1.14` por descarte + coincidencia parcial de cantidad (2/4 exacta, resto cercana). |
| `LIMPIEZA GENERAL ZONAS DURAS` | `3.03` ASEO Y LIMPIEZA DE ZONAS DURAS | 10000 | 4/6 zonas exacto; Plaza Puerto Colombia 2% distinto, Centro Gastronómico bastante distinto (posible mezcla con otra actividad en ese sitio, no investigado a fondo) |
| `ACOPIO Y LIMPIEZA MANUAL CON PERSONAL` | `1.01` LIMPIEZA MANUAL DE INFRAESTRUCTURA COSTERA | 3000 | 3/4 exacto; Manglares exactamente el doble (30000 vs 15000 contratado) — posible duplicación de dato en el legacy, no error de mapeo, sin investigar más |
| `DESMALEZADO` | `2.01` CONTROL DE MALEZAS MECÁNICA DE ARBUSTOS Y CUBRESUELOS | 600 | 4/6 exacto; Miramar y Plaza Puerto Colombia no coinciden |

Con esto, `board_activity_standards` para Tablero Principal tiene **19 filas vigentes** (14 de Flujo A + 5 de Flujo B), todas `source='poa_2026_legacy_confirmed'`.

### Categoría 3 — operativa interna/cronograma, fuera del POA (no se inserta)

- **`PLATEO`** — confirmado por conocimiento de negocio del responsable del proceso (no hay ninguna mención en el texto del POA; existía en un catálogo anterior — `MAINTENANCE_SCHEDULING_ENGINE_v1.md`, rend=160 — pero eso no significa que fue "eliminada del contrato", sino que nunca perteneció al universo contractual del POA en sí).
- **`LIMPIEZA GENERAL`** — 0/4 coincidencias con su mejor candidato (`1.01`), magnitudes 3-10x distintas en las 4 zonas comparadas. Sin candidato real en el texto completo del POA. Aparece en las 7 zonas con el mismo `rend=7500` — parece una categoría de seguimiento operativo interno, no una actividad contractual.

### Categoría 4 — placeholder / dato legacy (no se inserta, candidato a limpieza)

- **`Nueva Actividad`** (x2, en Playa del Country) — sin `rend`/`frec`/`cant`, nombre por defecto de un item nunca completado. No es una actividad real; se recomienda evaluar su eliminación del board (fuera de alcance de este documento).

### RIEGO MANUAL — RESUELTO (2026-07-18): excepción conocida, fuera de `board_activity_standards` por ahora

**Hallazgo posterior al intento de consolidación en `2.16`:** operativamente existen tres actividades de riego reales (grama/árboles/arbustos), cada una con rendimiento distinto — confirmado por conocimiento de negocio. Pero el modelo de dominio congelado **no tiene dónde representar eso**: `poa-domain.md` define la identidad técnica del Catálogo Técnico por el mismo **código** que usa el Catálogo Contractual (glosario, "Catálogo Técnico"), y `resolveValidationContext.ts` valida `board_activity_standards.activity_key` directamente contra los códigos del POA — no existe hoy ningún mecanismo M:1 (varias actividades operativas certificando contra un mismo código contractual), a diferencia de `activity_scope_mappings` que sí existe pero para un problema distinto (`activity_key`↔`scope_key`).

**Verificación de si es un caso aislado o un patrón repetido** (antes de decidir si esto amerita un ADR nuevo): de las 25 actividades legacy distintas revisadas entre Flujo A y Flujo B, las familias con las mismas 3 variantes por tipo de vegetación (grama/árboles/arbustos) — CONTROL FITOSANITARIO, FERTILIZACIÓN, PODA — **sí tienen partición 1:1 exacta en el POA** (`2.06`/`2.07`/`2.08`; `2.09`/`2.10`/`2.11`; `2.12`/`2.13`/`2.14`). RIEGO MANUAL es la única familia donde el POA consolidó las 3 variantes en un solo código (`2.16`). **No se encontró un segundo caso.**

**Decisión:** con un solo caso conocido, no se justifica reabrir `poa-domain.md`/`schedule-domain.md` (dominio recién congelado) para resolver una excepción aislada. RIEGO MANUAL queda documentado como **limitación conocida del modelo actual** — no se inserta en `board_activity_standards`, no bloquea la importación del resto del POA (no es una de las 220 actividades técnicas que participan en la regla todo-o-nada de ADR-0004). Si en el futuro aparece un segundo caso con el mismo patrón (ej. "poda alta/poda baja", "lavado manual/mecánico" certificando contra un mismo código), la pregunta deja de ser sobre RIEGO MANUAL específicamente y pasa a ser una pregunta de arquitectura general — *¿puede una actividad contractual tener varios estándares operativos?* — que sí ameritaría su propio ADR.

**Flujo B queda cerrado en los 11 nombres**: 5 insertados en `board_activity_standards`, 2 clasificados fuera de alcance del POA (`PLATEO`, `LIMPIEZA GENERAL`), 1 placeholder a limpiar (`Nueva Actividad`), y RIEGO MANUAL (3 nombres) documentado como excepción conocida, sin insertar.

## 1. Actividades → candidatas a `board_activity_standards`

101 filas totales = 25 (Alta) + 58 (Media) + 18 adicionales (las 3 variantes de `RIEGO MANUAL` × 6 zonas) que **no se repiten aquí** — su candidato (`2.16`) y su confianza degradada (60%, tras la verificación que NO confirmó la hipótesis) ya están documentados fila por fila en "Correcciones" arriba, para no duplicar la misma evidencia dos veces.

### Alta confianza (≥95%) — 25 filas

| Confianza | Grupo | Item (legacy) | rend/frec/cant | Actividad POA propuesta | Nota | Estado |
|---|---|---|---|---|---|---|
| 100% | PLAYA DEL COUNTRY | CARGUE CON TRACTOR DE MATERIAL ACOPIADO Y CLASIFICADO EN VOLQUETAS | rend=6450 frec=4 cant=10000 | `1.11` CARGUE CON MAQUINARIA DE MATERIAL ACOPIADO  Y CLASIFICADO EN |  | Pendiente confirmar |
| 100% | MANGLARES | CARGUE CON TRACTOR DE MATERIAL ACOPIADO Y CLASIFICADO EN VOLQUETAS | rend=6450 frec=4 cant=7045 | `1.11` CARGUE CON MAQUINARIA DE MATERIAL ACOPIADO  Y CLASIFICADO EN |  | Pendiente confirmar |
| 100% | PLAZA PUERTO COLOMBIA | CARGUE CON TRACTOR DE MATERIAL ACOPIADO Y CLASIFICADO EN VOLQUETAS | rend=6450 frec=4 cant=1183 | `1.11` CARGUE CON MAQUINARIA DE MATERIAL ACOPIADO  Y CLASIFICADO EN |  | Pendiente confirmar |
| 100% | PLAYA DE SABANILLA 2 | CARGUE CON TRACTOR DE MATERIAL ACOPIADO Y CLASIFICADO EN VOLQUETAS | rend=6450 frec=4 cant=10000 | `1.11` CARGUE CON MAQUINARIA DE MATERIAL ACOPIADO  Y CLASIFICADO EN |  | Pendiente confirmar |
| 100% | SALINAS DEL REY | CARGUE CON TRACTOR DE MATERIAL ACOPIADO Y CLASIFICADO EN VOLQUETAS | rend=6450 frec=4 cant=11706 | `1.11` CARGUE CON MAQUINARIA DE MATERIAL ACOPIADO  Y CLASIFICADO EN |  | Pendiente confirmar |
| 100% | MIRAMAR SECTOR EL FARO | CONTROL FITOSANITARIO ARBUSTOS Y CUBRESUELOS | rend=2000 frec=50 cant=4932 | `2.06` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | SENDERO SANTA VERÓNICA | CONTROL FITOSANITARIO ARBUSTOS Y CUBRESUELOS | rend=2000 frec=50 cant=1225 | `2.06` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | PLAYA DEL COUNTRY | CONTROL FITOSANITARIO ARBUSTOS Y CUBRESUELOS | rend=2000 frec=50 cant=2295 | `2.06` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | PLAZA PUERTO COLOMBIA | CONTROL FITOSANITARIO ARBUSTOS Y CUBRESUELOS | rend=2000 frec=50 cant=1500 | `2.06` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | PLAYA DE SABANILLA 2 | CONTROL FITOSANITARIO ARBUSTOS Y CUBRESUELOS | rend=2000 frec=50 cant=3637 | `2.06` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | SALINAS DEL REY | CONTROL FITOSANITARIO ARBUSTOS Y CUBRESUELOS | rend=2000 frec=50 cant=572 | `2.06` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | CENTRO GASTRONÓMICO | CONTROL FITOSANITARIO ARBUSTOS Y CUBRESUELOS | rend=2000 frec=50 cant=724 | `2.06` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | MIRAMAR SECTOR EL FARO | CONTROL FITOSANITARIO DE ARBOLES Y PALMAS | rend=240 frec=50 cant=214 | `2.08` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | SENDERO SANTA VERÓNICA | CONTROL FITOSANITARIO DE ARBOLES Y PALMAS | rend=240 frec=50 cant=243 | `2.08` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | PLAYA DEL COUNTRY | CONTROL FITOSANITARIO DE ARBOLES Y PALMAS | rend=240 frec=50 cant=111 | `2.08` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | PLAZA PUERTO COLOMBIA | CONTROL FITOSANITARIO DE ARBOLES Y PALMAS | rend=240 frec=50 cant=164 | `2.08` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | PLAYA DE SABANILLA 2 | CONTROL FITOSANITARIO DE ARBOLES Y PALMAS | rend=240 frec=50 cant=127 | `2.08` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | SALINAS DEL REY | CONTROL FITOSANITARIO DE ARBOLES Y PALMAS | rend=240 frec=50 cant=0 | `2.08` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | CENTRO GASTRONÓMICO | CONTROL FITOSANITARIO DE ARBOLES Y PALMAS | rend=240 frec=50 cant=111 | `2.08` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | MIRAMAR SECTOR EL FARO | CONTROL FITOSANITARIO GRAMA | rend=2000 frec=50 cant=831 | `2.07` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | SENDERO SANTA VERÓNICA | CONTROL FITOSANITARIO GRAMA | rend=2000 frec=50 cant=4663 | `2.07` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | PLAZA PUERTO COLOMBIA | CONTROL FITOSANITARIO GRAMA | rend=2000 frec=50 cant=444 | `2.07` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | PLAYA DE SABANILLA 2 | CONTROL FITOSANITARIO GRAMA | rend=2000 frec=50 cant=0 | `2.07` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | SALINAS DEL REY | CONTROL FITOSANITARIO GRAMA | rend=2000 frec=50 cant=55 | `2.07` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |
| 100% | CENTRO GASTRONÓMICO | CONTROL FITOSANITARIO GRAMA | rend=2000 frec=50 cant=66 | `2.07` SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN C |  | Pendiente confirmar |

### Media/verificada (80-95%) — 58 filas

| Confianza | Grupo | Item (legacy) | rend/frec/cant | Actividad POA propuesta | Nota | Estado |
|---|---|---|---|---|---|---|
| 94% | MIRAMAR SECTOR EL FARO | LAVADO A PRESIÓN ZONAS DURAS | rend=7000 frec=1 cant=12607 | `3.04` LAVADA A PRESIÓN DE ZONAS DURAS, INCLUYE TODOS LOS INSUMOS,  |  | Pendiente confirmar |
| 94% | SENDERO SANTA VERÓNICA | LAVADO A PRESIÓN ZONAS DURAS | rend=7000 frec=1 cant=1881 | `3.04` LAVADA A PRESIÓN DE ZONAS DURAS, INCLUYE TODOS LOS INSUMOS,  |  | Pendiente confirmar |
| 94% | PLAYA DEL COUNTRY | LAVADO A PRESIÓN ZONAS DURAS | rend=7000 frec=1 cant=3852 | `3.04` LAVADA A PRESIÓN DE ZONAS DURAS, INCLUYE TODOS LOS INSUMOS,  |  | Pendiente confirmar |
| 94% | CENTRO GASTRONÓMICO | LAVADO A PRESIÓN ZONAS DURAS | rend=3000 frec=1 cant=11718 | `3.04` LAVADA A PRESIÓN DE ZONAS DURAS, INCLUYE TODOS LOS INSUMOS,  |  | Pendiente confirmar |
| 94% | PLAYA DEL COUNTRY | SUMINISTRO DE PERSONAL, INSUMOS, HERRAMIENTAS Y EQUIPOS PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA DE PLAYAS | rend=85000 frec=6 cant=19287 | `1.15` SUMINISTRO Y DISPOSICIÓN DE  EQUIPOS Y PERSONAL ESPECIALIZAD |  | Pendiente confirmar |
| 94% | MANGLARES | SUMINISTRO DE PERSONAL, INSUMOS, HERRAMIENTAS Y EQUIPOS PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA DE PLAYAS | rend=85000 frec=8 cant=14070 | `1.15` SUMINISTRO Y DISPOSICIÓN DE  EQUIPOS Y PERSONAL ESPECIALIZAD |  | Pendiente confirmar |
| 94% | PLAZA PUERTO COLOMBIA | SUMINISTRO DE PERSONAL, INSUMOS, HERRAMIENTAS Y EQUIPOS PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA DE PLAYAS | rend=85000 frec=8 cant=7887 | `1.15` SUMINISTRO Y DISPOSICIÓN DE  EQUIPOS Y PERSONAL ESPECIALIZAD |  | Pendiente confirmar |
| 94% | PLAYA DE SABANILLA 2 | SUMINISTRO DE PERSONAL, INSUMOS, HERRAMIENTAS Y EQUIPOS PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA DE PLAYAS | rend=85000 frec=8 cant=18070 | `1.15` SUMINISTRO Y DISPOSICIÓN DE  EQUIPOS Y PERSONAL ESPECIALIZAD |  | Pendiente confirmar |
| 94% | SALINAS DEL REY | SUMINISTRO DE PERSONAL, INSUMOS, HERRAMIENTAS Y EQUIPOS PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA DE PLAYAS | rend=85000 frec=8 cant=23412 | `1.15` SUMINISTRO Y DISPOSICIÓN DE  EQUIPOS Y PERSONAL ESPECIALIZAD |  | Pendiente confirmar |
| 88% | MIRAMAR SECTOR EL FARO | FERTILIZACION DE ARBOLES Y PALMAS | rend=240 frec=75 cant=214 | `2.11` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA MANEJO NUTRICI |  | Pendiente confirmar |
| 88% | SENDERO SANTA VERÓNICA | FERTILIZACION DE ARBOLES Y PALMAS | rend=240 frec=75 cant=243 | `2.11` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA MANEJO NUTRICI |  | Pendiente confirmar |
| 88% | PLAYA DEL COUNTRY | FERTILIZACION DE ARBOLES Y PALMAS | rend=240 frec=75 cant=111 | `2.11` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA MANEJO NUTRICI |  | Pendiente confirmar |
| 88% | PLAZA PUERTO COLOMBIA | FERTILIZACION DE ARBOLES Y PALMAS | rend=240 frec=75 cant=164 | `2.11` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA MANEJO NUTRICI |  | Pendiente confirmar |
| 88% | PLAYA DE SABANILLA 2 | FERTILIZACION DE ARBOLES Y PALMAS | rend=240 frec=75 cant=127 | `2.11` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA MANEJO NUTRICI |  | Pendiente confirmar |
| 88% | SALINAS DEL REY | FERTILIZACION DE ARBOLES Y PALMAS | rend=240 frec=75 cant=0 | `2.11` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA MANEJO NUTRICI |  | Pendiente confirmar |
| 88% | CENTRO GASTRONÓMICO | FERTILIZACION DE ARBOLES Y PALMAS | rend=240 frec=75 cant=111 | `2.11` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA MANEJO NUTRICI |  | Pendiente confirmar |
| 88% | MIRAMAR SECTOR EL FARO | FERTILIZACION DE ARBUSTOS Y CUBRE SUELOS | rend=2500 frec=75 cant=4932 | `2.09` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA ARBUSTOS Y CUB |  | Pendiente confirmar |
| 88% | SENDERO SANTA VERÓNICA | FERTILIZACION DE ARBUSTOS Y CUBRE SUELOS | rend=2500 frec=75 cant=1225 | `2.09` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA ARBUSTOS Y CUB |  | Pendiente confirmar |
| 88% | PLAYA DEL COUNTRY | FERTILIZACION DE ARBUSTOS Y CUBRE SUELOS | rend=2500 frec=75 cant=2295 | `2.09` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA ARBUSTOS Y CUB |  | Pendiente confirmar |
| 88% | PLAZA PUERTO COLOMBIA | FERTILIZACION DE ARBUSTOS Y CUBRE SUELOS | rend=2500 frec=75 cant=1500 | `2.09` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA ARBUSTOS Y CUB |  | Pendiente confirmar |
| 88% | PLAYA DE SABANILLA 2 | FERTILIZACION DE ARBUSTOS Y CUBRE SUELOS | rend=2500 frec=75 cant=3637 | `2.09` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA ARBUSTOS Y CUB |  | Pendiente confirmar |
| 88% | SALINAS DEL REY | FERTILIZACION DE ARBUSTOS Y CUBRE SUELOS | rend=2500 frec=75 cant=572 | `2.09` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA ARBUSTOS Y CUB |  | Pendiente confirmar |
| 88% | CENTRO GASTRONÓMICO | FERTILIZACION DE ARBUSTOS Y CUBRE SUELOS | rend=2500 frec=75 cant=724 | `2.09` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA ARBUSTOS Y CUB |  | Pendiente confirmar |
| 88% | MIRAMAR SECTOR EL FARO | PODA DE ARBOLES Y PALMAS | rend=200 frec=75 cant=214 | `2.14` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | SENDERO SANTA VERÓNICA | PODA DE ARBOLES Y PALMAS | rend=200 frec=75 cant=243 | `2.14` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | PLAYA DEL COUNTRY | PODA DE ARBOLES Y PALMAS | rend=200 frec=75 cant=111 | `2.14` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | PLAZA PUERTO COLOMBIA | PODA DE ARBOLES Y PALMAS | rend=200 frec=75 cant=164 | `2.14` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | PLAYA DE SABANILLA 2 | PODA DE ARBOLES Y PALMAS | rend=200 frec=75 cant=127 | `2.14` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | SALINAS DEL REY | PODA DE ARBOLES Y PALMAS | rend=200 frec=75 cant=0 | `2.14` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | CENTRO GASTRONÓMICO | PODA DE ARBOLES Y PALMAS | rend=200 frec=75 cant=111 | `2.14` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | MIRAMAR SECTOR EL FARO | PODA DE ARBUSTOS Y CUBRE SUELOS | rend=1200 frec=12.5 cant=4932 | `2.12` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | SENDERO SANTA VERÓNICA | PODA DE ARBUSTOS Y CUBRE SUELOS | rend=1200 frec=12.5 cant=1225 | `2.12` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | PLAYA DEL COUNTRY | PODA DE ARBUSTOS Y CUBRE SUELOS | rend=1200 frec=12.5 cant=2295 | `2.12` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | PLAZA PUERTO COLOMBIA | PODA DE ARBUSTOS Y CUBRE SUELOS | rend=1200 frec=12.5 cant=1500 | `2.12` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | PLAYA DE SABANILLA 2 | PODA DE ARBUSTOS Y CUBRE SUELOS | rend=1200 frec=12.5 cant=3637 | `2.12` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | SALINAS DEL REY | PODA DE ARBUSTOS Y CUBRE SUELOS | rend=1200 frec=12.5 cant=572 | `2.12` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 88% | CENTRO GASTRONÓMICO | PODA DE ARBUSTOS Y CUBRE SUELOS | rend=1200 frec=12.5 cant=724 | `2.12` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATI |  | Pendiente confirmar |
| 86% | PLAYA DEL COUNTRY | ARRUME CON TRACTOR EN SITIO ESTRATEGICO (TRASIEGO) | rend=5000 frec=4 cant=10000 | `1.10` TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO |  | Pendiente confirmar |
| 86% | MANGLARES | ARRUME CON TRACTOR EN SITIO ESTRATEGICO (TRASIEGO) | rend=5000 frec=4 cant=7045 | `1.10` TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO |  | Pendiente confirmar |
| 86% | PLAZA PUERTO COLOMBIA | ARRUME CON TRACTOR EN SITIO ESTRATEGICO (TRASIEGO) | rend=5000 frec=4 cant=1183 | `1.10` TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO |  | Pendiente confirmar |
| 86% | PLAYA DE SABANILLA 2 | ARRUME CON TRACTOR EN SITIO ESTRATEGICO (TRASIEGO) | rend=5000 frec=4 cant=10000 | `1.10` TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO |  | Pendiente confirmar |
| 86% | SALINAS DEL REY | ARRUME CON TRACTOR EN SITIO ESTRATEGICO (TRASIEGO) | rend=5000 frec=4 cant=11706 | `1.10` TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO |  | Pendiente confirmar |
| 85% | MANGLARES | CORTE DE TRONCOS DE MADERA | rend=20 frec=4 cant=350 | `1.09` CORTE DE TRONCOS DE MADERA EN PLAYA (LONG MAX DE 8 m) |  | Pendiente confirmar |
| 85% | PLAZA PUERTO COLOMBIA | CORTE DE TRONCOS DE MADERA | rend=20 frec=4 cant=350 | `1.09` CORTE DE TRONCOS DE MADERA EN PLAYA (LONG MAX DE 8 m) |  | Pendiente confirmar |
| 85% | PLAYA DE SABANILLA 2 | CORTE DE TRONCOS DE MADERA | rend=20 frec=1 cant=350 | `1.09` CORTE DE TRONCOS DE MADERA EN PLAYA (LONG MAX DE 8 m) |  | Pendiente confirmar |
| 85% | SALINAS DEL REY | CORTE DE TRONCOS DE MADERA | rend=20 frec=4 cant=350 | `1.09` CORTE DE TRONCOS DE MADERA EN PLAYA (LONG MAX DE 8 m) |  | Pendiente confirmar |
| 85% | MIRAMAR SECTOR EL FARO | FERTILIZACIÓN DE GRAMA | rend=2500 frec=75 cant=214 | `2.10` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA GRAMA, FERTILI |  | Pendiente confirmar |
| 85% | SENDERO SANTA VERÓNICA | FERTILIZACIÓN DE GRAMA | rend=2500 frec=75 cant=4663 | `2.10` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA GRAMA, FERTILI |  | Pendiente confirmar |
| 85% | PLAZA PUERTO COLOMBIA | FERTILIZACIÓN DE GRAMA | rend=2500 frec=75 cant=444 | `2.10` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA GRAMA, FERTILI |  | Pendiente confirmar |
| 85% | PLAYA DE SABANILLA 2 | FERTILIZACIÓN DE GRAMA | rend=2500 frec=75 cant=0 | `2.10` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA GRAMA, FERTILI |  | Pendiente confirmar |
| 85% | SALINAS DEL REY | FERTILIZACIÓN DE GRAMA | rend=2500 frec=75 cant=55 | `2.10` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA GRAMA, FERTILI |  | Pendiente confirmar |
| 85% | CENTRO GASTRONÓMICO | FERTILIZACIÓN DE GRAMA | rend=2500 frec=75 cant=66 | `2.10` SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA GRAMA, FERTILI |  | Pendiente confirmar |
| 82% | MIRAMAR SECTOR EL FARO | PODA DE GRAMA | rend=5000 frec=1 cant=831 | `2.13` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA DE GRAMA  |  | Pendiente confirmar |
| 82% | SENDERO SANTA VERÓNICA | PODA DE GRAMA | rend=5000 frec=1 cant=4663 | `2.13` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA DE GRAMA  |  | Pendiente confirmar |
| 82% | PLAZA PUERTO COLOMBIA | PODA DE GRAMA | rend=5000 frec=1 cant=444 | `2.13` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA DE GRAMA  |  | Pendiente confirmar |
| 82% | PLAYA DE SABANILLA 2 | PODA DE GRAMA | rend=5000 frec=25 cant=0 | `2.13` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA DE GRAMA  |  | Pendiente confirmar |
| 82% | SALINAS DEL REY | PODA DE GRAMA | rend=5000 frec=1 cant=55 | `2.13` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA DE GRAMA  |  | Pendiente confirmar |
| 82% | CENTRO GASTRONÓMICO | PODA DE GRAMA | rend=5000 frec=1 cant=66 | `2.13` SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA DE GRAMA  |  | Pendiente confirmar |

## 2. Sin equivalente contractual claro (a revisar) — 43 filas

| Confianza | Grupo | Item (legacy) | rend/frec/cant | Actividad POA propuesta | Nota | Estado |
|---|---|---|---|---|---|---|
| 70% | MIRAMAR SECTOR EL FARO | LIMPIEZA GENERAL ZONAS DURAS | rend=10000 frec=25 cant=12607 | `3.03` SUMINISTRO DE INSUMOS Y PERSONAL ASEO Y LIMPIEZA DE ZONAS DU |  | Pendiente confirmar |
| 70% | SENDERO SANTA VERÓNICA | LIMPIEZA GENERAL ZONAS DURAS | rend=10000 frec=25 cant=1881 | `3.03` SUMINISTRO DE INSUMOS Y PERSONAL ASEO Y LIMPIEZA DE ZONAS DU |  | Pendiente confirmar |
| 70% | PLAYA DEL COUNTRY | LIMPIEZA GENERAL ZONAS DURAS | rend=10000 frec=25 cant=3852 | `3.03` SUMINISTRO DE INSUMOS Y PERSONAL ASEO Y LIMPIEZA DE ZONAS DU |  | Pendiente confirmar |
| 70% | PLAZA PUERTO COLOMBIA | LIMPIEZA GENERAL ZONAS DURAS | rend=10000 frec=25 cant=16781 | `3.03` SUMINISTRO DE INSUMOS Y PERSONAL ASEO Y LIMPIEZA DE ZONAS DU |  | Pendiente confirmar |
| 70% | PLAYA DE SABANILLA 2 | LIMPIEZA GENERAL ZONAS DURAS | rend=10000 frec=25 cant=3555 | `3.03` SUMINISTRO DE INSUMOS Y PERSONAL ASEO Y LIMPIEZA DE ZONAS DU |  | Pendiente confirmar |
| 70% | SALINAS DEL REY | LIMPIEZA GENERAL ZONAS DURAS | rend=10000 frec=25 cant=7840 | `3.03` SUMINISTRO DE INSUMOS Y PERSONAL ASEO Y LIMPIEZA DE ZONAS DU |  | Pendiente confirmar |
| 70% | CENTRO GASTRONÓMICO | LIMPIEZA GENERAL ZONAS DURAS | rend=10000 frec=25 cant=6726 | `3.03` SUMINISTRO DE INSUMOS Y PERSONAL ASEO Y LIMPIEZA DE ZONAS DU |  | Pendiente confirmar |
| 62% | PLAYA DEL COUNTRY | ACOPIO Y LIMPIEZA MANUAL CON PERSONAL | rend=3000 frec=25 cant=19287 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 62% | MANGLARES | ACOPIO Y LIMPIEZA MANUAL CON PERSONAL | rend=3000 frec=25 cant=30000 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 62% | PLAZA PUERTO COLOMBIA | ACOPIO Y LIMPIEZA MANUAL CON PERSONAL | rend=3000 frec=25 cant=7887 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 62% | PLAYA DE SABANILLA 2 | ACOPIO Y LIMPIEZA MANUAL CON PERSONAL | rend=3000 frec=25 cant=18070 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 62% | SALINAS DEL REY | ACOPIO Y LIMPIEZA MANUAL CON PERSONAL | rend=3000 frec=25 cant=23412 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 43% | MIRAMAR SECTOR EL FARO | LIMPIEZA GENERAL | rend=7500 frec=2.083 cant=5763 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 43% | SENDERO SANTA VERÓNICA | LIMPIEZA GENERAL | rend=7500 frec=2.083 cant=1225 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 43% | PLAYA DEL COUNTRY | LIMPIEZA GENERAL | rend=7500 frec=2.083 cant=2295 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 43% | PLAZA PUERTO COLOMBIA | LIMPIEZA GENERAL | rend=7500 frec=2.083 cant=1944 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 43% | PLAYA DE SABANILLA 2 | LIMPIEZA GENERAL | rend=7500 frec=2.083 cant=3637 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 43% | SALINAS DEL REY | LIMPIEZA GENERAL | rend=7500 frec=2.083 cant=627 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 43% | CENTRO GASTRONÓMICO | LIMPIEZA GENERAL | rend=7500 frec=25 cant=790 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 31% | PLAZA PUERTO COLOMBIA | LIMPIEZA GENERAL DE MARMOL | rend=600 frec=1 cant=2384 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 31% | SALINAS DEL REY | LIMPIEZA GENERAL DE MARMOL | rend=600 frec=1 cant=0 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 31% | CENTRO GASTRONÓMICO | LIMPIEZA GENERAL DE MARMOL | rend=300 frec=1 cant=6726 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 25% | PLAYA DEL COUNTRY | OXIGENACIÓN DE ARENA CON TRACTOR Y RASTRA | rend=18000 frec=1 cant=19287 | `1.10` TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO |  | Pendiente confirmar |
| 25% | MANGLARES | OXIGENACIÓN DE ARENA CON TRACTOR Y RASTRA | rend=18000 frec=1 cant=14070 | `1.10` TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO |  | Pendiente confirmar |
| 25% | PLAZA PUERTO COLOMBIA | OXIGENACIÓN DE ARENA CON TRACTOR Y RASTRA | rend=18000 frec=4 cant=7887 | `1.10` TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO |  | Pendiente confirmar |
| 25% | PLAYA DE SABANILLA 2 | OXIGENACIÓN DE ARENA CON TRACTOR Y RASTRA | rend=18000 frec=1 cant=18070 | `1.10` TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO |  | Pendiente confirmar |
| 25% | SALINAS DEL REY | OXIGENACIÓN DE ARENA CON TRACTOR Y RASTRA | rend=18000 frec=1 cant=23412 | `1.10` TRASIEGO CON MAQUINARIA EN SITIO ESTRATEGICO |  | Pendiente confirmar |
| 0% | MIRAMAR SECTOR EL FARO | DESMALEZADO | rend=600 frec=6.25 cant=5763 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | SENDERO SANTA VERÓNICA | DESMALEZADO | rend=600 frec=6.25 cant=1225 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | PLAYA DEL COUNTRY | DESMALEZADO | rend=600 frec=6.25 cant=2295 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | PLAZA PUERTO COLOMBIA | DESMALEZADO | rend=600 frec=6.25 cant=1500 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | PLAYA DE SABANILLA 2 | DESMALEZADO | rend=600 frec=6.25 cant=3637 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | SALINAS DEL REY | DESMALEZADO | rend=600 frec=6.25 cant=627 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | CENTRO GASTRONÓMICO | DESMALEZADO | rend=600 frec=6.25 cant=724 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | PLAYA DEL COUNTRY | Nueva Actividad | rend=undefined frec=undefined cant= | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | PLAYA DEL COUNTRY | Nueva Actividad | rend=undefined frec=undefined cant= | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | MIRAMAR SECTOR EL FARO | PLATEO | rend=200 frec=12.5 cant=214 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | SENDERO SANTA VERÓNICA | PLATEO | rend=200 frec=12.5 cant=243 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | PLAYA DEL COUNTRY | PLATEO | rend=200 frec=12.5 cant=111 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | PLAZA PUERTO COLOMBIA | PLATEO | rend=200 frec=12.5 cant=164 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | PLAYA DE SABANILLA 2 | PLATEO | rend=200 frec=12.5 cant=127 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | SALINAS DEL REY | PLATEO | rend=200 frec=12.5 cant=0 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |
| 0% | CENTRO GASTRONÓMICO | PLATEO | rend=200 frec=12.5 cant=111 | `1.01` SUMINISTRO DE PERSONAL, INSUMOS Y HERRAMIENTAS PARA LIMPIEZA |  | Pendiente confirmar |

## 3. Ítems no operativos (`item_type='financial'`) — 32 items, todos en Plaza Puerto Colombia

No se agrupan aquí como "roles" únicamente — dentro de este `item_type` conviven varias cosas distintas (cargos, jornales, insumos, materiales, costos financieros); lo que las une no es su contenido sino el discriminador estructural del modelo, no su nombre. Creados en un único lote el 2026-03-01 (15:36:27–15:36:38). Incluye roles de personal (`Director`, `Administrador de Proyectos`, `Coordinador Operativo`, `Operador Tractor`, `Ayudante Limpieza Playas`...) e insumos/materiales (`COMPOST X 40KG`, `SULFATO DE AMONIO`, `ROUNDUP (LTS)`...). Ninguno debe mapearse a `board_activity_standards`.

- `MO PERSONAL - ZV Y Z.D`
- `MO PERSONAL - MTTO PLAYAS`
- `AYUDANTE LIMPIEZA PLAYAS`
- `SUPERVISORES - MTTO`
- `OFICIAL OBRA CIVIL`
- `OFICIAL ACABADOS`
- `OFICIAL ELECTRICO`
- `JORNALES X EVENTOS`
- `HORAS EXTRAS`
- `Conductor RAM`
- `Conductor Camion/Volqueta`
- `Operador Tractor`
- `Director`
- `Administrador de Proyectos`
- `Coordinador Administrativo`
- `Coordinador Operativo`
- `Jefe de Logìstica`
- `Asistente`
- `Auxiliar`
- `COMPOST X 40KG`
- `TRADICION CAFETERA (KG)`
- `HIDROCOMPLEX (KG)`
- `TRIPLE 15 (KG)`
- `AGRIMINS FOLIAR COMPLETO X LITRO`
- `TERRA SORB RADICULAR X 1`
- `SULFATO DE AMONIO`
- `CRECIFOL`
- `HUMUS`
- `DESTIERRO (LTS)`
- `ROUNDUP (LTS)`
- `TROPICO (LTS)`
- `MO JARDINEROS -  X DIAS PDO`

## 4. Datos de prueba / basura — 1 item (excluir y documentar su eliminación)

- `QA-Engine-1782672612405` (grupo: SENDERO SANTA VERÓNICA) — nombre de una prueba automatizada, no una actividad real.

