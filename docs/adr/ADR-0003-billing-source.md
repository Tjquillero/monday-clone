# ADR-0003 — Fuente y Mecanismo de Generación del Acta

## Estado
Aceptado (mecanismo de generación, y relación con el histórico) — con dos supuestos de trabajo aún pendientes de confirmación explícita, ver sección "Puntos pendientes de confirmación".

## Fecha
2026-07-09

**Actualización (2026-07-12):** se agregó la sección "Mecanismo de emisión del Acta" — corrige la suposición inicial de relación 1:1 entre Acta y período/mes calendario (ver Regla 7 corregida en `poa-domain.md`) y especifica el mecanismo, antes implícito, de cuándo el Acta pasa de proyección viva a documento emitido e inmutable. No modifica ninguna decisión ya aceptada arriba (fuente de verdad por campo, precio unitario, relación con el histórico).

## Contexto
`docs/discovery/billing-source-analysis.md` documentó un choque de gobernanza sin resolver: la implementación real de Facturación (`financial_actas`/`financial_acta_details`, cálculo desde `item.values.*`) no tiene relación alguna con `poa-domain.md` (Regla 14, Origen Único del Cobro) ni con `execution-domain.md`. Ese documento dejó 5 preguntas abiertas, todas de negocio, no técnicas.

El dueño del proceso definió ahora el mecanismo de generación del Acta hacia adelante — no como una solución técnica, sino como una regla de negocio explícita, precisamente para evitar que la implementación infiera comportamiento no especificado (como ya ocurrió una vez con una regla inexistente de "el ejecutado nunca puede superar el POA").

## Decisión

### Naturaleza del Acta y el Informe
El Acta y el Informe **no se generan al final del período**. Son documentos vivos que se construyen automáticamente durante la ejecución del contrato: cada vez que una ejecución pasa a `verified`, esa ejecución entra inmediatamente a formar parte del Acta en construcción. Al finalizar el período, únicamente se cierra o emite el documento — no se genera desde cero.

### Fuente de verdad
La certificación del Acta se calcula siempre a partir de:
1. La versión **activa** del POA (`poa_versions.status = 'active'`).
2. Las ejecuciones en estado `verified` (`weekly_plan_item_executions.status = 'verified'`).

El Acta **nunca mantiene una copia independiente** de las cantidades o precios del POA. Siempre se calcula leyendo la versión activa en el momento del cálculo — el Acta no almacena la realidad contractual, la proyecta.

**Regla de origen por campo, para que no quede ambigüedad sobre de dónde sale cada dato:**

| Campo | Fuente de verdad |
|---|---|
| Código de actividad | POA (versión vigente) |
| Descripción | POA (versión vigente) |
| Unidad | POA (versión vigente) |
| Precio unitario | POA (versión vigente) |
| Cantidad contratada | POA (versión vigente) |
| Cantidad certificada | Ejecuciones `verified` |

Nunca de una columna del Excel ni de un valor copiado en algún punto intermedio. Esta distinción conecta este ADR con el importador del Excel (`docs/architecture/poa-excel-import-design.md`, Sección 9): la versión activa del POA aporta el marco de referencia vigente; el histórico certificado vive únicamente en las ejecuciones ya verificadas.

### Versionamiento del POA como mecanismo de evolución del contrato
El POA puede tener múltiples versiones. Cada vez que el Asistente carga un nuevo Excel: se crea una `poa_version` nueva, esa versión pasa a `active`, y la anterior deja de serlo. Desde ese momento el sistema completo — incluida cualquier Acta en construcción — trabaja sobre la nueva versión. No existe lógica especial para versiones antiguas una vez reemplazadas.

### No existen "actividades no previstas" ni "cantidades adicionales" como casos especiales
Desde la perspectiva del sistema, estos conceptos no existen como excepciones de código:
- Una actividad adicional aprobada se incorpora actualizando el Excel del POA y cargando una nueva versión. A partir de ahí se comporta exactamente igual que cualquier otra actividad de esa versión.
- Un aumento de cantidad contratada se resuelve de la misma forma: no se maneja como excepción ni se suma manualmente sobre el Acta ya construida. La nueva cantidad es, simplemente, parte de la nueva versión activa.

**No debe existir código con reglas especiales para "actividad no prevista" o "cantidad adicional".** Si aparece la tentación de escribir una, es señal de que el cambio debería resolverse cargando una nueva versión del POA, no en la lógica del Acta.

### Regla de negocio central
El Acta siempre representa la certificación contra **la versión activa del POA en el momento del cálculo** — no la versión vigente cuando comenzó el mes, ni la vigente cuando se ejecutó la actividad. Si el Asistente carga una nueva versión del POA mientras un Acta sigue en construcción, esa Acta se recalcula automáticamente contra la nueva versión, sin migración manual ni regeneración de datos históricos.

