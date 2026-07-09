# Diseño: Offline para el flujo de Ejecución Certificada

**Estado: Propuesto — diseño previo a implementación, no construido todavía.**

Este documento responde a un hallazgo verificado en código (no especulado): la infraestructura offline existente (`src/lib/offlineDB.ts`, `src/lib/supabaseClient.ts`, `src/hooks/useOfflineSync.ts`) no cubre ninguna operación del flujo de Ejecución Certificada (Incrementos 1-4). No es un caso de "falta terminar de conectar algo" — es una limitación de diseño: el proxy offline solo intercepta `supabase.from(tabla)`; nunca `supabase.rpc(...)` ni `supabase.storage`. El flujo nuevo depende casi enteramente de RPCs (`report_execution`, `verify_execution`, `reject_execution`, `confirm_weekly_plan`) y de Storage (evidencia fotográfica). Ninguna de las tablas nuevas (`weekly_plans`, `weekly_plan_items`, `weekly_plan_item_executions`, `execution_attachments`, `poa*`) tiene siquiera un object store en IndexedDB.

**Precisión de nombres:** lo que hoy existe no es "offline-first" en sentido amplio — es una caché de snapshot + cola CRUD para el módulo original del tablero (items/boards/incidentes). Es una arquitectura correcta para el problema que resolvía; el dominio nuevo introduce dos conceptos que esa arquitectura nunca contempló: **comandos de negocio (RPC)** y **activos binarios (fotografías)**. Forzar el proxy actual a cubrir ambos con parches puntuales probablemente produciría algo difícil de mantener. Este diseño propone una segunda capa de sincronización, no una extensión del proxy existente.

---

## 1. Alcance del offline

No todo necesita funcionar sin conexión. Alcance propuesto:

| Operación | Offline | Por qué |
|---|---|---|
| Consultar Mis Actividades | Sí | requiere cachear `weekly_plans`/`weekly_plan_items`/`weekly_plan_item_executions` en IndexedDB — hoy no están cacheadas, por eso ni siquiera la lectura offline funciona. |
| Consultar Verificación | Sí | mismo cacheo, del lado del supervisor. |
| Registrar jornada (borrador) | Sí | CRUD simple — es exactamente el tipo de operación que el patrón actual ya resuelve bien. |
| Tomar evidencia (cámara) | Sí, siempre | la captura no depende de red; el problema es la subida, no la foto en sí. |
| Reportar jornada | Sí, diferido | comando de negocio en cola (ver punto 3). |
| Subir evidencia | Sí, diferido | Blob local → Storage al reconectar (ver punto 4). |
| Verificar / Observar (supervisor) | Diferido, opcional | se podría diferir igual que reportar; a definir con negocio si el supervisor certifica también sin señal o si esa acción se reserva para cuando recupera conexión. |
| Confirmar semana (admin) | **No** | ver justificación abajo. |

**Por qué `confirm_weekly_plan` queda explícitamente fuera del modo offline** (decisión de arquitectura, no un olvido): representa el cierre administrativo del período y ejecuta validaciones globales (Gate 1: cero `reported` pendientes; Gate 2: evidencia en toda `verified`) contra el estado completo del plan. No debe ejecutarse sobre datos potencialmente desactualizados — diferirla introduciría la posibilidad de cerrar un período con información que ya cambió en el servidor, exactamente el tipo de inconsistencia que los dos gates existen para prevenir. Se asume que ocurre con conexión, típicamente desde oficina.

---

## 2. Modelo de sincronización — tres carriles, no una cola genérica

La cola actual (`OfflineMutation`) mezcla implícitamente CRUD con la suposición de que toda escritura es `insert/update/delete` sobre una tabla. Eso no alcanza para comandos de dominio ni para archivos. Se proponen tres carriles independientes, cada uno con su propia estrategia:

1. **CRUD sobre tablas** — el patrón que ya existe y funciona (`OfflineQueryBuilder`, cola de mutaciones simples). Se reutiliza tal cual para lo que siga siendo CRUD (ej. registrar el borrador de una jornada).
2. **Comandos de dominio** — cola nueva, tipada por comando (punto 3). Cada tipo de comando sabe cómo reproducirse y qué significa un fallo semántico vs. transitorio.
3. **Archivos** — cola de Blobs con su propio ciclo de vida (punto 4), porque un archivo binario no encaja en el mismo modelo que un JSON de mutación.

