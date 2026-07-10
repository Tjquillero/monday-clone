# Matriz de Casos de Prueba — Importador del Excel del POA

**Estado: Propuesto — contrato de aceptación previo a la implementación del importador.**

Este documento es la especificación ejecutable de [`poa-excel-import-design.md`](./poa-excel-import-design.md), [ADR-0003](../adr/ADR-0003-billing-source.md) y [ADR-0004](../adr/ADR-0004-poa-zone-catalog.md). El importador (Incremento 5) se considera correcto cuando satisface esta matriz — no al revés. La matriz se escribió y verificó contra el Excel real (`POA 2026 V.02 Ene.26-2026.xlsx`) antes de escribir una sola línea del parser.

---

## Pregunta abierta bloqueante — frecuencia variable por zona

Al verificar la premisa del diseño original ("precio y frecuencia son constantes por actividad, no por zona", Sección 2 del documento de diseño) contra **las 107 actividades reales** del archivo — no solo la actividad de muestra (`1.01`) que usó la verificación original — se encontró que:

- **Precio unitario** (columna "Vr. UNITARIO 2026"): constante por actividad en las 107 filas, sin excepción. La premisa se sostiene.
- **Frecuencia** (`FREC.` por bloque de zona): **varía genuinamente entre zonas en 14 de 107 actividades (13%)**, con cantidades reales no nulas en ambos lados de la comparación (no es un artefacto de redondeo ni de zonas con `CANT.=0`). Ejemplo real, actividad `1.12`:

  | Zona | CANT. | FREC. |
  |---|---|---|
  | PLAZA DE PTO COLOMBIA | 15 | 4 |
  | PLAYA MANGLARES | 15 | 4 |
  | SALGAR PLAYAS DEL COUNTRY 1 | 15 | 6 |
  | SALGAR PLAYAS DE SABANAILLA 2 | 15 | 6 |
  | PLAYAS DE MIRAMAR SECTOR EL FARO | 15 | 6 |
  | PLAYA PUNTA ASTILLEROS | 15 | 4 |

  (Se verificó que el precio unitario verdadero, `PRECIO TOTAL / (CANT. × FREC.)`, sí coincide entre zonas una vez aislada la frecuencia — descarta que sea ruido de cálculo.)

Esto contradice **Regla 18** de `poa-domain.md` ("Cada actividad del POA posee una única frecuencia, independientemente de las zonas donde se ejecute") y el esquema de ADR-0002 (`poa_activities.frecuencia` a nivel de actividad, no de zona).

**Esta pregunta se llevó al dueño del proceso el 2026-07-09 y quedó sin respuesta en la sesión.** No se ha decidido si:
(a) se reabre el esquema (frecuencia pasa a `poa_activity_zones`, y se reescribe la Regla 18), o
(b) se trata como error de captura del Excel 2026 vigente y el importador rechaza cualquier archivo con esta inconsistencia (en cuyo caso el propio archivo real actual no podría importarse hasta corregirse), o
(c) alguna otra resolución que el dueño del proceso determine.

**TC-01 y TC-08 dependen de esta respuesta y quedan marcados como bloqueados hasta resolverla.** El resto de la matriz (TC-02 a TC-07, TC-09, TC-10) es independiente y puede implementarse y probarse ya.

*(Nota aparte, sin impacto en el importador: la columna `PRECIO TOTAL` por zona — que el importador nunca lee, Sección 4 del diseño — tiene errores aritméticos aislados en ~7 actividades, concentrados en la zona "PLAYAS DE MIRAMAR SECTOR EL FARO". Aparenta ser un bug de fórmula del Excel ajeno a esta decisión.)*

---

## Hallazgo adicional — filas de cierre financiero en columna B

Las filas 111-115 de la hoja tienen texto no-código en la columna B (`"TOTAL COSTOS DIRECTOS"`, `"ADMINISTRACION 20%"`, `"IMPREVISTOS 5%"`, `"UTILIDAD 5%"`, `"TOTAL A PAGAR 2024"`) — son totales del formato financiero, no actividades. La validación "columna B no vacía" (Sección 7 del diseño) no basta para excluirlas: aceptaría "TOTAL COSTOS DIRECTOS" como si fuera un código de actividad válido.

