# Definición y Reglas del Dominio: Resource Analysis

Este documento congela el dominio conceptual del **Resource Analysis** — el documento operativo que Operaciones usa para dimensionar cuadrillas por sitio. Sigue el mismo patrón que `docs/domain/poa-domain.md`: primero se congela el dominio, después se diseña el importador (`docs/architecture/resource-analysis-import-design.md`).

**Estado: Incremento 1 (Discovery) — sin tocar producción.** Ningún código de importación existe todavía. Este documento describe únicamente lo verificado contra el Excel real (`COSTOS GENERALES (V2).xlsx`) y contra la base de datos actual.

---

## 1. Qué es el Resource Analysis

El Resource Analysis es el documento con el que Operaciones estima, por sitio, **cuántas cantidades de trabajo hay que ejecutar por zona técnica** (paisajismo, zona dura, zona de playa) y, a partir de eso, **cuántos jornales y cuánto personal se necesita**.

- **No es el POA:** el POA (`docs/domain/poa-domain.md`) define qué está contratado, con qué precio y qué frecuencia — es el instrumento contractual. El Resource Analysis es un documento operativo de dimensionamiento de recursos, no contractual.
- **No es el Catálogo Técnico:** el Catálogo Técnico (`board_activity_standards`) es la fuente vigente del sistema para `rendimiento` — un valor confirmado por el propietario funcional del sistema (ADR-0008), independiente de cualquier Excel.
- **Ya se usó como fuente de la fórmula, no de los valores:** `INV-0002` (`docs/operacion/investigaciones/costos/INV-0002-formula-jornales-vs-adr0009.md`) usó este mismo Excel para confirmar la fórmula correcta de `CANT JORNALES MES` (revirtió ADR-0009). Esa investigación validó la **metodología** del documento, no cada valor individual de rendimiento que contiene — ver Regla de Gobierno de Datos, más abajo, sobre por qué esa distinción es real y no una inconsistencia.

## 2. Regla de Gobierno de Datos (crítica, confirmada por el dueño del proceso — 2026-07-21)

> **El Excel de Resource Analysis puede estar desactualizado. `board_activity_standards` es el catálogo técnico vigente del sistema.**

Cuando un valor de `rendimiento` (o `frecuencia`) difiere entre el Excel y `board_activity_standards`:

- **No se corrige automáticamente uno para que coincida con el otro.**
- La discrepancia se **documenta explícitamente** (ver Sección 5, discrepancias conocidas).
- Se resuelve como una **decisión de negocio** — o el Excel se actualiza para alinearse al catálogo vigente, o se reemplaza por un nuevo documento. Ninguna de las dos cosas ocurre implícitamente por importar datos.

**Caso confirmado que originó esta regla:** Corte de troncos (`1.09`, Tablero Principal). El Excel dice rendimiento=10 (hoja "COUNTRY 1") o 15 (hoja "PLAZA PUERTO COLOMBIA") según el sitio; `board_activity_standards` tiene 30, confirmado directamente por el dueño del proceso como el valor correcto durante la revisión del Catálogo Técnico — una decisión posterior y no reflejada en este Excel. El Excel **no se trata como fuente normativa de rendimientos individuales**, solo de la metodología de cálculo (`INV-0002`) y de las **cantidades** (Sección 3).

**Por qué esta distinción no es arbitraria:** ya existía en el código antes de este discovery. `docs/architecture/poa-excel-import-design.md` (Sección 4) establece que `board_activity_standards` "se completa por un proceso aparte, humano, cuando existe un rendimiento real que confirmar — nunca automáticamente desde el Excel" — ese principio (ADR-0008) ya trataba el rendimiento como un dato de confirmación humana, nunca importado mecánicamente de ningún documento. Este discovery no introduce la regla; la hace explícita para un documento nuevo.

## 3. Qué SÍ es responsabilidad de este Excel: las cantidades por sitio

Lo único que este Excel aporta que el sistema no tiene hoy son las **cantidades de trabajo por sitio y por zona técnica** — el insumo que puebla `resource_analysis.scope_data`. Eso es lo único que el importador (Incremento 2+) debe traer de aquí.

### Glosario de zonas técnicas

Cada sitio tiene hasta dos bloques de cantidades en el Excel:
- **Zona Verde** — paisajismo: total_paisajismo, zona_dura, grama, limpieza_marmol, arbustos, arboles.
- **Zona de Playa** — zona_playa, trasiego_playa, limpieza_manual, corte_troncos.

