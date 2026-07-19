# Decisión requerida: rendimiento técnico para 31 actividades contratadas del POA 2026

**Para:** administrador y responsable del proceso (dueño del contrato)
**De:** equipo de desarrollo de Mantenix
**Fecha:** 2026-07-18 (revisado dos veces el mismo día — ver "Revisión" y "Revisión 2" al final)
**Evidencia completa:** `docs/discovery/poa-activity-equivalences.md` (19 actividades ya confirmadas con evidencia real), `docs/adr/ADR-0008-board-activity-standards-origin.md` (reglas de construcción del catálogo), `docs/architecture/poa-technical-catalog-decoupling.md` (separación Contrato/Configuración técnica)

## Contexto

El POA 2026 completo **ya se puede importar sobre Tablero Principal** — la importación no depende de `board_activity_standards` (ver "Revisión 2"). Lo que sigue pendiente es poder **generar el Cronograma** (planificación semanal de jornales) para 31 de las actividades contratadas, porque `board_activity_standards` (el catálogo técnico — código, nombre, unidad y **rendimiento** de cada actividad) solo tiene 19 de las 50 actividades **contratadas** esta versión. Las 19 ya confirmadas se construyeron con evidencia real: se cruzaron contra el historial operativo del propio Tablero Principal (177 registros de ejecución del sistema anterior) y se verificaron por cantidad ejecutada antes de aceptar cada una — ninguna se inventó.

Para las 31 restantes **no existe ese historial operativo.** No se asumió esto — se verificó explícitamente dos veces: primero comparando por nombre y por cantidad contra los 177 registros del sistema anterior (mismo método que las 19 ya confirmadas), y después comparando exhaustivamente las 31 contra los mismos 177 registros, código por código. Resultado: ninguna tiene una coincidencia real utilizable. Solo 3 (`2.2`, `2.21`, `2.22` — variantes "muro vertical" de actividades ya confirmadas) tienen una coincidencia de texto fuerte, pero corresponden a una condición física distinta (superficie vertical vs. nivel de suelo) que no se puede asumir equivalente sin confirmación — se incluyen con el rendimiento de referencia horizontal como contexto, no como respuesta. Ninguna de las 31 tiene un rendimiento real del cual partir. El sistema no puede inventar un número — necesita el valor real de quien opera el contrato.

**Esto no es un error del software.** El sistema se niega a construir el catálogo técnico con rendimientos supuestos, igual que antes se negó a inventar una regla de frecuencia. La pregunta no es "¿por qué el importador no deja pasar el archivo?" — es "¿cuál es el rendimiento real de estas 31 actividades?".

**La investigación técnica se considera concluida.** El bloqueo restante corresponde exclusivamente a la ausencia de rendimientos operativos validados para las actividades indicadas — no hay ninguna pieza técnica adicional por resolver antes de continuar.

## Las 31 actividades contratadas sin rendimiento

Todas **sí tienen cantidad contratada** en al menos una zona esta versión — el POA ya importa con ellas incluidas (sin rendimiento), pero bloquean directamente la generación de la planificación semanal (Cronograma) para esas 31.

