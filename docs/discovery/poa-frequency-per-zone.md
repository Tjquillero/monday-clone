# Descubrimiento: ¿La frecuencia contractual es por actividad o por actividad×zona?

**Esto no es un ADR.** Es evidencia de investigación sobre una decisión que depende del dueño del proceso (quien mantiene el POA oficial), no de una elección técnica. Se convertirá en un ADR que modifique `poa-domain.md` (Regla 18) únicamente cuando esa decisión exista.

**Actualización (2026-07-11):** [`ADR-0005`](../adr/ADR-0005-poa-frecuencia-ausente.md) resolvió el subconjunto de este discovery donde `FREC.` está **completamente vacío** para una actividad (`3.14`) — se persiste `frecuencia = null`, sin bloquear. La pregunta de fondo de este documento (actividades con `FREC.` real que no concuerda entre zonas — el Grupo A/B/C/D de abajo, más `3.1`, que combina un valor vacío con valores reales que tampoco concuerdan entre sí) **sigue abierta**. Este documento no se reescribe; el resto de su contenido conserva su valor como evidencia de investigación original.

## Fecha
2026-07-09

## Contexto
Al diseñar el importador del Excel del POA ([`poa-excel-import-design.md`](../architecture/poa-excel-import-design.md)), la Sección 2 verificó — con una sola actividad de muestra (`1.01`, tres zonas) — que precio unitario y frecuencia son constantes por actividad, independientemente de la zona. Esa verificación puntual coincide exactamente con lo que ya documenta `poa-domain.md`:

> **Regla 18 — Inmutabilidad de la Frecuencia:** La frecuencia contractual definida para una Actividad del POA permanecerá inalterable durante toda la vigencia de la versión correspondiente.
> **Glosario — Frecuencia:** *"Cada actividad del POA posee una única frecuencia, independientemente de las zonas donde se ejecute."*

Antes de construir el importador, se amplió esa verificación a **las 112 actividades reales** del archivo `POA 2026 V.02 Ene.26-2026.xlsx` (hoja `POA INICIAL 2026`), no solo la muestra.

## Hallazgo
- **Precio unitario** ("Vr. UNITARIO 2026"): constante por actividad en las 112 filas, sin excepción. La regla se sostiene sin ajuste.
- **Frecuencia** (`FREC.` por bloque de zona): **varía entre zonas en 14 de las 112 actividades (12.5%)**, con cantidades reales no nulas a ambos lados de la comparación — no es un artefacto de zonas sin ejecución ni ruido de redondeo. Se verificó además que el precio unitario verdadero (`PRECIO TOTAL / (CANT. × FREC.)`) sí coincide entre zonas una vez aislada la frecuencia, lo que descarta que sea un error de cálculo cruzado.

## Listado completo — las 14 actividades, fila por fila

La columna "Celda" identifica la celda exacta de `FREC.` en la hoja `POA INICIAL 2026` (fila real del Excel), para que pueda auditarse directamente en el archivo sin depender de este documento. Solo se listan zonas donde la actividad tiene cantidad contratada real (`CANT. > 0`); zonas donde la actividad no aplica se omiten.