No todos los sitios tienen ambos bloques con datos (ver Sección 5 — PLAYA MIRAMAR no tiene frente de playa).

### Mapeo Excel → `scope_key` (verificado, coincide exacto con los 10 `scope_key` ya usados por `activity_scope_mappings`)

| Descripción en el Excel | `scope_key` | Zona técnica |
|---|---|---|
| TOTAL PAISAJISMO | `total_paisajismo` | Zona Verde |
| ZONA DURA | `zona_dura` | Zona Verde |
| GRAMA | `grama` | Zona Verde |
| LIMPIEZA MARMOL | `limpieza_marmol` | Zona Verde |
| ARBUSTOS Y CUBRE SUELOS | `arbustos` | Zona Verde |
| ARBOLES TOTALES | `arboles` | Zona Verde |
| ZONA DE PLAYA | `zona_playa` | Zona de Playa |
| TRASIEGO DE PLAYA | `trasiego_playa` | Zona de Playa |
| LIMPIEZA MANUAL | `limpieza_manual` | Zona de Playa |
| CORTE DE TRONCOS | `corte_troncos` | Zona de Playa |

**Verificado contra datos reales ya cargados:** las cantidades de la hoja "COUNTRY 1" (zona verde + zona de playa) coinciden exactamente, campo por campo, con `resource_analysis.scope_data` ya cargado en producción para el sitio PLAYA DEL COUNTRY (`site_id 6366520a-...`, Tablero Principal) — confirma que este mapeo es correcto y que ese sitio ya está poblado desde (presumiblemente) una versión anterior de este mismo documento.

## 4. Qué NO se importa de este Excel (deliberado, mismo patrón que POA)

- **Rendimiento y frecuencia por actividad** (columnas RENDIMIENTO/FRECUENCIA de la segunda tabla de cada bloque) — pertenecen al Catálogo Técnico (`board_activity_standards`), gobernado por la Regla de la Sección 2. Leerlos e importarlos automáticamente violaría esa regla.
- **`CANT JORNALES MES` / `CANT PERSONAL MES`** — son cálculos derivados, no insumos. El sistema ya los calcula (`calculateTheoreticalJournals`/`calculateDailyJournals`) a partir de cantidad + rendimiento + frecuencia. Importarlos crearía una copia paralela que puede desincronizarse — mismo principio que ADR-0003 aplicó al Acta ("nunca copia una fuente externa, siempre se calcula").
- **La hoja "DETALLE DE GRUPO"** — no es un sitio, es un comparativo de personal teórico vs. escenarios de personal real por centro de costo. Fuera de alcance del importador de cantidades; puede ser útil en el futuro como fuente de validación cruzada (¿el personal que el motor calcula se parece al que Operaciones ya viene usando?), pero eso es un incremento aparte, no este.

## 5. Discrepancias y anomalías conocidas (verificadas, no resueltas — ver `docs/discovery/resource-analysis-sheet-mapping-gaps.md`)

- **Rendimiento/frecuencia de Corte de troncos varía por sitio en el Excel y no coincide con el catálogo vigente** (Sección 2) — documentado, no bloqueante para importar cantidades.
- **Etiquetas internas de bloque ("NOMBRE DEL PROYECTO:") no son confiables** — varias hojas tienen el título de otro sitio copiado y pegado (ver discovery de mapeo). El identificador confiable es el nombre de la pestaña del Excel, no el texto dentro de la celda — ni siquiera eso es 100% inequívoco (caso "COUNTRY 2", **resuelto 2026-07-21**: la hoja completa pertenece a PLAYA DE SABANILLA 2, no a "Playas del Country" como decía su segundo bloque).
- **3 sitios activos en la base de datos no tienen hoja en este Excel**: PLAYA PUNTA ASTILLEROS y PRESUPUESTO GENERAL (×2 registros). Importar todo este documento no cierra la brecha de datos para esos 3 sitios — seguirán mostrando "Sin estándares configurados" en el Cronograma.
- **PLAYA MIRAMAR no tiene datos de Zona de Playa** (todas las cantidades en null/0) — consistente con no tener frente de playa, no es un error de captura.

## 6. Próximo paso

Con el dominio congelado, el Incremento 2 (Parser — solo leer el Excel, sin escribir en producción) puede empezar, siempre que las ambigüedades de mapeo de la Sección 5 queden resueltas o explícitamente pospuestas por el dueño del proceso — ver `docs/discovery/resource-analysis-sheet-mapping-gaps.md` para las preguntas concretas pendientes.