**Regla añadida a la Sección 7 del diseño (validación de estructura):** el código de actividad debe coincidir con el patrón `^\d+\.\d+$` (uno o más dígitos, punto, uno o más dígitos — ej. `1.01`, `4.56`). Cualquier fila con columna B no vacía que no cumpla este patrón se considera fin de los datos de actividad y se descarta silenciosamente (no es un error, es una fila de cierre esperada), nunca se cuenta como actividad ni dispara una validación de "unidad vacía". Esto se refleja en TC-06.

---

## Conteos reales de referencia (archivo actual, para anclar TC-01)

- Filas totales de la hoja: 121 (3 de encabezado + 107 de actividad + 5 de cierre financiero + 6 vacías al final).
- Actividades reales (código `N.NN` válido): **107**.
- Zonas detectadas: **9**.
- Filas `poa_activity_zones` esperadas (combinación actividad×zona con `CANT. > 0`): **223**.
- Nombre real de la hoja (con espacio final incluido): `"POA INICIAL 2026 "` — el importador debe hacer `trim()` al buscarla por nombre, no comparar con `===` literal.

---

## Matriz de casos

| ID | Escenario | Archivo de entrada | Precondición | Resultado esperado |
|---|---|---|---|---|
| **TC-01** | Importación completamente válida | El Excel real (`POA 2026 V.02 Ene.26-2026.xlsx`), hoja `POA INICIAL 2026` | Las 9 zonas ya tienen mapeo resuelto en `poa_zone_mappings` para el `poa_id` de prueba (ADR-0004, paso 4 del flujo satisfecho) | **BLOQUEADO** por la pregunta de frecuencia (ver arriba). Una vez resuelta: se crea 1 `poa_version` nueva (`status='active'`, la anterior si existe pasa a inactiva); exactamente 107 `poa_activities`; exactamente 223 `poa_activity_zones`; transacción confirmada (commit) |
| **TC-02** | Existe una zona del Excel sin mapeo | Copia del Excel real con una zona (fila 2) renombrada a un texto sin fila correspondiente en `poa_zone_mappings` para ese `poa_id` (ej. `"ZONA NUEVA SIN MAPEAR"`) | Ninguna — es precisamente la ausencia de mapeo lo que se prueba | Se aborta toda la importación en el paso 4 del flujo (Sección 6). No se crea ninguna `poa_version`. El error identifica el nombre exacto de la zona sin mapeo. `SELECT COUNT(*) FROM poa_activities WHERE poa_version_id = <intento>` = 0 |
| **TC-03** | `activity_key` inexistente en el catálogo técnico | Copia del Excel real con una fila cuyo código de columna B (ej. `"9.99"`) no existe en `board_activity_standards` | Las 9 zonas ya mapeadas (para aislar el error al catálogo, no a zonas) | Error explícito que cita el código contractual faltante (`"9.99"`) y la fila del Excel; se revierte toda la transacción — ninguna `poa_version` ni `poa_activities` parcial queda persistida |
| **TC-04** | Duplicado de zona (violación de unicidad) | No es un archivo Excel — es un intento de insertar manualmente en `poa_zone_mappings` un segundo `(poa_id, excel_zone_name)` ya existente | Ya existe un mapeo para `(poa_id='X', excel_zone_name='PLAZA DE PTO COLOMBIA')` | La restricción `UNIQUE(poa_id, excel_zone_name)` rechaza el INSERT con `unique_violation`. **Ya cubierto por Test 2 de `04_poa_zone_mappings.sql` (verificado, PASS)** — no requiere un test nuevo del importador, solo se referencia aquí para que la matriz quede completa |
| **TC-05** | Reimportación del mismo POA (mismo archivo, sin cambios) | El mismo Excel real, importado una segunda vez sobre el mismo `poa_id` | Ya existe una `poa_version` activa creada por una importación anterior con el mismo contenido | Por Regla 1 de `poa-domain.md` ("ninguna versión existente podrá editarse... toda modificación contractual generará una nueva versión"), **se crea una nueva `poa_version`** (ej. v2), idéntica en contenido a la v1, que pasa a ser la activa; v1 permanece intacta e inactiva. No existe deduplicación por contenido — no está documentada en ningún ADR y no debe inventarse ahora. Esto es válido incluso si el contenido es byte-idéntico |
| **TC-06** | El Excel contiene filas vacías o de cierre financiero | El Excel real tal cual — filas 111-115 (cierre financiero) y 116-121 (vacías) | Las 9 zonas mapeadas | Ambos grupos de filas se ignoran silenciosamente vía el patrón `^\d+\.\d+$` en columna B (ver "Hallazgo adicional" arriba) y la detección de fila totalmente vacía. No generan `poa_activities`, no disparan error de "unidad vacía" ni ninguna otra validación |
| **TC-07** | Actividad real con un dato requerido vacío | Copia del Excel real con la actividad `1.01` modificada: `UNID` (columna D) vaciada manualmente | Las 9 zonas mapeadas | Error de validación que cita la fila y el código `1.01` con el campo faltante (`UNID`); rollback completo — ninguna fila de esa importación queda persistida, incluidas las 106 actividades restantes que sí eran válidas |
| **TC-08** | Precio/frecuencia no constante entre bloques de zona para una misma actividad | Copia del Excel real con la actividad `2.01` (una sin variación real) modificada para que `FREC.` difiera entre dos zonas | Las 9 zonas mapeadas | **BLOQUEADO** por la misma pregunta abierta de arriba. El comportamiento exacto (rechazar todo el archivo vs. aceptar frecuencia por zona) depende de esa decisión. Documentado aquí para que quede pendiente explícitamente, no implícito |
| **TC-09** | Nombres de zona con diferencias de espacios o mayúsculas | Copia del Excel real con una zona existente re-escrita con espacio final o mayúsculas distintas (ej. `"Plaza de Pto Colombia "` en vez de `"PLAZA DE PTO COLOMBIA"`) | Existe un mapeo para el nombre exacto original (`"PLAZA DE PTO COLOMBIA"`), no para la variante | Por ADR-0004 Regla 1 ("catálogo de zonas independiente del nombre... nunca comparando texto"), la comparación contra `poa_zone_mappings.excel_zone_name` es **literal, sin normalización**. La variante no coincide con ningún mapeo existente → se comporta exactamente como TC-02 (zona sin mapeo, importación abortada). Este test documenta explícitamente que no hay fuzzy-match ni trim automático, coherente con la alternativa descartada en ADR-0004 |
| **TC-10** | Importación exitosa seguida de verificación | Resultado de TC-01 (una vez desbloqueado) | Importación TC-01 ya ejecutada y confirmada | Consulta de verificación: cada una de las 107 `poa_activities` tiene `precio_unitario` igual a "Vr. UNITARIO 2026" de su fila del Excel; cada una de las 223 `poa_activity_zones` tiene `cantidad_contratada` igual a `CANT.` del bloque de zona correspondiente y `group_id` igual al resuelto en `poa_zone_mappings` para esa `excel_zone_name` |

---

## Fixtures necesarias (a crear cuando se implemente el parser, no antes)

Los casos TC-02, TC-03, TC-07, TC-08 y TC-09 requieren copias deliberadamente modificadas del Excel real, no el archivo original. Cada una se genera programáticamente a partir de `POA 2026 V.02 Ene.26-2026.xlsx` (una sola celda alterada por fixture) para evitar mantener 5 archivos binarios grandes casi idénticos en el repo — se documenta aquí la transformación exacta, no el binario.

## Próximo paso

1. Resolver la pregunta bloqueante de frecuencia por zona con el dueño del proceso (TC-01, TC-08).
2. Con esa respuesta, implementar el parser + validaciones de la Sección 7 del diseño, satisfaciendo TC-02 a TC-07, TC-09 y TC-10 primero (no bloqueados).
3. Escribir cada test de esta matriz como test automatizado (pgTAP para las validaciones de datos vía la función `SECURITY DEFINER`; Node/Playwright para el parseo del archivo en sí) antes de dar por cerrado el importador.
