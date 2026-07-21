---
id: INV-0002
fecha: 2026-07-21
dominio: costos
estado: abierto
autor: Claude Code
fuentes:
  - Excel real (COSTOS GENERALES (V2).xlsx, Operaciones)
  - git (commit 2cccc3e)
  - src/lib/schedulerMath.ts
---

# INV-0002 — La fórmula de jornales de un documento operativo real coincide con la que ADR-0009 reemplazó

## Resumen

Al preparar la carga del documento de Resource Analysis al módulo Documentos, se inspeccionó `COSTOS GENERALES (V2).xlsx` (ruta: `OneDrive - CONSORCIO CONSERVACION COSTERA\Operaciones\ARCHIVOS ASISTENTE DE OPERACIONES\CENTROS DE COSTO\`). La columna "CANT JORNALES MES" de ese archivo se calcula con la fórmula exacta que ADR-0009 (2026-07-19, commit `2cccc3e`) determinó que era defectuosa y reemplazó en el Scheduler.

## Pregunta

¿Cuál de las dos fórmulas — la del Scheduler (post ADR-0009) o la del documento operativo real que usa Operaciones — representa la regla de negocio correcta? ¿O están respondiendo preguntas distintas (jornales programados/presupuestados vs. jornales de ejecución/carga semanal) y ambas son válidas en su propio contexto?

## Evidencia

Hoja "PLAZA PUERTO COLOMBIA" de `COSTOS GENERALES (V2).xlsx`, bloque de columnas `ITEM, ACTIVIDAD, UNIDAD, RENDIMIENTO, FRECUENCIA, FACTOR, CANTIDAD, CANT JORNALES MES, V. ACTIVIDAD`:

| Actividad | RENDIMIENTO | FRECUENCIA | FACTOR | CANTIDAD | CANT JORNALES MES (Excel) |
|---|---|---|---|---|---|
| Plateo | 160 | 12.5 | 0.5 | 225 | 2.8125 |
| Poda Arbustos y CS | 1200 | 12.5 | 0.5 | 1850 | 3.0833333333333335 |
| Mtto Cama Siembra | 600 | 6.25 | 0.25 | 2620 | 17.466666666666665 |
| Limpieza zonas duras | 10000 | 1 | 0.04 | 17150 | 42.875 |

En las 4 filas verificadas, `FACTOR = FRECUENCIA / 25` exactamente, y `CANT JORNALES MES = (CANTIDAD / RENDIMIENTO) / FACTOR = CANTIDAD × 25 / (RENDIMIENTO × FRECUENCIA)`.

Esta estructura de columnas (RENDIMIENTO/FRECUENCIA/FACTOR/CANTIDAD/CANT JORNALES MES) se repite en las hojas de los demás sitios del mismo archivo (Playa Manglares, Centro Gastronómico, Mercado La Sazón, Playa Miramar, Country 1, Country 2, Salinas del Rey, Santa Verónica) — no verificado fila por fila en todas, pero la presencia de la columna "CANT JORNALES MES" es consistente en las 9 hojas.

## Consultas realizadas

- Lectura directa del Excel con la librería `xlsx` (misma que usa `src/lib/poaImport/parseExcel.ts`), sin transformación — valores tal como están en el archivo.
- `git log --oneline -- src/lib/schedulerMath.ts` y `git show 2cccc3e -- src/lib/schedulerMath.ts` para confirmar la fórmula exacta que existía antes de ADR-0009.

Fórmula anterior del Scheduler (commit `2cccc3e`, diff, código retirado):
```ts
return qty / (rendimiento * (frecuencia / workingDays)); // workingDays = 25 por defecto
```
Equivalente a `qty × 25 / (rendimiento × frecuencia)` — algebraicamente idéntica a la fórmula observada en el Excel.

Fórmula actual del Scheduler (post ADR-0009):
```ts
return qty / rendimiento;
```

## Hallazgos

- La coincidencia no es de una sola fila: se cumple exactamente en las 4 filas verificadas, con `RENDIMIENTO`, `FRECUENCIA` y `CANTIDAD` distintos en cada una — esto hace muy improbable que sea casualidad.
- El bloque de columnas incluye también `V. ACTIVIDAD` (valor/costo de la actividad) inmediatamente después de `CANT JORNALES MES`, sugiriendo que ese número alimenta un presupuesto de mano de obra mensual — mismo propósito general que `theoretical_journals_month` en el Scheduler (que alimenta el Dashboard de Costos Operativos). Esto es una observación, no una conclusión — no se descarta que "jornales para presupuestar el mes" y "jornales para programar la semana" sean preguntas distintas que coincidan en nombre pero no en intención.
- Redacción correcta del hallazgo (no la que se usó inicialmente en conversación, que trataba la fórmula vieja como un hecho ya cerrado): **ADR-0009 sustituyó la fórmula que usaba el motor por otra distinta a la que usa el documento operativo vigente. Falta verificar con Operaciones cuál de las dos representa la regla de negocio correcta** — "la fórmula vieja inflaba los jornales 25x" era la conclusión técnica de ADR-0009 en su momento, pero deja de poder tratarse como un hecho cerrado ahora que existe un documento oficial que usa esa misma fórmula.

## Nivel de confianza

- **Alta** — que el Excel real calcula `CANT JORNALES MES` con la fórmula `cantidad × 25 / (rendimiento × frecuencia)`: verificado algebraicamente en 4 filas con valores distintos, coincide exacto en las 4.
- **Alta** — que esa es *algebraicamente* la misma fórmula que existía en `schedulerMath.ts` antes del commit `2cccc3e`: confirmado leyendo el diff real del commit.
- **Baja** — cuál de las dos fórmulas (o si ambas, para preguntas distintas) representa la regla de negocio correcta. Sin evidencia todavía para resolver esto — requiere confirmación de Operaciones, no más lectura de código.

## Conclusión

No hay conclusión todavía — ver "Próximos pasos". Explícitamente NO se concluye que ADR-0009 esté mal, ni que el Excel esté mal.

## Estado

Abierto

## Próximos pasos

- Preguntar a Operaciones qué representa exactamente "CANT JORNALES MES" en `COSTOS GENERALES (V2).xlsx`: ¿jornales de ejecución real (comparable a lo que calcula el Scheduler), o un presupuesto/proyección mensual con un propósito distinto (ej. dimensionar cuadrillas, no programar semanas)?
- Si son la misma pregunta de negocio: decidir si ADR-0009 debe revertirse, o si el Excel operativo (y sus decisiones derivadas, ej. dimensionamiento de personal) necesita corregirse.
- Si son preguntas distintas: documentar explícitamente la diferencia (en ADR-0009 o en un ADR nuevo) para que nadie vuelva a asumir que son intercambiables.
- **No importar `COSTOS GENERALES (V2).xlsx` a `resource_analysis` hasta resolver esto** — poblar la tabla ahora arriesgaría cargar valores cuya interpretación todavía no está cerrada.