**Principio de arquitectura:** la cola offline nunca implementa reglas de negocio. Solo preserva el orden y garantiza la entrega. Las validaciones siguen viviendo exclusivamente en los RPC y en la base de datos — la cola no reimplementa en JavaScript, ni siquiera parcialmente, ninguna regla que ya exista en `workflow.md`/las funciones `SECURITY DEFINER`. Si en algún momento aparece la tentación de "adelantarse" y validar algo en el cliente para que la UI se sienta más rápida offline, esa validación debe ser una copia desechable de la regla real, nunca la fuente de verdad — y debe quedar explícitamente marcada como tal en el código.

---

## 3. Cola de comandos de dominio

**No es una cola de llamadas RPC — es una cola de comandos de dominio.** Hoy el transporte que ejecuta cada comando es `supabase.rpc(...)`, pero eso es un detalle de implementación, no el contrato. La cola almacena la *intención* (`REPORT_EXECUTION`, `VERIFY_EXECUTION`, `REJECT_EXECUTION`, `UPLOAD_ATTACHMENT`), no la forma de transporte — si mañana `report_execution` deja de ser un RPC y pasa a ser una transacción SQL directa, un endpoint REST o un worker, la cola no debería cambiar de forma, solo el adaptador que ejecuta cada `type`.

Estructura propuesta, extendiendo el concepto de `OfflineMutation` sin forzarlo a los tres carriles:

```
command {
  id               // UUID generado en el cliente — ver "Idempotencia" más abajo
  type             // 'REPORT_EXECUTION' | 'VERIFY_EXECUTION' | 'REJECT_EXECUTION' | 'UPLOAD_ATTACHMENT' | ...
  entity_id        // execution_id, plan_id, etc. — para poder encadenar dependencias
  payload          // argumentos del comando (agnósticos del transporte)
  depends_on       // id de otro comando en cola, si depende de que ese se sincronice primero
  status           // 'queued' | 'pendiente' | 'sincronizando' | 'sincronizado' | 'error' | 'conflicto'
  attempts
  last_error       // mensaje/código estructurado del último fallo
  created_at
}
```

Cada `type` de comando define su propio adaptador de "replay" (hoy: qué RPC llamar y con qué argumentos) y su propia interpretación de errores (ver punto 5).

**`depends_on` es una simplificación deliberada para la primera versión.** El caso real (crear jornada → editarla → agregar dos fotos → reportarla) es en rigor un grafo de operaciones, no una cadena lineal. La primera implementación usa dependencia lineal (`depends_on` apunta a un único comando anterior) porque cubre el flujo principal sin la complejidad de un DAG completo. Si en la práctica aparecen ramas múltiples que un `depends_on` lineal no pueda representar bien, el modelo puede evolucionar a un DAG (`depends_on` como lista) sin cambiar el concepto — no es una limitación a "arreglar después a la fuerza", es una decisión de alcance explícita.

---

## 4. Fotografías — Blob, no JSON

Una foto no es un objeto de mutación como los demás. Flujo propuesto:

```
Captura (cámara) → Blob en IndexedDB (object store nuevo, ej. "pending_attachments")
                          │
                          ▼ (al reconectar)
                    Subida a Storage (bucket `attachments`, misma convención
                    de `buildAttachmentPath` ya centralizada)
                          │
                          ▼
                    URL pública
                          │
                          ▼
                    INSERT en execution_attachments (comando RPC-like,
                    aunque técnicamente sea un INSERT directo — se trata
                    como parte del mismo carril de "comandos" porque
                    depende de la subida a Storage completada antes)
```

La foto queda visible en la UI del líder de inmediato (URL local `Blob` vía `URL.createObjectURL`, la misma técnica que ya usaba el prototipo original de `PhotoVerificationModal` — aquí sí tiene sentido, como estado transitorio *mientras* se sincroniza, no como estado final).

Puntos a definir explícitamente antes de implementar (no dejar implícitos, o un dispositivo puede terminar acumulando cientos de MB sin que nadie lo note):

