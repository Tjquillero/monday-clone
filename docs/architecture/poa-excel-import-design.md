# Diseño: Importador del Excel oficial del POA

**Estado: Propuesto — diseño previo a implementación, no construido todavía.**

Este documento responde a la pregunta "¿cómo se convierte el Excel oficial del POA en una nueva `poa_version`?", una vez que [ADR-0003](../adr/ADR-0003-billing-source.md) y [ADR-0004](../adr/ADR-0004-poa-zone-catalog.md) ya definieron el *qué* y el *por qué*. Toda la estructura de archivo descrita aquí fue **verificada contra el Excel real** (`POA 2026 V.02 Ene.26-2026.xlsx`, presente en la raíz del repo) — ninguna parte de este documento asume una tabla plana genérica.

---

## 1. Alcance

El workbook tiene 3 hojas: `POA INICIAL 2026`, `PPTO + ADICION`, `RES. GRAL INICIAL`. Solo la primera contiene detalle por actividad y zona — las otras dos son resúmenes ejecutivos (saldos y totales por área, sin una fila por actividad). **El importador solo lee `POA INICIAL 2026`.** Las otras dos hojas quedan fuera de alcance; si en el futuro se necesita validar cifras cruzadas contra ellas, es una extensión posterior, no parte de este importador.

---

## 2. Estructura real del archivo (verificada, no asumida)

`POA INICIAL 2026`: 121 filas × ~364 columnas.

- **Fila 1**: nombres de zona, como texto libre con el sufijo `"(presupuesto mes)"` (ej. `"PLAZA DE PTO COLOMBIA (presupuesto mes)"`), uno por cada bloque de columnas de zona. 9 zonas detectadas en el archivo actual.
- **Fila 2**: subencabezados de cada bloque. Por zona: `CANT.` / `FREC.` / `PRECIO TOTAL` (el "presupuesto del mes", constante), seguido de 12 pares `CANT.`/`V/TOTAL` (uno por cada Acta mensual, Acta 32=Ene.2026 → Acta 43=Dic.2026), y un par final `CANT.`/`V/TOTAL` de acumulado.
- **Fila 3 en adelante**: una fila por actividad.
  - Columna A: categoría (solo en la primera fila de cada grupo, ej. `"MANTENIMIENTO DE PLAYAS"` — las filas siguientes de la misma categoría la dejan vacía; hay que propagar hacia abajo el último valor no vacío).
  - Columna B: **código contractual del ítem** (`1.01`, `1.02`, `2.01`...) — ver Sección 3.
  - Columna C: descripción.
  - Columna D: unidad.
  - Columnas E-G: cantidad/precio de referencia 2025/2026 (informativos; no se usan para poblar `poa_activities`, ver Sección 4).
  - Por cada bloque de zona: `CANT.` (columna de inicio del bloque) = cantidad contratada mensual para esa zona; `FREC.` = frecuencia; `PRECIO TOTAL` = `CANT. × Vr. Unitario` (verificado aritméticamente, ver Sección 4).

**Verificado con datos reales** (actividad `1.01`, tres zonas distintas): `PRECIO TOTAL / CANT.` da exactamente el mismo valor en las tres zonas (1412.8795648795647), y coincide exactamente con la columna "Vr. UNITARIO 2026" de esa fila. `FREC.` también es constante entre zonas para la misma actividad. Esto confirma que **precio y frecuencia son atributos de la actividad, no de la zona** — coincide exactamente con el esquema ya implementado por ADR-0002 (`poa_activities.precio_unitario`/`frecuencia` a nivel de actividad; `poa_activity_zones.cantidad_contratada` por zona). **No hace falta ningún cambio de esquema para esto.**

También se verificó que la columna de acumulado de cada zona es la suma aritmética de los 12 pares mensuales *dentro del mismo archivo* (diferencia de redondeo de punto flotante en el décimo dígito, nada más) — no es un dato importado de otro sistema.

---

## 3. Identidad de una actividad

La identidad de una actividad es su **código contractual de la columna B** (`1.01`, `2.01`, ...) — nunca el nombre ni la descripción (Regla del ADR-0003 / instrucción explícita del dueño del proceso). Este código pasa a ser el `activity_key` del dominio. El sistema debe reconocer la misma actividad entre versiones del POA únicamente por este código — si el texto de la descripción cambia entre versiones, sigue siendo la misma actividad mientras el código no cambie.

---

## 4. Qué SÍ y qué NO se importa de cada fila

**Se importa** (por actividad × zona, hacia `poa_activities`/`poa_activity_zones` de la nueva versión):
- `activity_key` = código contractual (columna B).
- `precio_unitario` = "Vr. UNITARIO 2026" (o el año vigente — ver nota).
- `frecuencia` = `FREC.` del bloque de zona (constante entre zonas, se toma de cualquiera).
- `cantidad_contratada` (por zona) = `CANT.` del bloque de "presupuesto mes" de esa zona.
- Categoría, descripción, unidad — para el Catálogo Técnico (`board_activity_standards`, ya reducido por ADR-0002), no para `poa_activities`. Esto es la representación técnica actual del POA_ACTIVITY conceptual (dividido en dos tablas por razones pragmáticas de ADR-0002) — no contradice la tabla de "Fuente de verdad por campo" de ADR-0003: esa tabla describe el origen conceptual ("lo gobierna el POA vigente, no la ejecución"), no en qué tabla física aterriza cada campo.

