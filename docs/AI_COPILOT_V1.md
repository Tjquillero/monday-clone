# Copiloto de IA de Dominio — v1.0 (Estable)

Este documento congela el alcance del **Copiloto de IA de Dominio** de Mantenix en su versión 1.0. Al haber alcanzado su estado **estable** — infraestructura, catálogo de herramientas y funcionalidades adicionales verificadas end-to-end — queda oficialmente cerrado como hito. Cualquier capacidad nueva del copiloto (Fase 5 - visión por computador, nuevas tools de dominio, KPIs, predicciones) es **v2**, una iniciativa aparte, no una extensión incremental de este hito.

---

## 1. Arquitectura congelada

```
Usuario → AgentControlCenter (UI) → /api/ai/ask → Orchestrator → Gemini
                                                        │
                                                        ▼
                                                  Tool Registry (whitelist)
                                                        │
                                                        ▼
                                                  DomainTools (DTOs estables)
                                                        │
                                                        ▼
                                                  RPC oficiales → Dominio (Postgres)
```

**Reglas no negociables:**
1. El modelo nunca ejecuta SQL ni toca Supabase directamente — solo invoca tools declarados.
2. Toda tool está en una lista blanca explícita en código (`AI_TOOL_REGISTRY`), nunca solo "prometida" en un prompt.
3. Tools llaman RPCs a través de DomainTools, nunca tablas directamente.
4. Un tool = una intención de negocio, no una tabla ni una query técnica.
5. Las tools devuelven DTOs del dominio, nunca filas crudas.
6. Sin lógica de negocio en el prompt — el prompt dice "usa `compute_acta_totals()`", nunca "calcula el AIU".
7. Si el modelo pide un tool fuera de whitelist: rechazo explícito + log del intento (`ai_tool_call_attempts`), nunca una respuesta improvisada.
8. **La IA nunca calcula ni inventa nada que se pueda derivar determinísticamente en código** — ni cifras de dominio, ni citas de qué tool se usó, ni cuánto tardó. Si algo puede construirse en código, no se le confía al modelo.

## 2. Catálogo de herramientas (7)

| Tool | Qué responde |
|---|---|
| `get_current_board` | A qué board pertenece la conversación y con qué rol (infraestructura, Hito 0) |
| `get_acta_totals` | Resumen financiero oficial de un acta (envuelve `compute_acta_totals()`) |
| `get_pending_billable_work` | Actividades certificadas sin facturar todavía |
| `get_board_summary` | Punto de entrada: POA activo, valor contratado/certificado, progreso, actas |
| `get_delayed_weekly_plans` | Planes semanales cuya semana venció sin llegar a `closed` |
| `get_execution_summary` | Conteo de ejecuciones `reported`/`verified`/`rejected` |
| `get_poa_version_diff` | Qué cambió entre dos versiones del POA (agregado/eliminado/cantidad/precio) — nunca impacto en ejecución o facturación |

Todas: RLS respetado, `SECURITY DEFINER` con verificación interna de `get_user_board_role()`, `sideEffects: false` / `requiresConfirmation: false` (fase 1, solo lectura).

## 3. Memoria conversacional (Opción A)

El cliente (`AgentControlCenter`) retiene y reenvía el `ConversationState { contents: Content[] }` opaco de Gemini — el servidor no guarda estado propio. Historial **aislado por board** (`Map<boardKey, {messages, conversation}>`): el widget vive montado globalmente y no se desmonta al cambiar de board, así que sin este aislamiento el contexto de un board se filtraría al siguiente. Ventana deslizante por longitud cruda (`MAX_CONTENTS = 40`), sin interpretar el contenido. Se pierde al recargar la página — no hay persistencia en base de datos en v1.

## 4. Citas verificables

`ToolCitation { tool, args, durationMs }` se construye en el Orchestrator a partir de la llamada real ejecutada — nunca de lo que el modelo diga que usó. La UI traduce el nombre técnico a un rótulo natural (`displayNames.ts`, con fallback al nombre técnico si falta), conserva los argumentos crudos para auditabilidad, y agrega la duración real medida con `Date.now()` alrededor de `tool.execute()`. Sin cita cuando la respuesta viene solo de memoria conversacional (no hay nada nuevo que citar).

## 5. Sugerencias proactivas

Al abrir el panel con la conversación de un board vacía, un aviso automático (plantilla determinística en código, **sin pasar por Gemini ni por el Tool Registry**) reporta planes atrasados y trabajo certificable pendiente, reutilizando las mismas DomainTools que las tools del catálogo. Silencio si no hay nada que reportar — nunca un "todo bien" de relleno.

## 6. Análisis documental (excepción arquitectónica deliberada)

Explicar errores de validación del importador del POA **no pasa por el Tool Registry**: por diseño (ADR-0004, "todo o nada"), un import inválido nunca toca la base de datos, así que no hay nada persistido que consultar vía RPC. Es una llamada directa a Gemini con los errores ya calculados en el navegador como único contexto, con un system instruction que prohíbe explícitamente inventar una fila, actividad o causa que no esté en los datos. Es la única pieza del copiloto que no sigue el flujo `Registry → DomainTools → RPC` — y es una decisión de diseño explícita, no una inconsistencia.

## 7. Garantías de prueba

Verificado en tres capas independientes, no solo una:
- **pgTAP** (231/231): contratos de las RPCs, autorización, casos límite.
- **Jest** (258/258): lógica pura (plantillas, prompts, mapeo DTO), componentes (RTL con mocks), estructurales (todo tool en el Registry tiene un rótulo de presentación; ningún `ViewContainer` activo llama `useBoard()` sin `boardId`).
- **E2E con Gemini real**: cada tool y cada funcionalidad adicional verificada al menos una vez contra la API real, con datos sembrados y limpiados en cada corrida — nunca solo mocks.

## 8. Invariante de oro del hito

> [!IMPORTANT]
> **Ninguna tool nueva se agrega fuera de `Registry → DomainTools → RPC`.** Cualquier capacidad que requiera un pipeline distinto (visión por computador, modelos externos, otra cuota) es una iniciativa v2 separada — no se mezcla con la arquitectura de este hito. La IA de dominio nunca calcula ni inventa reglas de negocio: interpreta el dominio, no lo reemplaza.

**Pendiente para v2** (no iniciado): Fase 5 — visión por computador (fotos de certificación, validación de evidencia, detección de anomalías, comparación antes/después). Otro pipeline técnico (multimodal, otra cuota), fuera del alcance de este hito.
