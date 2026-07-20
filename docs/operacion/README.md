# Conocimiento operativo

Este directorio existe porque el código y la base de datos, por sí solos, no pueden responder preguntas de negocio con certeza — solo pueden responder "qué se implementó" y "qué se importó". Preguntas como "¿este sitio pertenece al contrato vigente?" necesitan contrastarse contra el documento real, no inferirse de una consulta SQL.

## Las cuatro capas

1. **Documento** (`fuentes/`) — qué dice el negocio. El Excel/PDF oficial, canónico, versionado por año/tipo. Nunca se borra una versión anterior al llegar una nueva.
2. **Base de datos** — qué cargó el sistema. Estado observado, cambia con cada importación.
3. **Código** — cómo se interpreta esa información (ej. `src/lib/poaImport/parseExcel.ts`, `src/lib/siteCapacity.ts`).
4. **Investigaciones** (`investigaciones/`) — por qué se llegó a una conclusión sobre una duda concreta, con evidencia, fecha y nivel de confianza.

No mezclar estas capas es la regla explícita: un manifiesto (`dataset.md`) no describe hallazgos observados un día concreto, y una investigación no reemplaza al documento oficial.

## Relación con el módulo "Documentos" de la aplicación (2026-07-20)

Este directorio (`fuentes/`) sigue siendo la documentación técnica/arquitectónica y la trazabilidad para desarrollo — sirve para que el código y quien investigue una duda de negocio tengan un lugar versionado en Git. Para los documentos reales que Operaciones sube y consulta día a día (POA, Resource Analysis, Salarios, Contratos, Manuales, Cronogramas, Catálogos Técnicos), la fuente operativa pasa a ser el módulo **Documentos** dentro de Mantenix (`/documentos` — ver `docs/architecture/documentos-roadmap.md`): evita que Operaciones dependa de un `git pull` para ver cuál es el documento vigente. Los dos sistemas son independientes a propósito (Fase 1 de esa hoja de ruta) — no se sincronizan automáticamente todavía.

## Cómo se usa

- **Antes de asumir una regla de negocio** (ej. "¿esta zona está contratada?"), consultar primero `dataset.md` (cuál es el documento oficial vigente) y el índice de `investigaciones/README.md` (si ya se investigó esta duda antes).
- Si ninguno responde la pregunta, decirlo explícitamente — una consulta SQL con 0 filas prueba "el sistema no encontró esto", nunca "esto no existe en el negocio" (ver `investigaciones/poa/INV-0001-salinas-del-rey.md`).
- Los archivos Excel/PDF reales no siempre están subidos aquí todavía — cada carpeta de `fuentes/` indica qué falta subir.

## Estructura

```
docs/operacion/
├── dataset.md              — manifiesto: fuente oficial de cada dominio
├── fuentes/                — documentos canónicos (Excel/PDF), versionados
├── catalogos/               — Catálogo Técnico, si existe un documento de origen externo
├── historico/               — documentos de ciclos anteriores (ej. Cronograma 2025)
└── investigaciones/         — diagnósticos con fecha, organizados por dominio, con plantilla e índice
```