- **Límite máximo por imagen** (tamaño de archivo y/o resolución) antes de aceptar la captura.
- **Compresión previa a guardar el Blob**, no solo previa a subir — comprimir antes de escribir a IndexedDB evita acumular el peso original mientras espera conexión (relacionado con la mejora "Compresión de imágenes" ya registrada como pendiente).
- **Política de expiración** si un Blob nunca llega a sincronizar (dispositivo perdido, app desinstalada y reinstalada, usuario que nunca vuelve a tener señal en ese sitio): ¿se conserva indefinidamente, se avisa al usuario después de N días, se descarta con confirmación explícita? No debe descartarse en silencio — perder evidencia sin que el líder lo sepa es peor que ocupar espacio.

---

## 5. Resolución de conflictos

Regla general: **un fallo transitorio se reintenta; un fallo semántico nunca se reintenta solo — se detiene y se le muestra al usuario.** El comportamiento actual de `useOfflineSync` (reintentar hasta 3 veces y luego descartar silenciosamente) es correcto para fallos de red, pero **activamente dañino** para comandos RPC: un RPC que rechaza por una regla de negocio (ej. "el plan ya no está `published`/`in_progress`") nunca va a tener éxito por más veces que se reintente — reintentarlo 3 veces y descartarlo en silencio pierde el trabajo del líder sin que nadie se entere.

Clasificación propuesta:

| Tipo de fallo | Ejemplo | Tratamiento |
|---|---|---|
| Transitorio | timeout, fetch failed | reintentar con backoff (patrón `attempts` ya existente) |
| Semántico del RPC | plan ya no está `published`/`in_progress`; ejecución ya no está en el estado esperado; `ERRCODE = 'MEVID'` | **no reintentar** — marcar `conflicto`, detener los comandos que dependan de esa entidad, conservar el mensaje/código exacto del RPC para mostrarlo (mismo patrón que `MissingEvidenceError`) |
| Dependencia rota | el comando `depends_on` quedó en `conflicto` o `error` | propagar `conflicto` sin intentar ejecutar |

Ejemplos concretos por comando, para no dejar la interpretación abierta durante la implementación:

**`REPORT_EXECUTION`**
```
OK:        draft → reported
Conflicto: la ejecución ya no está en draft (alguien más ya la reportó,
           por ejemplo un asistente reportando en su nombre — Máquina 2,
           workflow.md)
Acción:    detener la cadena de comandos dependientes de esa entidad,
           marcar conflicto, mostrar el estado real del servidor,
           requiere intervención (líder o asistente decide)
```

**`VERIFY_EXECUTION` / `REJECT_EXECUTION`**
```
OK:        reported → verified | rejected
Conflicto: la ejecución ya no está en reported (ya fue verificada o
           rechazada por otro supervisor, o el líder la corrigió con
           una jornada nueva)
Acción:    igual que arriba — conflicto, no reintento ciego
```

**`UPLOAD_ATTACHMENT`**
```
OK:        Blob sube a Storage, INSERT en execution_attachments
Conflicto: la ejecución padre (execution_id) ya no existe o su comando
           de creación quedó en conflicto — no se sube el archivo
           huérfano, el Blob permanece en cola como dependencia rota
Acción:    conflicto (dependencia rota, no fallo propio)
```

Otro caso orientador: **el plan se cierra mientras el líder tiene comandos pendientes** de esa semana → sus `REPORT_EXECUTION` en cola fallan con el error semántico real del RPC ("plan no está in_progress/published") → `conflicto`.

Ninguno de estos casos se resuelve automáticamente por diseño — la resolución automática de "qué versión gana" es exactamente el tipo de decisión que un supervisor u administrador debe tomar, no el cliente.

---

## Idempotencia

Si la conexión se pierde justo después de que el servidor procesó un comando pero antes de que el cliente reciba la respuesta, el cliente no puede distinguir "nunca llegó" de "llegó pero no vi la confirmación" — y un reintento ciego duplicaría la operación (ej. dos filas de `execution_attachments` para la misma foto, o un intento de reportar dos veces).

Se propone:

- Cada comando lleva un `id` generado en el cliente (UUID) desde que se encola — no uno asignado por el servidor al ejecutar.
- El servidor recuerda qué `command_id` ya procesó (tabla de comandos procesados, o el propio RPC valida que ese `command_id` no se haya visto antes) y, ante un reintento con el mismo `id`, responde como si hubiera tenido éxito sin repetir el efecto.
- Esto es responsabilidad del lado servidor (RPC o tabla de deduplicación), no algo que el cliente pueda garantizar por sí solo con reintentos "inteligentes" — el cliente solo necesita generar el `id` una vez y reenviarlo igual en cada intento.

