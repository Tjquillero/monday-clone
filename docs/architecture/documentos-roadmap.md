# Documentos — hoja de ruta técnica

Ref: `supabase/migrations/20260830_operational_documents.sql`, `docs/operacion/README.md`, `docs/operacion/investigaciones/poa/INV-0001-salinas-del-rey.md` (la pregunta de negocio que motivó todo el módulo).

El modelo de datos (`document_types`, `operational_documents`, bucket `operational-documents`) se diseñó para que cada fase agregue solo lo que necesita, sin reescribir el esquema de una fase anterior — decisión explícita tras descartar `scope_type`/`scope_id` polimórfico, `document_families`, `category`/`subcategory` y `document_chunks` para la Fase 1 (ver el propio commit `62c3d13` y el encabezado de la migración).

## Fase 1 — Biblioteca documental ✅ (commit `62c3d13`)

- Almacenamiento seguro (bucket privado, RLS por board vía `get_user_board_role`, mismo criterio en tabla y Storage).
- Versionado por `(board_id, tipo_documento, anio, version_label)`, un documento vigente por tipo (`mark_operational_document_vigente`, transición atómica).
- Historial append-only — nunca se borra un documento, se marca `es_vigente = false`.
- UI (`/documentos`, módulo propio en el sidebar) + búsqueda simple por título/etiqueta.

## Fase 2 — Procesamiento automático (no iniciada)

Al subir un documento, extraer metadatos automáticamente:
- Poblar `document_metadata` (JSONB, ya existe y está vacío) — para un POA: zonas, actividades, fecha inicio/fin, contrato; para Resource Analysis: sitios, personal, equipos.
- Mover `processing_status` por su ciclo real: `uploaded` → `processing` → `processed`/`failed` (hoy siempre queda en `uploaded`, la columna ya existe).
- Decisión pendiente antes de empezar: qué parser usa cada `tipo_documento` — reutilizar `src/lib/poaImport/parseExcel.ts` para POA es la opción obvia; los demás tipos no tienen parser definido todavía.

## Fase 3 — Integración con importadores y validaciones (no iniciada)

- Conectar el importador del POA (`PoaImportContainer.tsx`) a leer el documento vigente desde aquí en vez de (o además de) un archivo subido directo en el navegador — deliberadamente NO se hizo en Fase 1 para no arriesgar un pipeline ya estable y probado.
- Validaciones cruzadas: ¿el documento vigente coincide con lo que ya se importó a la base de datos? (Ver el patrón de investigación en `docs/operacion/investigaciones/` para el tipo de pregunta que esto resolvería sin inspección manual — ej. INV-0001).
- Sincronización con `docs/operacion/dataset.md`: hoy son dos sistemas independientes a propósito (Git para trazabilidad técnica, esta tabla para uso operativo en vivo); evaluar si conviene que `dataset.md` referencie el documento vigente de esta tabla en vez de mantenerse 100% manual.

## Fase 4 — Búsqueda semántica / IA (no iniciada)

- El objetivo final que motivó todo el módulo: que una pregunta como "¿Salinas del Rey aparece en el contrato?" se responda abriendo el documento vigente real, no solo inspeccionando SQL/código (ver `docs/operacion/investigaciones/poa/INV-0001-salinas-del-rey.md`).
- Requiere decisiones que hoy no están tomadas: extensión `pgvector` u otro motor de embeddings, estrategia de chunking, modelo de embeddings, OCR para PDFs escaneados. Ninguna se adelanta en el esquema de Fase 1 — se diseñan cuando esta fase realmente empiece.
- Depende de que la Fase 2 exista primero (no hay nada que buscar semánticamente sin metadatos/contenido extraído).

## Uso operativo recomendado, a partir de ahora

`docs/operacion/fuentes/` (Git) sigue siendo la documentación técnica/arquitectónica y la trazabilidad para desarrollo. Para los documentos reales que Operaciones sube y consulta (POA, Resource Analysis, Salarios, Contratos, Manuales, Cronogramas, Catálogos Técnicos), el módulo **Documentos** (`/documentos`) pasa a ser la fuente operativa — evita que Operaciones dependa de un `git pull` para ver cuál es el documento vigente. Ver la nota correspondiente en `docs/operacion/README.md`.
