# ADR-0004 — Catálogo de Zonas del POA y Mapeo Persistente con el Board

## Estado
Aceptado

## Fecha
2026-07-09

## Contexto
Al diseñar el importador del Excel real del POA (ver `docs/architecture/poa-excel-import-design.md`), se verificó contra datos reales del board "Tablero Principal" que **8 de las 9 zonas del Excel no coinciden textualmente con ningún `groups.title` real**:

| Zona en el Excel | `groups.title` real más parecido |
|---|---|
| PLAZA DE PTO COLOMBIA | PLAZA PUERTO COLOMBIA |
| PLAYA MANGLARES | MANGLARES |
| SALGAR PLAYAS DEL COUNTRY 1 | PLAYA DEL COUNTRY |
| SALGAR PLAYAS DE SABANAILLA 2 | PLAYA DE SABANILLA 2 |
| PLAYAS DE MIRAMAR SECTOR EL FARO | MIRAMAR SECTOR EL FARO |
| CENTRO GASTRONOMICO | CENTRO GASTRONÓMICO |
| MERCADO LA SAZÓN | *(sin candidato)* |
| SENDERO SANTA VERÓNICA | SENDERO SANTA VERÓNICA *(único match exacto)* |
| PLAYA PUNTA ASTILLEROS | *(sin candidato)* |

Además, `groups` tiene una zona real ("SALINAS DEL REY") sin ninguna fila correspondiente en el Excel, y dos filas distintas con el mismo título "PRESUPUESTO GENERAL" (duplicado preexistente, no causado por esta decisión).

Esto no es un problema de normalización de texto que un fuzzy-match pueda resolver de forma confiable — **no existe correspondencia 1:1 entre el universo del POA y el universo del Board**. Puede haber zonas contractuales que todavía no existen operativamente, `groups` operativos que no pertenecen a ese contrato, y proyectos especiales que no tienen una zona directa.

## Decisión
El POA define el universo **contractual**. El Board define el universo **operativo**. La relación entre ambos es siempre **explícita, mediante un mapeo persistente** — nunca implícita a partir del nombre de la zona o del `group`.

Reglas:

1. **Catálogo de zonas del POA, independiente del nombre del `group`.** La zona del Excel se identifica por su nombre contractual tal como aparece ahí (`excel_zone_name`), y se relaciona con un `group_id` real mediante una tabla de mapeo persistente — nunca comparando texto en cada importación.
2. **Resolución manual en la primera aparición.** Cuando el importador encuentra un `excel_zone_name` sin mapeo registrado, la carga se detiene: no se importa nada de esa versión hasta que alguien (asistente o admin) le asigna manualmente un `group_id` desde el catálogo de zonas del board.
3. **El mapeo se guarda permanentemente y se reutiliza.** Una vez resuelto, todas las versiones futuras del POA que usen el mismo `excel_zone_name` reutilizan el mismo `group_id` automáticamente, sin pedir confirmación de nuevo.
4. **Todo o nada por importación.** Si cualquier zona del Excel no tiene mapeo resuelto, no se importa parcialmente el resto — la carga completa queda en estado "pendiente de resolver mapeos" hasta que todas las zonas nuevas se asignen.
5. **Un `group` que desaparece no borra el mapeo.** Si el `group_id` de un mapeo ya no existe, el mapeo no se elimina automáticamente — se marca como pendiente de una nueva asignación (`group_id` pasa a `NULL`, la fila y el `excel_zone_name` se conservan) y se informa explícitamente cuál zona contractual quedó sin destino operativo.
6. **Un `group` nuevo sin zona asociada no dispara nada.** Simplemente queda disponible para asignarse la próxima vez que aparezca una zona del POA sin mapeo.
7. **Renombrar un `group` no rompe el POA.** Como la relación se guarda por `group_id` (no por nombre), cambiar el título de un `group` en la interfaz no afecta el mapeo ya resuelto.

## Alternativas consideradas
- **Emparejar automáticamente por similitud de texto** (normalizar acentos/mayúsculas, ignorar palabras como "PLAYA"/"SALGAR"). Descartada: dos de las nueve zonas (`MERCADO LA SAZÓN`, `PLAYA PUNTA ASTILLEROS`) no tienen ningún candidato ni por similitud — un matching automático fallaría silenciosamente o requeriría igual intervención humana, sin ganar nada a cambio de la fragilidad de depender del nombre.
- **Exigir un código de zona estable en el Excel oficial y en el `group`.** Descartada por ahora: requeriría modificar el Excel oficial fuera del control del sistema, y el mapeo persistente ya resuelve el mismo problema sin depender de un cambio externo al proceso de negocio real.
- **Crear el `group` automáticamente cuando no existe.** Descartada: el catálogo de zonas del POA es contractual; decidir si una zona nueva ya existe operativamente (o con qué nombre) es una decisión humana, no algo que el importador deba inferir.

## Consecuencias
- Se crea una tabla de mapeo persistente (`poa_zone_mappings` o equivalente — detalle técnico en `docs/architecture/poa-excel-import-design.md`), con RLS admin-only, igual que el resto de tablas del dominio POA.
- El importador del Excel (Incremento 5) requiere una pantalla/paso explícito de resolución de mapeos antes de completar cualquier carga que introduzca una zona nueva.
- Bloquea, a propósito, cualquier importador que intente adivinar el `group_id` de una zona por coincidencia de texto.
- La duplicidad existente de `groups.title = 'PRESUPUESTO GENERAL'` queda fuera de alcance de este ADR — es deuda de datos preexistente, no algo que el mapeo de zonas deba resolver ni ocultar.

## Documentos afectados
- `docs/architecture/poa-excel-import-design.md` (a redactar/completar) — mecanismo técnico de importación, toma este ADR como premisa para el catálogo de zonas.
- `docs/adr/ADR-0003-billing-source.md` (referenciado) — este ADR resuelve una pieza técnica previa (identidad de zona) necesaria para que el Incremento 5 pueda implementarse; no define ni modifica la fuente de verdad por campo ni la regla de precio unitario, que son responsabilidad exclusiva de ADR-0003.

## Criterio para revisar esta decisión
Si en el futuro el proceso de negocio decide que el Excel oficial del POA debe incluir un código de zona estable (en vez de depender del mapeo manual), este ADR se reemplaza por uno nuevo que documente esa transición — no se reinterpreta silenciosamente el mapeo existente.