**NO se importa, deliberadamente** (Sección "Puntos pendientes" de ADR-0003: el Acta nunca copia una fuente externa, siempre se calcula desde ejecuciones `verified`):
- Las 12 columnas mensuales de Acta 32-43 (`CANT.`/`V/TOTAL` por mes).
- La columna de acumulado.

Estas columnas son la herramienta de seguimiento manual que el Incremento 5 reemplaza — leerlas equivaldría a mantener una copia paralela de la realidad contractual, exactamente lo que ADR-0003 prohíbe. El importador las ignora por completo; ni se leen ni se validan contra ellas.

---

## 5. Identidad de zona (ver ADR-0004)

La zona del Excel (texto de la fila 1, sin el sufijo `"(presupuesto mes)"`) se resuelve contra un catálogo de mapeo persistente, nunca por coincidencia de texto. Tabla propuesta:

```sql
CREATE TABLE poa_zone_mappings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poa_id           UUID NOT NULL REFERENCES poa(id) ON DELETE CASCADE,
  excel_zone_name  TEXT NOT NULL,        -- texto exacto del Excel, ej. "PLAZA DE PTO COLOMBIA"
  group_id         UUID REFERENCES groups(id) ON DELETE SET NULL,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poa_id, excel_zone_name)
);

-- Búsqueda inversa (¿qué zonas del POA apuntan a este group?) y detección de
-- mapeos pendientes — ambas consultas frecuentes de la pantalla de resolución.
CREATE INDEX idx_poa_zone_mappings_group_id ON poa_zone_mappings(group_id);
CREATE INDEX idx_poa_zone_mappings_pending ON poa_zone_mappings(poa_id) WHERE group_id IS NULL;
```

- **Unicidad del par**: `UNIQUE (poa_id, excel_zone_name)` es la restricción real — un mismo nombre de zona del Excel resuelve siempre al mismo `group_id` dentro de un mismo POA (contrato). Deliberadamente **no** se restringe `group_id` a aparecer una sola vez: si el nombre de una zona cambia de una versión del Excel a otra (ej. la finance team lo renombra), es legítimo que dos `excel_zone_name` distintos apunten al mismo `group_id` histórico — no es un error, es el mismo mapeo persistente haciendo su trabajo.
- **`poa_id` con `ON DELETE CASCADE`**: si el `poa` se elimina (caso raro, principalmente limpieza de datos de prueba), sus mapeos no deben quedar huérfanos.
- **`group_id` nulo representa "pendiente de asignar"** — cubre tanto una zona nueva nunca antes vista como una zona cuyo `group` fue eliminado (Regla 5 de ADR-0004: no se borra el mapeo, se marca pendiente). El índice parcial `idx_poa_zone_mappings_pending` hace que "¿qué zonas de este POA siguen sin resolver?" sea una consulta directa sobre el índice, no un escaneo completo de la tabla.
- **"Todo o nada" no lo garantiza esta tabla por sí sola** — lo garantiza que el importador completo (parseo, resolución de zonas, creación de `poa_version`/`poa_activities`/`poa_activity_zones`) corra dentro de una única función `SECURITY DEFINER` (una sola transacción de Postgres), igual que ya hace `replace_weekly_plan_items` con su DELETE+INSERT atómico. Si cualquier validación falla a mitad de camino — incluida una zona sin mapeo — toda la función debe terminar con `RAISE EXCEPTION`, revirtiendo cualquier fila ya insertada en esa misma corrida. La tabla solo provee los índices para detectar el problema rápido; la atomicidad es responsabilidad de la función, no del esquema.
- RLS admin-only, mismo patrón que el resto de tablas del dominio POA.

---

## 6. Flujo de importación propuesto

```
1. Cargar el archivo (.xlsx) → parsear hoja "POA INICIAL 2026".
2. Validar estructura (Sección 7). Si falla, rechazar el archivo completo
   con un mensaje que identifique la fila/columna exacta del problema.
3. Extraer el conjunto de zonas distintas (fila 1) y actividades (columna B).
4. Resolver cada zona contra poa_zone_mappings (por poa_id):
   - Si TODAS tienen group_id asignado → continuar al paso 5.
   - Si ALGUNA no tiene mapeo (fila nueva o group_id NULL) → detener aquí.
     No se crea ninguna poa_version todavía. Se muestra la lista de
     zonas sin resolver; el asistente/admin las asigna a un group real
     desde un desplegable, se guardan en poa_zone_mappings, y recién
     entonces se reintenta el importar (mismo archivo, ya sin zonas
     pendientes).
5. Crear una poa_version nueva (status='draft' hasta confirmar, luego
   'active'; ver Sección 8 para el detalle de la transición de estado
   previa).
6. Por cada actividad (fila): crear/actualizar poa_activities
   (activity_key, precio_unitario, frecuencia) para la nueva versión.
7. Por cada actividad × zona con CANT. > 0: crear poa_activity_zones
   (cantidad_contratada), usando el group_id resuelto en el paso 4.
8. Marcar la nueva versión como 'active'; la versión anterior deja de
   serlo (mismo mecanismo ya existente de ADR-0002 — único índice
   activo por poa_id).
```