| Código | Descripción | Unidad |
|---|---|---|
| `1.03` | PERSONAL ADICIONAL PARA EVENTOS Y/O TEMPORADAS... INCLUYE ALIMENTACIÓN, TRANSPORTES, DOTACIÓN Y TODOS LOS ELEMENTOS NECESARIOS PARA LA PRESTACIÓN DEL SERVICIO | jr |
| `1.04` | VACIADO DE PAPELERA Y PUNTO Y DISPOSICIÓN DE ACOPIO | UND |
| `1.05` | MOVIMIENTO DE TIERRA | M3 |
| `1.06` | CONFORMACION DE TIERRA | M3 |
| `1.07` | EXCAVACIÓN MECANICA  EN TERRENO NATURAL SIN RETIRO | M3 |
| `1.08` | EXCAVACIÓN MANUAL EN TERRENO NATURAL SIN RETIRO | M3 |
| `1.12` | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL ORGÁNICO Y/O TRONCOS DE MADERA EN PLAYAS.( INC. LA GESTIÓN FINAL DEL USUARIO) | M3 |
| `1.13` | RETIRO Y DISPOSICIÓN FINAL DE MATERIAL INORGÁNICO Y/O OTROS TIPOS DE RESIDUO (INC. LA GESTIÓN FINAL DEL USUARIO) | M3 |
| `2.02` | CONTROL DE MALEZAS MECANICA DE GRAMA, INCLUYE TODAS LAS HERRAMIENTAS Y EQUIPOS NECESARIOS PARA LA CORRECTA EJECUCIÓN DE LA ACTIVIDAD | M2-MES |
| `2.03` | CONTROL DE MALEZAS MECANICA DE ARBOLES Y PALMAS, INCLUYE TODAS LAS HERRAMIENTAS Y EQUIPOS NECESARIOS PARA LA CORRECTA EJECUCIÓN DE LA ACTIVIDAD | UND-MES |
| `2.04` | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUIMICO DE GRAMA, INCLUYE TODOS LOS INSUMOS, HERRAMIENTAS Y EQUIPOS PARA EL CORRECTO CONTROL Y EJECUCIÓN DE LA ACTIVIDAD. | M2-MES |
| `2.05` | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUIMICO DE ARBOLES, INCLUYE TODOS LOS INSUMOS, HERRAMIENTAS Y EQUIPOS PARA EL CORRECTO CONTROL Y EJECUCIÓN DE LA ACTIVIDAD. | UND-MES |
| `2.15` | SUMINISTRO DE INSUMOS Y PERSONAL PARA BORDEADA DE GRAMA, INCLUYE LOS EQUIPOS NECESARIOS PARA LA CORRECTA EJECUCIÓN DE LA ACTIVIDAD. | ML-MES |
| `2.16` | APLICACIÓN DE AGUA MEDIANTE PUNTO DE AGUA CON MANGUERA EN ZONAS VERDES, INCLUYE LOS EQUIPOS NECESARIOS PARA LA CORRECTA EJECUCIÓN DE LA ACTIVIDAD. | M2-MES |
| `2.17` | AGUA EN CARRO TANQUE PARA RIEGO | VJE |
| `2.18` | SUMINISTRO DE INSUMOS Y PERSONAL ASEO Y LIMPIEZA DE ZONAS VERDES, INCLUYE TODOS LOS INSUMOS, HERRAMIENTAS Y EQUIPOS PARA LA CORRECTA EJECUCIÓN DE LA ACTIVIDAD. | M2-MES |
| `2.19` | CONTROL DE MALEZAS MECANICA DE ARBUSTOS Y CUBRESUELOS MURO VERTICAL, INCLUYE TODAS LAS HERRAMIENTAS Y EQUIPOS NECESARIOS PARA LA CORRECTA EJECUCIÓN DE LA ACTIVIDAD. | M2-MES |
| `2.2` | SUMINISTRO DE INSUMOS Y PERSONAL PARA PODA TECNICA Y FORMATIVA DE ARBUSTOS Y CUBRESUELOS MURO VERTICAL, INCLUYE TODOS LOS INSUMOS, HERRAMIENTAS Y EQUIPOS PARA EL CORRECTO CONTROL Y EJECUCIÓN DE LA ACTIVIDAD. | M2-MES |
| `2.21` | SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN CONTROL FITOSANITARIO PARA ARBUSTOS Y CUBRESUELOS MURO VERTICAL, INCLUYE TODOS LOS INSUMOS, HERRAMIENTAS Y EQUIPOS PARA EL CORRECTO CONTROL Y EJECUCIÓN DE LA ACTIVIDAD. | M2-MES |
| `2.22` | SUMINISTRO Y APLICACIÓN DE FERTILIZANTES PARA ARBUSTOS Y CUBRESUELOS MURO VERTICAL, FERTILIZACIÓN DE SISTESIS ORGANICA, , INCLUYE TODOS LOS INSUMOS, HERRAMIENTAS Y EQUIPOS PARA EL CORRECTO CONTROL Y EJECUCIÓN DE LA ACTIVIDAD. | M2-MES |
| `3.01` | SUMINISTRO DE INSUMOS  Y PULIDA DE BARANDAS Y ELEMENTOS EN ACERO INOXIDABLE, INCLUYE REMOCIÓN DE PINTURAS, ESMALTES, CHICLES Y DEMAS ELEMENTOS QUE NO HAGAN PARTE DE SU FUNCIONALIDAD. | ML-MES |
| `3.02` | CONTROL DE MALEZAS MECANICO DE ZONAS DURAS, INCLUYE TODAS LAS HERRAMIENTAS Y EQUIPOS NECESARIOS PARA LA CORRECTA EJECUCIÓN DE LA ACTIVIDAD | M2-MES |
| `3.05` | SUMINISTRO Y APLICACIÓN DE HERBICIDAS PARA CONTROL DE MALEZAS QUIMICO DE ZONAS DURAS | M2-MES |
| `3.07` | SUMINISTRO DE INSUMOS Y PERSONAL ASEO Y LIMPIEZA DE UNIDAD SANITARIA DE BAÑO, INCLUYE TODOS LOS INSUMOS, HERRAMIENTAS Y EQUIPOS PARA LA CORRECTA EJECUCIÓN DE LA ACTIVIDAD. | UND.SANITARIA-MES |
| `3.08` | SUMINISTRO DE INSUMOS  PARA LIMPIEZA DE BARANDAS Y ELEMENTOS EN PVC, INCLUYE REMOCIÓN DE PINTURAS, ESMALTES, CHICLES Y DEMAS ELEMENTOS QUE NO HAGAN PARTE DE SU FUNCIONALIDAD. | ML-MES |
| `3.09` | SUMINISTRO DE INSUMOS Y PERSONAL PARA ASEO, LIMPIEZA Y MANTENIMIENTO PREVENTIVO SIN SUMNISTRO DE REPUESTOS DE ESCALERA ELECTRICA. INCLUYE ACTIVIDADES DE INSPECCIÓN, AJUSTE Y LUBRICACIÓN PERIODICA DE ELEMENTOS Y ARTES PROPIAS DEL EQUIPO | UND-MES |
| `3.1` | MANTENIMIENTO PREVENTIVO TIPO A DE BOMBAS CENTRIFUGAS  PARA SUMINISTRO DE AGUA POTABLE Y CRUDA PARA BAÑOS, FUENTE DE AGUA,SISTEMA DE RIEGO, ACHIQUE, FILTRADO Y REDES CONTRA INCENDIO. INCLUYE: MATERIALES E INSUMOS PARA CALIBRACIÓN DE TANQUES HIDROFLOW,AJUSTE DE PRESOSTATO PARA PRUEBA DE OPERACIÓN DE NIVELES Y CALIBRACIÓN DE PRESIONES DE TRABAJO, INSPECCIÓN DE CHEQUES DE RETENCIÓN, REVISIÓN Y CAMBIO DE SELLOS MECANICOS, REVISIÓN Y CAMBIO DE RODAMIENTOS, REVISIÓN DE TABLEROS DE CONTROL, REVISIÓN DE BOMBINAS Y TODOS LOS ELEMENTOS NECESARIOS PARA CORRECTA EJECUCIÓN | UND |
| `3.11` | SUMINISTRO DE INSUMOS Y PERSONAL PARA ASEO Y LIMPIEZA PERIODICA DE FUENTE DE AGUA, ASI COMO DEL TRATAMIENTO QUIMICO PARA DESINFECCIÓN DEL AGUA | M2 |
| `3.12` | SUMINISTRO DE PERSONAL E INSUMOS PARA MANTENIMIENTO PREVENTIVO Y CORRECTIVO DE SISTEMA DE AGUA CONDENSADA , INCLUYE LIMPIZA DE FILTROS, CAMBIO DE AGUA DE ESTANQUE, TRATAMIENTO AGUA, ENGRASE PARTES RODANTES, LIMPIEZA PARTES ELECTRICAS, BALANCEO Y NIVELADO DE AGUA. | UND |
| `3.13` | SUMINISTRO DE INSUMOS Y PERSONAL PARA ASEO,  LIMPIEZA Y ORGANIZACIÓN DIARIA DE MUEBLES, MESAS Y SILLAS EN ZONAS COMUNES.   INCLUYE TODOS LOS INSUMOS, HERRAMIENTAS Y EQUIPOS PARA LA CORRECTA EJECUCIÓN DE LA ACTIVIDAD. | M2 |
| `3.14` | SUMINISTRO DE PERSONAL E INSUMOS PARA MANTENIMIENTO PREVENTIVO DE PLANTA ELÉCTRICA GH619CSX POWER, INCLUYE CAMBIO DE ACEITE Y FILTROS | Und |

