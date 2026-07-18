# Decisión requerida para importar el POA 2026

**RESUELTO (2026-07-18).** El administrador y responsable del proceso respondió las tres preguntas de este documento. Ver `docs/discovery/poa-frequency-per-zone.md` (sección "RESUELTO") para las reglas confirmadas y `docs/adr/ADR-0002-schedule-contractual-source.md` (enmienda 2026-07-18) para la aclaración de rol de la frecuencia. Este documento se conserva como registro de la pregunta original planteada, no se reescribe.

**Para:** dueño del proceso / responsable del contrato (mantiene el POA oficial)
**De:** equipo de desarrollo de Mantenix
**Fecha:** 2026-07-18
**Evidencia completa:** `docs/discovery/poa-frequency-per-zone.md` (análisis fila por fila, con celda exacta del Excel para cada caso)

## Contexto

La importación del POA 2026 al sistema está bloqueada porque existen actividades cuya columna `FREC.` no puede interpretarse de forma unívoca a partir del Excel por sí solo. El importador **no asume ninguna regla contractual que no esté definida** — cuando encuentra una ambigüedad de este tipo, se detiene y la reporta en vez de adivinar. Necesitamos que usted resuelva esas tres ambigüedades para poder continuar.

**Esto no es un error del software.** El sistema está haciendo exactamente lo que debe hacer: negarse a inventar una regla contractual que no le corresponde decidir. La pregunta no es "¿el importador funciona?" — es "¿cuál es la regla real del contrato en estos casos?".

## Grupo A — Oxigenación de playas

**Actividades:** `1.12` (Retiro y disposición final de material orgánico y/o troncos de madera en playas), `1.13` (Retiro y disposición final de material inorgánico y/o otros tipos de residuo), `1.15` (Suministro y disposición de equipos y personal especializado para limpieza y oxigenación mecánica).

Estas 3 actividades tienen un valor de `FREC.` distinto según la zona (por ejemplo, `1.12` varía entre 4 y 6 pasadas según la playa). La hipótesis que manejamos: la columna `FREC.` en estos casos representa el **número de pasadas de la máquina** requeridas en esa zona — un parámetro de intensidad de ejecución, no la periodicidad contractual de la actividad.

**Confirmar si esta interpretación es correcta:**

- [ ] Sí, `FREC.` = número de pasadas de máquina (parámetro de ejecución, no periodicidad contractual).
- [ ] No. Explicar qué representa realmente ese valor para estas 3 actividades.

## Grupo B — Mantenimiento de Zonas Verdes

**Actividades:** `2.04`, `2.05`, `2.06`, `2.07`, `2.08`, `2.09`, `2.10`, `2.11`, `2.14`.

Estas 9 actividades también tienen `FREC.` distinta entre zonas, pero la unidad de medida contratada (`M2-MES` / `UND-MES`, con sufijo mensual explícito) descarta la hipótesis de "pasadas" — la periodicidad ya está incorporada en la unidad, así que `FREC.` tendría que significar otra cosa.

**Pregunta:** ¿cuál es la regla contractual cuando una misma actividad tiene una frecuencia distinta según la zona donde se ejecuta?

*(La respuesta debe ser una regla general aplicable al contrato, no una excepción puntual para este archivo — el sistema aplicará esa regla en cada versión futura del POA, no solo en esta.)*

## Grupo D

**Actividad:** `3.1` — Mantenimiento preventivo tipo A de bombas centrífugas.

Presenta el mismo problema de interpretación que el Grupo B (misma pregunta aplica). Además, tiene un problema aparte, de dato, no de interpretación: en la zona **Mercado La Sazón** la celda `FREC.` está **vacía** (`CANT.=5`, sin frecuencia).

Se requiere:
1. La misma regla contractual del Grupo B, aplicada a esta actividad.
2. Completar el valor faltante de `FREC.` para Mercado La Sazón en el Excel.

## Impacto de no responder

Mientras estas tres decisiones no estén definidas, el sistema **no puede importar el POA 2026** — ni siquiera parcialmente. La validación rechaza el archivo completo (no solo estas actividades) para evitar cargar información contractual incompleta o interpretada por el sistema en lugar del dueño del contrato.

## Qué pasa después de su respuesta

Una vez recibida la decisión, el equipo de desarrollo:
1. Documenta la regla en `docs/discovery/poa-frequency-per-zone.md` (o el ADR que la reemplace, si aplica).
2. Actualiza el validador del importador para reflejarla.
3. Agrega una prueba automatizada que congele la regla, para que nunca vuelva a depender de interpretación implícita.
4. Importa el POA 2026 completo al sistema.
