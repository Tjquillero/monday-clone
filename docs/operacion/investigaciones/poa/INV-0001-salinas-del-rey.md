---
id: INV-0001
fecha: 2026-07-20
dominio: poa
estado: abierto
autor: Claude Code
fuentes:
  - SQL (Supabase, proyecto enlazado)
  - src/lib/poaImport/parseExcel.ts
  - src/lib/poaImport/service/resolveValidationContext.ts
  - src/lib/siteCapacity.ts
---

# INV-0001 — Salinas del Rey no aparece en el POA importado

## Resumen

Al revisar el estado de los 12 registros bajo "sitios" del Tablero Principal, "Salinas del Rey" mostró 0 actividades contratadas en la versión activa del POA — a diferencia de los otros 10 sitios (8 a 36 zonas cada uno). Se investigó si esto es un estado correcto de negocio o un problema de importación/mapeo, antes de tratarlo como cualquiera de las dos cosas.

## Pregunta

¿Salinas del Rey pertenece al alcance contractual del POA vigente, o el sistema simplemente no lo detectó por un problema de importación/mapeo?

## Evidencia

- El board tiene 12 grupos bajo "sitios"; 11 son sitios reales, 1 nombre duplicado ("Presupuesto General", administrativo — ver nota abajo).
- Solo se ha importado **una** versión del POA: v1, `poa_versions.status = 'active'`, `created_at = 2026-07-19T03:22:42Z`.
- `poa_zone_mappings` para este POA tiene exactamente **9 filas**, todas creadas en la misma sesión de importación (2026-07-18T18:40:02 a 18:40:03), todas con `group_id` ya resuelto (ninguna pendiente):

  | Nombre de zona en el Excel | group_id → sitio |
  |---|---|
  | PLAZA DE PTO COLOMBIA | Plaza Puerto Colombia |
  | PLAYA MANGLARES | Manglares |
  | SALGAR PLAYAS DEL COUNTRY 1 | Playa del Country |
  | SALGAR PLAYAS DE SABANAILLA 2 | Playa de Sabanilla 2 |
  | PLAYAS DE MIRAMAR SECTOR EL FARO | Miramar Sector El Faro |
  | CENTRO GASTRONOMICO | Centro Gastronómico |
  | MERCADO LA SAZÓN | Mercado La Sazón |
  | SENDERO SANTA VERÓNICA | Sendero Santa Verónica |
  | PLAYA PUNTA ASTILLEROS | Playa Punta Astilleros |

- Ninguna fila de `poa_zone_mappings` menciona "Salinas" ni "Rey", ni resuelta ni pendiente (`group_id IS NULL`).
- `poa_activity_zones` con `zone_id` = Salinas del Rey: 0 filas, en cualquier versión del POA (no solo la activa).
- El grupo "Salinas del Rey" en `groups` fue creado el **2026-03-15**, cuatro meses **antes** de la importación del POA (2026-07-18/19).
- `src/lib/siteCapacity.ts` sí tiene capacidad configurada para "Salinas del Rey" (`daily_capacity: 5`) — pero ese archivo documenta su propio origen como "CRONOGRAMA OPERACION 2025 V-2 SEGUIMIENTO EJECUCION", un documento operativo anterior y distinto al Excel del POA.

## Consultas realizadas

1. Conteo de `poa_activity_zones` por sitio (vía `poa_activities.poa_version_id` = versión activa) — Salinas del Rey: 0, los otros 10: 8–36.
2. `poa_zone_mappings` filtrado por `excel_zone_name ILIKE '%SALINAS%'` — 0 filas.
3. `poa_zone_mappings` filtrado por `group_id` = Salinas del Rey — 0 filas.
4. `poa_zone_mappings` completo para este `poa_id` (sin filtro) — 9 filas, listadas arriba, ninguna pendiente.
5. `poa_activity_zones` para `zone_id` = Salinas del Rey en cualquier `poa_version_id` — 0 filas.
6. `poa_versions` para este `poa_id` — 1 sola versión importada.
7. Lectura de `parseExcel.ts`/`resolveValidationContext.ts`: `locateZoneColumns` detecta cualquier columna con sufijo "(presupuesto mes)" en la fila de zonas (sin lista fija de nombres esperados); `resolveValidationContext.ts:33` construye `zoneNames` desde `parseResult.zonas` (TODAS las zonas detectadas en el encabezado, no solo las que tienen cantidad > 0 en alguna fila).

## Hallazgos

- El importador no tiene una lista fija de nombres de zona — detecta cualquier columna del encabezado con el sufijo esperado. Si "Salinas del Rey" tuviera una columna en el Excel importado, con cualquier cantidad (incluso 0 en todas las filas), habría generado al menos una fila en `poa_zone_mappings` (aunque fuera sin resolver) — así lo documenta un comentario existente en `src/lib/poaImport/service/types.ts:82`, escrito cuando se construyó el importador, verificando contra el archivo real: *"cantidad contratada = 0 en las **9 zonas** de este Excel"*.
- Esto descarta un bug de mapeo o de importación silenciosa **para el archivo que efectivamente se importó**: las 9 zonas del Excel real no incluyen Salinas del Rey, con o sin cantidad.
- No se pudo verificar contra el Excel original directamente — no se conserva ningún archivo fuente: se parsea en el navegador durante la importación y se descarta (confirmado: no existe bucket de Supabase Storage para ello, no está en el repositorio).

## Nivel de confianza

- **Alta** — "el Excel importado (9 zonas, verificadas por comentario de una sesión anterior contra el archivo real) no tiene ninguna columna para Salinas del Rey, y el importador la habría registrado aunque tuviera cantidad 0". Esto es un hecho verificable en el código y la base de datos.
- **Baja** — "por lo tanto Salinas del Rey no pertenece al contrato vigente". Esta es una conclusión de negocio que NO se deduce necesariamente del hecho anterior: el Excel importado podría no ser la versión definitiva, podría existir una v2 con una décima zona, o el sitio podría tener otro alias no reconocido en un Excel distinto al que se importó. Confundir estas dos afirmaciones fue el error que esta investigación estuvo a punto de cometer.

## Conclusión

El Excel importado (única versión existente en el sistema, 9 zonas) no cubre a Salinas del Rey, y esto no se debe a un bug de mapeo o importación — el importador habría dejado un rastro si la zona hubiera existido en el archivo, aunque fuera con cantidad 0. Queda abierto si ese Excel es la versión contractual definitiva o si existe una versión más reciente/corregida que sí incluya esta zona.

## Estado

Abierto

## Próximos pasos

- Confirmar con Operaciones si el Excel importado (`POA_2026_V1`, según lo mejor que se puede inferir) es la versión vigente y definitiva del contrato.
- Si existe una versión más reciente, subirla a `docs/operacion/fuentes/poa/2026/` e importarla — eso resolvería la pregunta directamente (aparecería o no una décima zona).
- Si se confirma documentalmente que Salinas del Rey no está contratado este período, cerrar esta investigación como **Resuelto** y anotarlo.