| Código | Descripción | Zona | Cant. | Frec. | Celda |
|---|---|---|---|---|---|
| 1.12 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL ORGÁNICO Y/O TRONCOS DE MADERA EN PLAYAS | PLAZA DE PTO COLOMBIA | 15 | 4 | J15 |
| 1.12 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL ORGÁNICO Y/O TRONCOS DE MADERA EN PLAYAS | PLAYA MANGLARES | 15 | 4 | AN15 |
| 1.12 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL ORGÁNICO Y/O TRONCOS DE MADERA EN PLAYAS | SALGAR PLAYAS DEL COUNTRY 1 | 15 | 6 | BR15 |
| 1.12 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL ORGÁNICO Y/O TRONCOS DE MADERA EN PLAYAS | SALGAR PLAYAS DE SABANAILLA 2 | 15 | 6 | CV15 |
| 1.12 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL ORGÁNICO Y/O TRONCOS DE MADERA EN PLAYAS | PLAYAS DE MIRAMAR SECTOR EL FARO | 15 | 6 | DZ15 |
| 1.12 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL ORGÁNICO Y/O TRONCOS DE MADERA EN PLAYAS | PLAYA PUNTA ASTILLEROS | 15 | 4 | KX15 |
| 1.13 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL INORGÁNICO Y/O OTROS TIPOS DE RESIDUO | PLAZA DE PTO COLOMBIA | 15 | 2 | J16 |
| 1.13 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL INORGÁNICO Y/O OTROS TIPOS DE RESIDUO | PLAYA MANGLARES | 15 | 2 | AN16 |
| 1.13 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL INORGÁNICO Y/O OTROS TIPOS DE RESIDUO | SALGAR PLAYAS DEL COUNTRY 1 | 15 | 4 | BR16 |
| 1.13 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL INORGÁNICO Y/O OTROS TIPOS DE RESIDUO | SALGAR PLAYAS DE SABANAILLA 2 | 15 | 4 | CV16 |
| 1.13 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL INORGÁNICO Y/O OTROS TIPOS DE RESIDUO | PLAYAS DE MIRAMAR SECTOR EL FARO | 15 | 4 | DZ16 |
| 1.13 | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL INORGÁNICO Y/O OTROS TIPOS DE RESIDUO | PLAYA PUNTA ASTILLEROS | 15 | 1 | KX16 |
| 1.15 | SUMINISTRO Y DISPOSICIÓN DE EQUIPOS Y PERSONAL ESPECIALIZADO PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA | PLAZA DE PTO COLOMBIA | 7267 | 4 | J18 |
| 1.15 | SUMINISTRO Y DISPOSICIÓN DE EQUIPOS Y PERSONAL ESPECIALIZADO PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA | PLAYA MANGLARES | 14090 | 2 | AN18 |
| 1.15 | SUMINISTRO Y DISPOSICIÓN DE EQUIPOS Y PERSONAL ESPECIALIZADO PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA | SALGAR PLAYAS DEL COUNTRY 1 | 19287.4 | 6 | BR18 |
| 1.15 | SUMINISTRO Y DISPOSICIÓN DE EQUIPOS Y PERSONAL ESPECIALIZADO PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA | SALGAR PLAYAS DE SABANAILLA 2 | 18070 | 6 | CV18 |
| 1.15 | SUMINISTRO Y DISPOSICIÓN DE EQUIPOS Y PERSONAL ESPECIALIZADO PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA | PLAYAS DE MIRAMAR SECTOR EL FARO | 60000 | 4 | DZ18 |
| 1.15 | SUMINISTRO Y DISPOSICIÓN DE EQUIPOS Y PERSONAL ESPECIALIZADO PARA LIMPIEZA Y OXIGENACIÓN MECÁNICA | PLAYA PUNTA ASTILLEROS | 21267 | 1 | KX18 |
| 2.04 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE GRAMA | PLAZA DE PTO COLOMBIA | 544.68 | 1 | J22 |
| 2.04 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE GRAMA | PLAYAS DE MIRAMAR SECTOR EL FARO | 830.71 | 1 | DZ22 |
| 2.04 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE GRAMA | CENTRO GASTRONOMICO | 65.99 | 1 | FD22 |
| 2.04 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE GRAMA | MERCADO LA SAZÓN | 262.85 | 0.5 | HL22 |
| 2.04 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE GRAMA | SENDERO SANTA VERÓNICA | 4663 | 1 | IP22 |
| 2.05 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE ÁRBOLES | PLAZA DE PTO COLOMBIA | 225 | 1 | J23 |
| 2.05 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE ÁRBOLES | SALGAR PLAYAS DEL COUNTRY 1 | 111 | 1 | BR23 |
| 2.05 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE ÁRBOLES | SALGAR PLAYAS DE SABANAILLA 2 | 127 | 1 | CV23 |
| 2.05 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE ÁRBOLES | PLAYAS DE MIRAMAR SECTOR EL FARO | 214 | 1 | DZ23 |
| 2.05 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE ÁRBOLES | CENTRO GASTRONOMICO | 111 | 1 | FD23 |
| 2.05 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE ÁRBOLES | MERCADO LA SAZÓN | 21 | 0.5 | HL23 |
| 2.05 | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUÍMICO DE ÁRBOLES | SENDERO SANTA VERÓNICA | 243 | 1 | IP23 |
| 2.06 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ARBUSTOS, CUBRESUELOS | PLAZA DE PTO COLOMBIA | 1850.33 | 1 | J24 |
| 2.06 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ARBUSTOS, CUBRESUELOS | PLAYA MANGLARES | 350 | 1 | AN24 |
| 2.06 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ARBUSTOS, CUBRESUELOS | SALGAR PLAYAS DEL COUNTRY 1 | 2295 | 1 | BR24 |
| 2.06 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ARBUSTOS, CUBRESUELOS | SALGAR PLAYAS DE SABANAILLA 2 | 3636.5 | 1 | CV24 |
| 2.06 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ARBUSTOS, CUBRESUELOS | PLAYAS DE MIRAMAR SECTOR EL FARO | 4931.99 | 1 | DZ24 |
| 2.06 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ARBUSTOS, CUBRESUELOS | CENTRO GASTRONOMICO | 723.53 | 1 | FD24 |
| 2.06 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ARBUSTOS, CUBRESUELOS | MERCADO LA SAZÓN | 235.69 | 0.5 | HL24 |
| 2.06 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ARBUSTOS, CUBRESUELOS | SENDERO SANTA VERÓNICA | 1225 | 1 | IP24 |
| 2.07 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — GRAMA | PLAZA DE PTO COLOMBIA | 544.68 | 1 | J25 |
| 2.07 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — GRAMA | PLAYAS DE MIRAMAR SECTOR EL FARO | 830.71 | 1 | DZ25 |
| 2.07 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — GRAMA | CENTRO GASTRONOMICO | 65.99 | 1 | FD25 |
| 2.07 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — GRAMA | MERCADO LA SAZÓN | 262.85 | 0.5 | HL25 |
| 2.07 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — GRAMA | SENDERO SANTA VERÓNICA | 4663 | 1 | IP25 |
| 2.08 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ÁRBOLES Y PALMAS | PLAZA DE PTO COLOMBIA | 225 | 1 | J26 |
| 2.08 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ÁRBOLES Y PALMAS | SALGAR PLAYAS DEL COUNTRY 1 | 111 | 1 | BR26 |
| 2.08 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ÁRBOLES Y PALMAS | SALGAR PLAYAS DE SABANAILLA 2 | 127 | 1 | CV26 |
| 2.08 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ÁRBOLES Y PALMAS | PLAYAS DE MIRAMAR SECTOR EL FARO | 214 | 1 | DZ26 |
| 2.08 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ÁRBOLES Y PALMAS | CENTRO GASTRONOMICO | 111 | 1 | FD26 |
| 2.08 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ÁRBOLES Y PALMAS | MERCADO LA SAZÓN | 21 | 0.5 | HL26 |
| 2.08 | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS — ÁRBOLES Y PALMAS | SENDERO SANTA VERÓNICA | 243 | 1 | IP26 |
| 2.09 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — ARBUSTOS Y CUBRESUELOS | PLAZA DE PTO COLOMBIA | 1850.33 | 0.333 | J27 |
| 2.09 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — ARBUSTOS Y CUBRESUELOS | PLAYA MANGLARES | 350 | 0.333 | AN27 |
| 2.09 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — ARBUSTOS Y CUBRESUELOS | SALGAR PLAYAS DEL COUNTRY 1 | 2295 | 0.333 | BR27 |
| 2.09 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — ARBUSTOS Y CUBRESUELOS | SALGAR PLAYAS DE SABANAILLA 2 | 3636.5 | 0.333 | CV27 |
| 2.09 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — ARBUSTOS Y CUBRESUELOS | PLAYAS DE MIRAMAR SECTOR EL FARO | 4931.99 | 0.333 | DZ27 |
| 2.09 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — ARBUSTOS Y CUBRESUELOS | CENTRO GASTRONOMICO | 723.53 | 0.333 | FD27 |
| 2.09 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — ARBUSTOS Y CUBRESUELOS | MERCADO LA SAZÓN | 262.85 | 0.33 | HL27 |
| 2.09 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — ARBUSTOS Y CUBRESUELOS | SENDERO SANTA VERÓNICA | 1225 | 0.333 | IP27 |
| 2.10 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — GRAMA | PLAZA DE PTO COLOMBIA | 544.68 | 0.333 | J28 |
| 2.10 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — GRAMA | PLAYAS DE MIRAMAR SECTOR EL FARO | 830.71 | 0.333 | DZ28 |
| 2.10 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — GRAMA | CENTRO GASTRONOMICO | 65.99 | 0.333 | FD28 |
| 2.10 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — GRAMA | MERCADO LA SAZÓN | 262.85 | 0.33 | HL28 |
| 2.10 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — GRAMA | SENDERO SANTA VERÓNICA | 4663 | 0.333 | IP28 |
| 2.11 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — MANEJO NUTRICIONAL ÁRBOLES Y PALMAS | PLAZA DE PTO COLOMBIA | 225 | 0.333 | J29 |
| 2.11 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — MANEJO NUTRICIONAL ÁRBOLES Y PALMAS | SALGAR PLAYAS DEL COUNTRY 1 | 111 | **1** | BR29 |
| 2.11 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — MANEJO NUTRICIONAL ÁRBOLES Y PALMAS | SALGAR PLAYAS DE SABANAILLA 2 | 127 | 0.333 | CV29 |
| 2.11 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — MANEJO NUTRICIONAL ÁRBOLES Y PALMAS | PLAYAS DE MIRAMAR SECTOR EL FARO | 214 | 0.333 | DZ29 |
| 2.11 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — MANEJO NUTRICIONAL ÁRBOLES Y PALMAS | CENTRO GASTRONOMICO | 111 | 0.333 | FD29 |
| 2.11 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — MANEJO NUTRICIONAL ÁRBOLES Y PALMAS | MERCADO LA SAZÓN | 21 | 0.33 | HL29 |
| 2.11 | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES — MANEJO NUTRICIONAL ÁRBOLES Y PALMAS | SENDERO SANTA VERÓNICA | 243 | 0.333 | IP29 |
| 2.14 | SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TÉCNICA Y FORMATIVA DE ÁRBOLES Y PALMAS | PLAZA DE PTO COLOMBIA | 225 | 1 | J32 |
| 2.14 | SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TÉCNICA Y FORMATIVA DE ÁRBOLES Y PALMAS | SALGAR PLAYAS DEL COUNTRY 1 | 111 | 1 | BR32 |
| 2.14 | SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TÉCNICA Y FORMATIVA DE ÁRBOLES Y PALMAS | SALGAR PLAYAS DE SABANAILLA 2 | 127 | 0.5 | CV32 |
| 2.14 | SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TÉCNICA Y FORMATIVA DE ÁRBOLES Y PALMAS | PLAYAS DE MIRAMAR SECTOR EL FARO | 214 | 1 | DZ32 |
| 2.14 | SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TÉCNICA Y FORMATIVA DE ÁRBOLES Y PALMAS | CENTRO GASTRONOMICO | 111 | 1 | FD32 |
| 2.14 | SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TÉCNICA Y FORMATIVA DE ÁRBOLES Y PALMAS | MERCADO LA SAZÓN | 21 | 0.5 | HL32 |
| 2.14 | SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TÉCNICA Y FORMATIVA DE ÁRBOLES Y PALMAS | SENDERO SANTA VERÓNICA | 243 | 1 | IP32 |
| 3.04 | LAVADA A PRESIÓN DE ZONAS DURAS | PLAZA DE PTO COLOMBIA | 17149.86 | 1 | J44 |
| 3.04 | LAVADA A PRESIÓN DE ZONAS DURAS | SALGAR PLAYAS DEL COUNTRY 1 | 3852 | 2 | BR44 |
| 3.04 | LAVADA A PRESIÓN DE ZONAS DURAS | SALGAR PLAYAS DE SABANAILLA 2 | 3555 | 2 | CV44 |
| 3.04 | LAVADA A PRESIÓN DE ZONAS DURAS | PLAYAS DE MIRAMAR SECTOR EL FARO | 12606.94 | 1 | DZ44 |
| 3.04 | LAVADA A PRESIÓN DE ZONAS DURAS | CENTRO GASTRONOMICO | 11717.74 | 1 | FD44 |
| 3.04 | LAVADA A PRESIÓN DE ZONAS DURAS | MERCADO LA SAZÓN | 5498.85 | 1 | HL44 |
| 3.04 | LAVADA A PRESIÓN DE ZONAS DURAS | SENDERO SANTA VERÓNICA | 1881 | 1 | IP44 |
| 3.1 | MANTENIMIENTO PREVENTIVO TIPO A DE BOMBAS CENTRÍFUGAS (agua potable/cruda, riego, achique, redes contra incendio) | PLAZA DE PTO COLOMBIA | 2 | 0.5 | J50 |
| 3.1 | MANTENIMIENTO PREVENTIVO TIPO A DE BOMBAS CENTRÍFUGAS (agua potable/cruda, riego, achique, redes contra incendio) | SALGAR PLAYAS DEL COUNTRY 1 | 4 | 1 | BR50 |
| 3.1 | MANTENIMIENTO PREVENTIVO TIPO A DE BOMBAS CENTRÍFUGAS (agua potable/cruda, riego, achique, redes contra incendio) | SALGAR PLAYAS DE SABANAILLA 2 | 2 | 1 | CV50 |
| 3.1 | MANTENIMIENTO PREVENTIVO TIPO A DE BOMBAS CENTRÍFUGAS (agua potable/cruda, riego, achique, redes contra incendio) | CENTRO GASTRONOMICO | 7 | 1 | FD50 |
| 3.1 | MANTENIMIENTO PREVENTIVO TIPO A DE BOMBAS CENTRÍFUGAS (agua potable/cruda, riego, achique, redes contra incendio) | MERCADO LA SAZÓN | 5 | **(vacío)** | HL50 |