### Actividad que desaparece de una nueva versión del POA
Si una actividad (identificada por su código contractual, no por nombre) no existe en la nueva versión activa del POA: deja de estar disponible para nuevas programaciones (Cronograma), pero permanece para preservar el histórico de ejecuciones, certificaciones y actas ya generadas contra versiones anteriores. No se marca como "cerrada" ni se elimina — simplemente no tiene fila en la nueva versión, consistente con Regla 19 de `poa-domain.md` (conservación histórica, no eliminación física).

### Precio unitario cuando cambia entre versiones
El Acta siempre usa el precio unitario de la **versión activa del POA en el momento del cálculo** — nunca el precio vigente cuando se ejecutó la actividad. Ejemplo: si la Versión 1 tenía precio $10.000 y ya se certificaron 50 unidades contra ese precio, y luego la Versión 2 sube el precio a $12.000, el Acta en construcción pasa a calcular sobre $12.000 para todo lo que se certifique de ahí en adelante — no se conserva un precio histórico por ejecución. Esto es consecuencia directa de la Regla de negocio central (el Acta certifica contra el contrato vigente, no contra un precio congelado al momento de ejecutar) y de que el Acta nunca mantiene una copia independiente de los valores del POA.

### Mecanismo de construcción automática
Cada vez que una ejecución cambia a `verified`:
1. Se actualiza automáticamente el Acta en construcción del período correspondiente.
2. Se actualiza automáticamente el Informe.
3. Los acumulados se recalculan usando la versión activa del POA en ese momento.

### Relación con el histórico (Actas ya emitidas)
El POA es un documento anual y puede tener múltiples versiones durante la ejecución del contrato. **Cada nueva versión no parte desde cero**: incorpora el histórico acumulado de las actas ya emitidas, de modo que la versión activa siempre representa el estado vigente completo del contrato — cantidades originalmente contratadas, modificaciones aprobadas, actividades no previstas autorizadas, y el acumulado ya ejecutado/facturado hasta ese momento.

En consecuencia:
- **El sistema no reconcilia el histórico.** No hay ninguna operación de código que recalcule o remapee las actas ya emitidas contra el modelo nuevo. Esa reconciliación ya ocurrió *fuera del sistema*, en el momento en que quien administra el contrato preparó la nueva versión del Excel del POA incorporando el acumulado anterior.
- **Las actas ya emitidas no se modifican.** Lo único que cambia al cargar una nueva versión es la línea base para las actas *futuras* — la nueva versión activa.
- El sistema simplemente confía en que la versión `active` del POA en cualquier momento dado ya refleja correctamente el estado del contrato. No calcula ni valida un "saldo disponible" por su cuenta — ese cálculo (cantidades originales + adiciones aprobadas + actividades no previstas − acumulado ya ejecutado/facturado) es responsabilidad de quien prepara el Excel del POA, no del código del Acta.

Esto convierte el ciclo en continuo: se carga una versión del POA → el líder ejecuta y sube evidencias → el supervisor verifica → el sistema propone automáticamente el Acta del período (ver "Mecanismo de emisión del Acta" abajo) → esa Acta alimenta el acumulado contractual → cuando se emite la siguiente versión del POA, esa versión ya incorpora ese acumulado y se convierte en la nueva línea base. El sistema participa en los primeros cuatro pasos; el quinto (incorporar el acumulado a la versión siguiente) ocurre fuera del sistema, en la preparación del Excel.

### Mecanismo de emisión del Acta (extiende, no reemplaza, las reglas de cálculo de esta sección)

El cierre de un período (`close_weekly_plan`, `confirmed → closed`) certifica ese período — no genera ningún acta. Las certificaciones de un período cerrado quedan disponibles para facturación hasta ser incorporadas a una o más actas.

El sistema genera automáticamente un borrador construido con las certificaciones pendientes de facturación. Antes de emitir el acta, el administrador podrá modificar dicho borrador agregando, retirando o ajustando las cantidades a facturar de cada certificación, siempre respetando que la suma facturada de una certificación nunca supere la cantidad certificada. El acta se emite con su consecutivo oficial una vez el administrador confirma el contenido del borrador.

Un acta podrá agrupar una o varias certificaciones pendientes; normalmente equivalen a un período completo. Excepcionalmente, por necesidades de cierre contable, una misma certificación podrá facturarse de forma parcial en más de un acta, siempre que la suma de las cantidades facturadas no supere la cantidad certificada.

**Mientras el acta está en estado borrador**, sigue aplicando sin cambios la Regla de negocio central ya aceptada arriba: se calcula contra la versión `active` del POA en el momento del cálculo. **Al emitirse**, el acta queda congelada y no vuelve a recalcularse.

Esta extensión no modifica la fuente de verdad por campo, la regla de precio unitario, ni la relación con el histórico ya definidas arriba — solo especifica el mecanismo, antes implícito, de cuándo y cómo el acta pasa de proyección viva a documento emitido.

### Principio de diseño
El Acta no almacena la realidad contractual — la realidad contractual vive siempre en la versión activa del POA. El Acta es únicamente una proyección automática de (versión activa del POA) × (ejecuciones verificadas).

