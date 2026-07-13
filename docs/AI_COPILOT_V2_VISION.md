# Copiloto de IA — v2.0: Visión por Computador (Estable)

Este documento congela el alcance de **Fase 5 — Visión por Computador**, la primera capacidad multimodal del copiloto de IA de Mantenix. Extiende [`docs/AI_COPILOT_V1.md`](./AI_COPILOT_V1.md) (Copiloto de Dominio, texto) sin modificar ninguna de sus reglas — v1.0 sigue vigente tal cual. Al haber alcanzado su estado **estable**, queda oficialmente cerrado como hito v2.0. Cualquier capacidad nueva (OCR, extracción desde planos, análisis de PDFs, predicción de riesgos, modelos especializados) es **v3**, una iniciativa aparte.

---

## 1. Alcance (v2.1 → v2.5)

| Incremento | Tool | Verdad |
|---|---|---|
| v2.1 | `get_executions_without_evidence` | Determinística (dato de dominio, reutiliza el Gate 2/MEVID ya existente) |
| v2.2 | `evaluate_execution_evidence` | Visión (describe, primera tool con Gemini Vision) |
| v2.3 | `compare_before_after_evidence` | Visión + dominio nuevo (`phase`) |
| v2.4 | `get_duplicate_attachments` | Determinística (hash, sin Gemini) |
| v2.4b | `find_possible_visual_duplicates` | Visión (posible, nunca certeza) |
| v2.5 | `generate_execution_observations` | Agregador determinístico de las 4 anteriores |

**Principio rector, aplicado en cada incremento sin excepción**: primero el dato de dominio objetivo (si existe), la IA lo interpreta después. Nunca al revés.

## 2. Principio de diseño: la visión describe, nunca decide

> [!IMPORTANT]
> Gemini Vision **describe** evidencia fotográfica. Nunca **decide** sobre ella.

Ninguna tool de Fase 5 puede producir, bajo ninguna circunstancia:
- "la ejecución es fraudulenta" / "hubo fraude" / "intentaron inflar evidencia"
- "debe aprobarse" / "debe rechazarse" / "la certificación es inválida"
- "el trabajo no fue realizado" / juicios sobre cumplimiento contractual
- "esta foto es la correcta, elimina la otra"

Ninguna de esas afirmaciones puede sostenerse solo con imágenes — son decisiones humanas del flujo de negocio (supervisor, asistente, administrador), nunca del copiloto.

Lo que SÍ puede producir: descripciones objetivas ("se observa poda de césped"), limitaciones explícitas ("no es posible verificar la ubicación"), y señales de **posible** interés para revisión humana ("posible duplicado visual", "falta evidencia de la fase 'antes'").

## 3. Las 5 tools de visión y sus contratos

### `get_executions_without_evidence(board_id)` — v2.1
Reutiliza LITERALMENTE la misma condición que el Gate 2 (`MEVID`) de `confirm_weekly_plan`: ejecuciones `verified` sin ninguna fila en `execution_attachments`. Sin Gemini. No bloquea nada — solo informa.

### `evaluate_execution_evidence(execution_id)` — v2.2
DTO `{ summary, observations[], limitations[], confidence }`. `confidence` es SOLO sobre la calidad de la observación visual, nunca sobre la ejecución del contrato. Sin fotos → responde determinísticamente sin llamar a Gemini.

### `compare_before_after_evidence(execution_id)` — v2.3
DTO `{ summary, changesObserved[], unchangedAreas[], limitations[], confidence }`. Se niega elegantemente si falta evidencia de alguna fase — nunca infiere cuál foto es "antes"/"después".

### `get_duplicate_attachments(board_id)` — v2.4
DTO `{ fileHash, occurrences[] }[]`. Determinística, sin Gemini — compara `file_hash` (SHA-256, calculado en el cliente). Alcance de board completo (detecta reuso entre jornadas distintas).

### `find_possible_visual_duplicates(execution_id)` — v2.4b
DTO `{ possibleVisualDuplicates: [{fileNameA, fileNameB, confidence, reason}], limitations[] }`. Nunca "duplicados" — siempre "posibles". Descarta duplicados exactos (mismo hash) antes de llamar a Gemini. Límite duro de 12 fotos por llamada; menos de 2 o más de 12 → se niega explícitamente.

### `generate_execution_observations(execution_id, board_id)` — v2.5
DTO `{ observations: [{severity: 'info'|'warning', category, message}] }`. Categorías cerradas: `missing_before | missing_after | poor_evidence | possible_duplicate | visual_limitation`. Se **ensambla en código** a partir de las 4 tools anteriores — nunca le pide a Gemini una síntesis final. Cada observación es trazable 1:1 a su fuente por construcción.

## 4. Decisiones de dominio (no de IA)

- **`execution_attachments.phase`** (`TEXT CHECK IN ('before','after')`, nullable, sin `DEFAULT`): se captura ÚNICAMENTE al subir la foto — sin política RLS de `UPDATE` (deny-by-default), protegido con test pgTAP permanente. Una corrección administrativa futura sería una capacidad aparte con permisos específicos, no una edición silenciosa.
- **`execution_attachments.file_hash`** (SHA-256, calculado en el cliente antes de subir, `TEXT` nullable, sin `UNIQUE`): un duplicado es un hallazgo a reportar, no un INSERT a bloquear. Se propaga por toda la cadena de subida, incluida la cola offline.
- **Límite de 12 fotos por comparación visual** (v2.4b): evita la explosión combinatoria de comparar todo contra todo; si se supera, se niega en vez de comparar un subconjunto arbitrario.
- **Descarte previo por hash** (v2.4b): nunca se le pide a Gemini que compare visualmente dos fotos que un hash ya determinó idénticas.

## 5. Explícitamente fuera de alcance de v2.0

- Detección de fraude o intención maliciosa.
- Aprobación o rechazo automático de certificaciones.
- Certificación automática sin intervención humana.
- KPIs derivados de visión, entrenamiento de modelos propios, embeddings o distancias vectoriales.
- OCR, extracción de datos desde planos/documentos, análisis de PDFs.
- Predicción de riesgos.

Cualquiera de estas capacidades es una iniciativa v3 (o posterior), con su propio contrato congelado desde cero.

## 6. Garantías de prueba

- **pgTAP**: 21/21 suites (257 tests) — incluye el CHECK de `phase`, la denegación de `UPDATE` bajo el rol `authenticated` real, y los casos de `file_hash`.
- **Jest**: 288/288 — cada decline (sin fotos, muy pocas/muchas fotos, sin duplicados) probado sin mockear Gemini de más; cada tool con visión mockea `@google/genai` completo para no depender de cuota real en CI.
- **E2E con Gemini real**: cada una de las 5 tools verificada al menos una vez con imágenes reales subidas a un board/ejecución sembrados — nunca solo con mocks. `durationMs` real observado: ~200-500ms para las tools determinísticas (v2.1, v2.4), 8-29 segundos para las tools de visión (v2.2, v2.3, v2.4b, v2.5) — diferencia que por sí sola confirma cuáles tools realmente usan Gemini y cuáles no.

## 7. Invariante de oro del hito

> [!IMPORTANT]
> **La visión describe, nunca decide.** Ninguna tool de Fase 5 emite juicios de negocio (fraude, aprobación, certificación) — solo observaciones trazables para que un humano decida. Cualquier tool nueva que toque imágenes hereda esta misma frontera sin excepción.

**Pendiente para v3** (no iniciado): OCR, extracción documental avanzada, predicción de riesgos, modelos especializados — iniciativas técnicas distintas, fuera del alcance de este hito.