Este flujo es deliberadamente **todo o nada**: no existe un estado intermedio donde una parte de la nueva versión ya esté activa mientras otra parte sigue pendiente de mapeo (Regla 4 de ADR-0004).

---

## 7. Validaciones antes de aceptar el Excel

Verificaciones que el importador debe correr **antes** de crear cualquier fila, rechazando el archivo completo si alguna falla:

- Código de actividad (columna B) no vacío y sin duplicados dentro del mismo archivo.
- Unidad (columna D) no vacía.
- `CANT.` (por zona) no negativa.
- `FREC.` y precio unitario no negativos.
- Estructura de columnas reconocible (fila 1 y fila 2 con los encabezados esperados) — si el layout cambia de forma no reconocida, rechazar con un mensaje claro en vez de importar datos mal alineados.

**Fuera de alcance de este documento, pendiente de decisión** (no se asume una respuesta): qué hacer si la unidad de una actividad cambia entre versiones (ej. `m²` → `ml`) — ¿se trata como la misma actividad con unidad distinta, o como señal de error de captura? Se deja como validación de advertencia (no bloqueante) hasta que el dueño del proceso decida.

---

## 8. Actividad nueva o que desaparece entre versiones

Consistente con ADR-0003 ("no existe lógica especial para actividades no previstas"):

- **Actividad nueva** (código que no existía en la versión anterior): se crea automáticamente como parte de la nueva versión, sin pedir confirmación línea por línea — el Excel cargado por el asistente ya es, en sí mismo, la aprobación.
- **Actividad que desaparece** (código que existía antes pero no aparece en el Excel nuevo): no se crea una fila `poa_activities` para ella en la nueva versión. La versión anterior sigue existiendo sin modificarse (Regla 19 de `poa-domain.md`, conservación histórica) — la actividad simplemente deja de estar vigente a partir de esta versión, sin ninguna marca especial de "cerrada" ni "eliminada".

## 9. Ejecuciones ya verificadas cuando la cantidad contratada baja — resuelto

Caso señalado explícitamente por el dueño del proceso: una actividad tenía `cantidad_contratada = 100` en la Zona A, ya se verificaron `80`, y la versión nueva trae `60` para esa misma actividad × zona.

**Regla, ya decidida**: la nueva versión del POA nunca modifica el histórico ejecutado ni certificado. El POA vigente (última versión cargada) gobierna la planeación y la generación de las actas *futuras*, pero no reescribe lo ya ejecutado ni lo ya certificado. El importador:

- **No bloquea la importación.** Una disminución de cantidad contratada respecto a lo ya verificado no es un error del Excel — puede ser una disminución contractual aprobada.
- **No modifica ni recalcula** las ejecuciones `verified` ya existentes, no borra evidencias, no toca actas anteriores.
- **Registra la diferencia para control administrativo**, calculada en el momento de mostrarla (nunca almacenada como una copia independiente — mismo principio de ADR-0003):
  ```
  Cantidad contratada vigente: 60   (poa_activity_zones de la versión active)
  Cantidad ya certificada:     80   (SUM(executed_qty) de ejecuciones verified para esa actividad×zona)
  Diferencia:                 +20   (sobreejecución respecto a la versión vigente)
  ```
  Este cálculo es una vista/proyección igual que el Acta misma (Sección "Fuente de verdad" de ADR-0003) — no una tabla nueva de "diferencias" que deba mantenerse sincronizada.

**Regla de origen por campo (conecta este documento con ADR-0003):** la generación automática del Acta siempre usa la última versión vigente del POA para descripción, unidad, precio unitario y cantidad contratada de referencia — pero las cantidades **certificadas** provienen exclusivamente de las ejecuciones `verified`, nunca de una columna del Excel. Ver ADR-0003, sección "Fuente de verdad", regla de origen por campo.

---

## Fuera de alcance de este diseño
- La interfaz de resolución de mapeos de zona (quién la ve, cómo se ve el desplegable) — se define al implementar.
- Migrar actas o datos ya existentes en el Excel hacia el sistema — ADR-0003 ya estableció que el histórico no se reconcilia.
- Las hojas `PPTO + ADICION` y `RES. GRAL INICIAL`.

## Próximo paso
Si este diseño se aprueba: (1) migración de `poa_zone_mappings`, (2) parser del Excel + validaciones de la Sección 7, (3) UI de resolución de mapeos de zona, (4) creación de la nueva `poa_version` + `poa_activities`/`poa_activity_zones` con la vista de diferencia contratada/certificada de la Sección 9.
