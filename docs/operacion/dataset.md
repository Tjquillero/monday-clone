# Fuentes de verdad — Mantenix

Manifiesto minimalista: describe cuál es el documento oficial de cada dominio, no su contenido. Los hallazgos observados en la base de datos un día concreto viven en `investigaciones/`, nunca aquí — así este documento no queda desactualizado con la próxima importación.

| Dominio | Fuente oficial | Documento vigente | Estado actual (si aplica) | Responsable | Última validación |
|---|---|---|---|---|---|
| POA | `docs/operacion/fuentes/poa/` | No registrado en el repositorio | — | Operaciones | 2026-07-20 |
| Resource Analysis | `docs/operacion/fuentes/resource-analysis/` | No registrado en el repositorio | — | Operaciones | — |
| Salarios | `docs/operacion/fuentes/salarios/` | No registrado en el repositorio | — | Operaciones | — |
| Capacidades | `docs/operacion/fuentes/capacidades/` | No registrado en el repositorio | Implementado actualmente en `src/lib/siteCapacity.ts` | Operaciones | 2026-07-20 |
| Catálogo Técnico | — (no es un archivo externo) | — | Vive en la tabla `board_activity_standards` | Operaciones | — |

**Nota sobre "Estado actual"**: existe para casos como Capacidades, donde la fuente oficial documental todavía no está subida pero el sistema ya opera con una implementación concreta en código — sin esta columna, la implementación terminaría escrita bajo "Documento vigente", mezclando la capa de documento con la de código.

Al llegar una versión nueva (ej. `POA_2026_V2.xlsx`): se guarda junto a la anterior en `fuentes/poa/2026/` (nunca se borra), y se edita solo la celda "Documento vigente" de esta tabla.