Sin esto, cualquier corte de red en el momento exacto entre ejecución y confirmación produce duplicados difíciles de depurar más tarde, cuando ya no queda rastro de qué pasó en el momento.

---

## 6. Estados de sincronización visibles

"Pendiente" es ambiguo si se usa para todo: pendiente de subir (el Blob ni siquiera se ha intentado enviar), pendiente de sincronizar (ya se intentó, esperando reintento o conexión), pendiente de revisión (quedó en conflicto y espera a un humano) son cosas distintas aunque a un líder en campo le parezcan "lo mismo: no terminó". Por eso el modelo interno separa un estado más de los que se muestran:

- **queued** *(interno)* — el comando se generó y se guardó en la cola local, pero todavía no se intentó ningún envío (ej. se creó offline, sin red desde el primer momento). Distinto de "pendiente": aquí ni siquiera hubo un intento fallido, solo no ha habido oportunidad de intentar.
- **pendiente** — ya se intentó al menos una vez y espera su turno o conexión para reintentar.
- **sincronizando** — en curso.
- **sincronizado** — confirmado por el servidor.
- **error** — fallo transitorio, reintentando.
- **conflicto** — fallo semántico, requiere decisión humana. No desaparece solo.

La UI puede agrupar `queued` y `pendiente` bajo una sola etiqueta visible ("pendiente de sincronizar") sin problema — la distinción importa para depurar y para las métricas internas (ej. "cuánto tiempo pasa un comando en `queued` antes del primer intento" es una señal de qué tan mal cubre la zona), no necesariamente para lo que ve el líder en pantalla.

En trabajo de campo, saber "esto quedó en conflicto y alguien tiene que mirarlo" vale más que una barra de progreso genérica.

---

## Invariantes

No son explicación — son el contrato que ninguna implementación de este diseño puede romper, hoy ni en una futura "optimización":

1. Toda decisión de negocio vive exclusivamente en el servidor. El cliente offline únicamente registra intención y reproduce comandos; nunca valida reglas de negocio de certificación.
2. Un comando solo puede producir un efecto una vez. Repetir el mismo `command_id` debe devolver el mismo resultado lógico (ver Idempotencia).
3. Los comandos se ejecutan respetando dependencias. Si un comando padre termina en `conflicto`, ningún hijo dependiente puede sincronizarse automáticamente.
4. Los archivos nunca se consideran sincronizados hasta existir simultáneamente en Storage y en la tabla correspondiente (`execution_attachments`). Uno sin el otro es un estado inconsistente, no un éxito parcial.
5. La UI refleja el estado del comando, no intenta deducir el estado del servidor. Si existe incertidumbre, debe mostrarse como `conflicto` o `pendiente de sincronizar`, nunca como éxito.

Cualquier implementación futura que necesite "adelantar" una validación en el cliente por velocidad percibida debe releer el invariante 1 primero — ese tipo de atajo es exactamente lo que produce dos verdades distintas, una en el navegador y otra en la base de datos.

---

## Fuera de alcance de este diseño

- La pantalla/flujo de resolución de conflictos en sí (quién la ve, qué puede hacer) — se define cuando se implemente, probablemente parte del rol de asistente/admin, no del líder en campo.
- Si Verificar/Observar del supervisor termina siendo offline o no — depende de una decisión operativa (¿el supervisor certifica en el sitio sin señal, o vuelve a oficina primero?), no técnica.
- Migrar el módulo original del tablero (items/boards) a este mismo modelo de tres carriles — no hace falta, ya funciona con el patrón CRUD existente.

## Próximo paso

Si este diseño se aprueba, la implementación se dividiría en incrementos propios (siguiendo la misma disciplina de esta sesión): (1) cachear las tablas nuevas en IndexedDB para lectura offline, (2) cola de comandos de dominio para `REPORT_EXECUTION`, (3) cola de Blobs para evidencia, (4) UI de estados de sincronización y resolución de conflictos, incluyendo idempotencia por `command_id` en el servidor.