**Para cada una, indicar el rendimiento esperado** (unidades por jornal, según la unidad de la tabla).

**Nota de contexto para `2.2`, `2.21`, `2.22` (variantes "muro vertical"):** el cronograma operativo ya tiene un rendimiento confirmado para la misma familia de actividad a nivel de suelo — poda de arbustos: 1200 UN/jornal; fungicidas/insecticidas arbustos: 2000 M2/jornal; fertilizantes arbustos: 2500 M2/jornal. Se comparte como referencia únicamente — trabajar en muro vertical es una condición física distinta (más lenta, más difícil de alcanzar) y no se asume que el rendimiento sea el mismo. Indicar el valor real para la variante vertical, no confirmar el de suelo.

## Impacto de no responder

Mientras estas 31 no estén completas, el Cronograma (planificación semanal de jornales) no puede generarse para esas actividades — el sistema lo bloquea explícitamente, mostrando cuáles faltan, en vez de generar una semana incompleta en silencio. El resto del ciclo (importar el POA, ver el contrato completo) no depende de esto.

## Qué pasa después de la respuesta

1. Se puebla `board_activity_standards` con los rendimientos confirmados, mismo proceso auditable que las 19 ya cargadas (`source` distinto, trazable a esta solicitud) — sin necesidad de volver a importar el POA.
2. Se genera el Cronograma (`weekly_plans`) para las 31 actividades y se valida el ciclo operativo completo con datos reales.