## Por qué esto probablemente no es un error del script

Los Excel con bloques de columnas repetidos por zona son notorios por hacer creer que hay un bug de lectura cuando en realidad el parser leyó la columna equivocada. Antes de concluir nada, se verificó que:

1. Cada columna de zona se localiza por su propia etiqueta (`"(presupuesto mes)"` en la fila de zonas), no por un offset fijo — cada bloque tiene un ancho ligeramente distinto en el archivo real (ver separación irregular de columnas en la tabla de arriba: `J`, `AN`, `BR`, `CV`, `DZ`, `FD`, `HL`, `IP`, `KW`), así que un error de offset produciría columnas sin sentido (texto donde se espera un número, o viceversa), no una tabla de números coherente como la de arriba.
2. El precio unitario verdadero (`PRECIO TOTAL / (CANT. × FREC.)`) coincide exactamente con "Vr. UNITARIO 2026" en cada zona de cada una de estas 14 actividades — si la lectura de `FREC.` estuviera desalineada, este cálculo cruzado también fallaría, y no falla.
3. El patrón tiene una coherencia interna que un error de columna no produciría: el mismo grupo de zonas (Salgar Playas del Country 1 / Salgar Playas de Sabanilla 2 / Miramar Sector El Faro) aparece repetidamente con la frecuencia más alta en actividades no relacionadas entre sí (`1.12`, `1.13`, `3.04`); "Mercado La Sazón" aparece repetidamente con la mitad de frecuencia en cinco actividades distintas de control fitosanitario (`2.04` a `2.08`). Esa repetición cruzada, entre actividades que no comparten fórmula ni fila, es más compatible con una decisión contractual real por zona que con un error aleatorio de digitación o de lectura.