> **Nota de implementación (verbatim del dueño del proceso, deliberadamente preservada):** No asumir que el POA es un límite fijo del contrato. El contrato evoluciona mediante nuevas versiones del POA. La implementación debe consultar siempre la versión `active` y evitar cualquier lógica específica para "actividades no previstas" o "cantidades adicionales". Esos cambios ya deben estar incorporados en la versión vigente del POA, y el Acta debe reflejar automáticamente esa realidad contractual. Esto cambia la perspectiva de "validar contra el POA" por "certificar contra el contrato vigente".

## Puntos resueltos por esta decisión
1. **Actas históricas (Acta 32 y ~31 anteriores) — resuelto.** No se reconcilian ni se recalculan por código. La reconciliación ya ocurre fuera del sistema: cada nueva versión del POA se prepara incorporando el acumulado ejecutado/facturado hasta ese momento, así que la versión `active` siempre representa el estado vigente completo del contrato (ver "Relación con el histórico" arriba). El Incremento 5 no escribe, borra ni recalcula ninguna de las actas ya emitidas.

## Puntos pendientes de confirmación
Esta decisión resuelve el **mecanismo de generación hacia adelante y su relación con el histórico**. No resuelve, y no debe darse por resuelto silenciosamente, lo siguiente — ver `docs/discovery/billing-source-analysis.md` para el detalle original de cada pregunta:

1. **Novedades de Pago (NP).** Supuesto de trabajo, no confirmado explícitamente: no existe ningún flujo de NP fuera del sistema que deba contemplarse — el Acta se construye únicamente desde POA activo + ejecuciones `verified`, sin ningún mecanismo de NP. Si existe un flujo real de NP (papel, Excel, correo, acuerdos paralelos) generando cobros hoy, debe formalizarse como una extensión explícita de este ADR, no ignorarse.
2. **Identidad del contrato.** Supuesto de trabajo, no confirmado explícitamente: "Tablero Principal" (el board real con Acta 32 y 37 líneas de detalle) es el mismo contrato que gobierna `poa-domain.md` — el Acta nueva se construye sobre ese mismo board una vez tenga una `poa_version` activa cargada con las 220 actividades reales.

Mientras estos dos puntos no se confirmen explícitamente, cualquier implementación del Incremento 5 debe tratarlos como supuestos reversibles, no como decisiones cerradas.

## Alternativas consideradas
- **Copiar los valores del POA hacia el Acta al momento de verificar la jornada** (snapshot por ejecución). Descartada explícitamente por el dueño del proceso: violaría el principio de que el Acta nunca mantiene una copia independiente de la realidad contractual, y complicaría el recálculo automático al cargar una nueva versión del POA.
- **Reglas de código especiales para actividades/cantidades no previstas.** Descartada explícitamente: el mecanismo correcto es una nueva versión del POA, no una rama de lógica adicional en el Acta.

## Consecuencias
- El Acta y el Informe pasan a ser vistas/proyecciones calculadas (o materializadas y recalculadas en cada `verified` y en cada cambio de versión activa del POA), no documentos que se generan una sola vez al cerrar el período.
- Cualquier cálculo de cantidad/precio debe leer siempre `poa_activities`/`poa_activity_zones` de la versión `active` — nunca un valor cacheado o copiado al momento de la ejecución.
- El mecanismo de `confirm_weekly_plan` (Gate 1: 0 `reported`, Gate 2: evidencia en todo `verified`) y `close_weekly_plan` (cierre definitivo, solo admin) sigue siendo el punto de cierre administrativo del período; este ADR no lo modifica — `close_weekly_plan` certifica el período (ver "Mecanismo de emisión del Acta"), no emite ningún acta por sí mismo.
- Bloquea, a propósito, cualquier implementación que trate una actividad adicional o un aumento de cantidad como un caso especial en el código del Acta.
- Bloquea, a propósito, cualquier implementación que intente reconciliar, recalcular o migrar las ~32 actas históricas existentes — quedan fuera de alcance permanentemente, no solo temporalmente.

## Documentos afectados
- `docs/discovery/billing-source-analysis.md` — este ADR resuelve el mecanismo de generación hacia adelante que ese documento dejaba abierto; permanece como registro de la investigación original, incluidas las preguntas aún no confirmadas (sección anterior).
- `docs/domain/poa-domain.md` (Regla 14, referenciada; sin cambios) — esta decisión es consistente con el Origen Único del Cobro ya congelado.
- `docs/domain/billing-domain.md` (a redactar) — se escribe tomando este ADR como premisa, una vez implementado y verificado.

## Criterio para revisar esta decisión
Si el dueño del proceso responde los "Puntos pendientes de confirmación" con una respuesta distinta a los supuestos de trabajo aquí registrados (en particular, la existencia real de un flujo de NP, o que "Tablero Principal" no es el mismo contrato que gobierna `poa-domain.md`), este ADR se corrige antes de continuar — no se reinterpreta en el código. Si en el futuro se determina que el histórico SÍ necesita reconciliación (por ejemplo, si se descubre que alguna versión del POA no incorporó correctamente el acumulado anterior), eso también requiere un ADR nuevo que reemplace la sección "Relación con el histórico" de este documento — no un parche silencioso en el código del Acta.