## Revisión (2026-07-18, mismo día): las 57 actividades no contratadas ya NO forman parte de esta solicitud

La versión original de este documento pedía rendimiento para 88 actividades (31 contratadas + 57 sin cantidad contratada esta versión, principalmente `4.xx` — obra puntual de siembra/jardinería). Se revisó esa premisa antes de enviarla: `board_activity_standards` alimenta el motor de **jornales recurrentes** para planificación semanal — una actividad sin cantidad contratada esta versión (56 de las 57 son siembra puntual, no mantenimiento periódico; la única excepción, `1.02`, es logística de eventos, pero tampoco está contratada esta versión) no se va a programar, así que no tiene sentido exigir su rendimiento antes de tiempo.

Se corrigió el validador (`src/lib/poaImport/validate.ts`) para que una actividad sin cantidad contratada no necesite existir en `board_activity_standards` — verificado con 310/310 pruebas en verde y una prueba nueva que congela la regla. El bloqueo real de la importación se redujo de 88 a **31** actividades — verificado directamente contra el estado real de Tablero Principal, no solo en teoría.

Si una versión futura del POA llega a contratar alguna de esas 57 actividades, su rendimiento se pedirá entonces — no antes.

## Revisión 2 (2026-07-18): el POA ya importa completo, aunque falten estas 31

El usuario observó, correctamente, que el sistema estaba mezclando dos preguntas distintas bajo un solo bloqueo: "¿qué contrató el cliente esta versión?" (fase contractual) y "¿puedo programar jornales para eso?" (fase técnica). El rendimiento no es un requisito para que el POA exista — es un requisito para ejecutar el algoritmo de planificación semanal.

Se separaron ambas fases (`docs/architecture/poa-technical-catalog-decoupling.md`): el importador de POA ya no consulta `board_activity_standards` en absoluto — depende únicamente del POA, las zonas, la versión y las reglas de negocio propias del dominio del POA. `poa_activities` pasó a ser autocontenido (agrega `description`/`unit`, ya no depende del Excel original para mostrar un nombre). Se creó `get_missing_board_activity_standards()`, fuente única de verdad para "¿qué actividades contratadas no tienen catálogo técnico todavía?", consumida por el Cronograma para bloquear explícitamente (nunca genera un plan parcial que omita trabajo en silencio) y por la pantalla de importación (contador informativo).

**Verificado de punta a punta contra la base real y en el navegador** (no solo en teoría): un POA con una actividad contratada sin `board_activity_standards` importa con éxito; el Cronograma de esa zona muestra "No es posible generar el cronograma" listando exactamente esa actividad; al completar el catálogo técnico (sin volver a importar el POA), el Cronograma vuelve a generarse con normalidad.

**Consecuencia práctica para esta solicitud:** las 31 actividades de abajo ya no bloquean nada del lado del contrato — el POA 2026 completo puede importarse hoy mismo sobre Tablero Principal. Lo único pendiente es la respuesta de rendimientos, para poder generar el Cronograma de esas 31.