Con esto dicho: **no es una prueba concluyente**, es una observación que reduce la probabilidad de que sea un bug de parsing. La confirmación definitiva solo puede venir de quien mantiene el POA.

## Caso aparte — un hueco de dato, no una variación
La actividad `3.1` en la zona "Mercado La Sazón" tiene `CANT.=5` pero `FREC.` **vacío** (celda `HL50`), no un valor distinto. Esto es un problema de completitud de dato, independiente de la pregunta de fondo: sin importar si la frecuencia termina siendo por actividad o por actividad×zona, esta celda necesita un valor antes de poder importarse.

## Hipótesis alternativa evaluada — `FREC.` como intensidad de ejecución ("pasadas"), no periodicidad contractual

Se propuso una segunda lectura del campo: en actividades mecánicas (ej. oxigenación de playas), `FREC.` no representaría "cuántas veces al mes se ejecuta la actividad" sino "cuántas pasadas de máquina requiere la ejecución en esa zona" — una intensidad operativa, no una periodicidad contractual. Bajo esa lectura, la actividad contractual seguiría siendo una sola; solo cambiaría un parámetro de ejecución, sin contradecir la Regla 18.

**Se verificó esta hipótesis contra las 14 actividades, cruzando categoría (columna A) y unidad de medida (columna D) — no solo la descripción.** El resultado es una partición clara, no un sí/no uniforme:

| Grupo | Actividades | Categoría | Unidad | ¿Es consistente con "pasadas"? |
|---|---|---|---|---|
| A | `1.12`, `1.13`, `1.15` | Mantenimiento de Playas | `M3` / `M2` (sin sufijo mensual) | **Sí, plausible.** Son actividades mecánicas (retiro de material, oxigenación); la unidad no expresa periodicidad mensual, deja espacio para que `FREC.` sea un parámetro de intensidad |
| B | `2.04, 2.05, 2.06, 2.07, 2.08, 2.09, 2.10, 2.11, 2.14` (9 actividades) | Mantenimiento de Zonas Verdes | `M2-MES` / `UND-MES` (sufijo `-MES` explícito) | **No.** La unidad ya expresa "por mes" — la periodicidad está incorporada en la unidad de medida, no es algo adicional que `FREC.` deba aportar. Además `FREC.` toma valores fraccionarios (`1`, `0.5`, `0.333`) que se leen naturalmente como "veces al mes" (mensual/bimensual/trimestral); "0.333 pasadas de máquina" no tiene sentido operativo |
| C | `3.04` | Zona Dura | `M2` (sin sufijo) | Ambiguo — podría ser pasadas (lavado a presión) o periodicidad; la unidad no lo resuelve |
| D | `3.1` | Zona Dura | `UND` | **No.** Es mantenimiento preventivo programado de bombas — se agenda por periodo (mensual/bimensual), no se mide en "pasadas" |

Se contrastó además contra las demás actividades de "Mantenimiento de Zonas Verdes" que **no** aparecen en la lista de las 14 (ej. `2.01`, `2.02`, `2.03`...): todas usan también unidad `-MES`, confirmando que el sufijo mensual es una convención sistemática de esa categoría completa, no una coincidencia de las filas inconsistentes.

**Conclusión de esta verificación: la hipótesis de "pasadas" explica correctamente 3 de las 14 actividades (posiblemente 4, con `3.04` ambiguo), pero no explica las 9-10 restantes**, que son mayoría. No se cierra este discovery como "interpretación incorrecta del Excel" — se acota la pregunta pendiente al subconjunto real.

## Por qué no se resuelve aquí
Para el Grupo A (`1.12`, `1.13`, `1.15`) la hipótesis de intensidad de ejecución es razonable y **no requiere ningún cambio de esquema** — si el dueño del proceso la confirma, esas 3 actividades quedan resueltas sin tocar ADR-0002 ni la Regla 18.

Para el Grupo B (las 9 actividades de Mantenimiento de Zonas Verdes) y el Grupo D (`3.1`), ninguna de las dos hipótesis puede darse por cierta todavía con la evidencia disponible:
- No hay forma de confirmar, solo desde el archivo, que el Excel esté mal capturado.
- Tampoco hay forma de confirmar que el modelo de dominio (`poa-domain.md`, congelado) esté incompleto.

Cambiar el esquema ahora (mover `frecuencia` de `poa_activities` a `poa_activity_zones`) afectaría ADR-0002, la Regla 18, la migración ya implementada y el código que ya asume frecuencia única por actividad — un costo alto para una hipótesis todavía no confirmada. Asumir que el Excel está mal y rechazarlo en el importador tiene el mismo problema en la dirección contraria: descartaría el documento contractual vigente basándose únicamente en el modelo.

## Pregunta abierta (requiere decisión del dueño del proceso)
**Para las actividades del Grupo B (`2.04`–`2.11`, `2.14` — Mantenimiento de Zonas Verdes, unidad `-MES`, `FREC.` fraccionario) y el Grupo D (`3.1`): ¿la frecuencia contractual pertenece a la Actividad del POA, o al par Actividad×Zona?**

El Grupo A (`1.12`, `1.13`, `1.15`) queda fuera de esta pregunta: si el dueño del proceso confirma la lectura de "pasadas/intensidad de ejecución" para esas 3, no hay contradicción con la Regla 18 y no requieren seguimiento adicional aquí — aunque conviene que la confirmación sea explícita, no asumida, ya que "pasadas" tampoco está documentado hoy en `poa-domain.md` como un atributo de la Actividad del POA (no está claro en qué tabla del esquema actual viviría ese parámetro de intensidad si no es `frecuencia`).

La respuesta sobre el Grupo B/D determina si la Regla 18 y el esquema de ADR-0002 se mantienen tal cual, o si se revisan mediante un nuevo ADR. Bloquea TC-01 y TC-08 de [`poa-excel-import-test-matrix.md`](../architecture/poa-excel-import-test-matrix.md) únicamente para esas 10 actividades; el resto de la matriz no depende de esta respuesta y puede avanzar.
