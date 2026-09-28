---
trigger: always_on
---

# Política de Ejecución y Evidencia — Mantenix

> Estas reglas son OBLIGATORIAS en todo trabajo sobre este proyecto.
> Están diseñadas para maximizar la proporción EVIDENCIA NUEVA / OPERACIÓN EJECUTADA.

---

## 1. EVIDENCE FIRST

Antes de ejecutar cualquier operación, responder internamente:

```
WHAT NEW EVIDENCE WILL THIS PRODUCE?
```

- ¿Qué hipótesis comprueba?
- ¿Qué resultado nuevo puede producir?
- ¿Qué evidencia ya obtenida cubre esa hipótesis?

**Si la operación no puede producir evidencia nueva → NO ejecutarla.**

---

## 2. CHECKPOINT POR BLOQUE DE TRABAJO

Al iniciar cada bloque de trabajo sobre una tarea en progreso, declarar:

```
CHECKPOINT:
  archivos inspeccionados: [lista]
  búsquedas realizadas: [símbolo → resultado]
  tests ejecutados: [suite → resultado]
  baseline: [suites / tests]
  estado del Gate: [OPEN / CLOSED]
  evidencia obtenida: [qué se sabe y de qué fuente]
  bloqueadores activos: [lista]
  siguiente evidencia necesaria: [qué falta]
```

No redescubrir información ya registrada en el checkpoint.

---

## 3. REUTILIZACIÓN DE EVIDENCIA

No re-ejecutar una operación si:
- El objeto no cambió desde la última ejecución.
- La hipótesis no cambió.
- El resultado anterior sigue siendo válido.

Conservar durante la tarea:
- Archivos inspeccionados y rangos relevantes.
- Resultados de búsquedas (símbolo → callers/ubicaciones).
- Tests ejecutados y sus resultados.
- Errores y decisiones arquitectónicas.

---

## 4. LECTURA PROGRESIVA

**Usar:** `search → targeted read (range) → expand only if needed`

**No usar:** `list everything → read entire files → search globally → repeat`

Reglas:
1. Buscar primero con `grep_search` (directorio acotado, `Includes` específico).
2. Leer solo el rango relevante (`StartLine..EndLine`).
3. Ampliar únicamente si existe una pregunta concreta que el fragmento actual no responde.
4. No releer un archivo ya inspeccionado en el mismo turno salvo que haya sido modificado.
5. No inspeccionar archivos fuera del alcance del cambio en curso.

---

## 5. POLÍTICA DE BÚSQUEDA

Una búsqueda global sobre un símbolo es suficiente por turno.

Solo repetir si:
- El archivo fue modificado después de la búsqueda inicial.
- Hay una hipótesis nueva no cubierta por la búsqueda anterior.
- Se necesita verificar callers de un símbolo distinto.

**No repetir búsquedas simplemente para "confirmar" resultados ya conocidos.**

---

## 6. TESTING ESCALONADO

| Nivel | Qué ejecuta | Cuándo |
|---|---|---|
| **NIVEL 1** | Test(s) directamente relacionados con el cambio | Tras cada edición de archivo |
| **NIVEL 2** | Suite del dominio afectado | Al completar todos los cambios del turno en un dominio |
| **NIVEL 3** | `npx tsc --noEmit` | Al completar todos los cambios del turno |
| **NIVEL 4** | `npm run build` | Al cerrar una Fase o Gate, o si se añade una ruta nueva |
| **NIVEL 5** | `npx jest` (suite completa) | Al cerrar una Fase/Gate, ante riesgo transversal, o por instrucción explícita |
| **NIVEL PG** | `npm run test:db` (pgTAP) | Cuando el Gate requiera evidencia de integración PostgreSQL |

**Regla explícita:** No ejecutar automáticamente NIVEL 5 ni NIVEL 4 después de modificaciones en `src/lib/`, `__tests__/` o `supabase/migrations/` que no añadan rutas nuevas ni dependencias cruzadas.

---

## 7. JERARQUÍA DE EVIDENCIA POSTGRESQL

Para contratos que involucren permisos, RLS, RPCs o SECURITY DEFINER:

| Tipo | Qué prueba | ¿Sustituye a E? |
|---|---|---|
| A. Unit/contract tests (Jest/jsdom) | Contratos TypeScript | NO |
| B. TypeScript (`tsc --noEmit`) | Tipos estáticos | NO |
| C. Build (`next build`) | Compilación de rutas | NO |
| D. SQL estático (revisión del .sql) | Intención del DDL | NO |
| **E. PostgreSQL real (`test:db`)** | **Comportamiento real del motor** | **ES LA FUENTE** |

**A-D NO sustituyen E.** Si el Gate exige evidencia PostgreSQL, usar primero:

```bash
npm run test:db:setup    # Aplica fixtures pgTAP
npm run test:db          # Ejecuta supabase/tests/*.sql (pgTAP)
npm run test:db:teardown # Limpieza
```

Si `test:db` falla por entorno/credenciales → reportar el bloqueo exacto.
**No ocultar el bloqueo creando mocks Jest equivalentes.**

---

## 8. NO CREAR PRUEBAS DUPLICADAS

Antes de crear un nuevo test:
1. Buscar tests existentes relacionados (en `supabase/tests/` y `src/lib/__tests__/`).
2. Determinar exactamente qué condición falta.
3. Crear únicamente la cobertura realmente faltante.

**Si la cobertura ya existe → reutilizarla.**

---

## 9. CAMBIOS DE CÓDIGO

**Antes de editar:**
- Objetivo específico del cambio.
- Archivos que serán modificados (lista exacta).
- Contrato/invariante afectado.
- Riesgo de regresión en dominios adyacentes.
- Prueba mínima necesaria (NIVEL 1 o 2).

**Después de editar:**
- Ejecutar solo la prueba mínima (NIVEL 1).
- Ampliar solo si la prueba muestra fallo inesperado o dependencia cruzada.
- No ejecutar NIVEL 3/4/5 hasta completar todos los cambios del turno.

---

## 10. ESTADOS DE EVIDENCIA Y GATES

Estados válidos para una condición de Gate:

| Estado | Significado |
|---|---|
| `NOT CHECKED` | No inspeccionado aún |
| `INFERRED` | Deducido del código/SQL sin ejecución real |
| `CONTRACT VERIFIED` | Verificado mediante tests de contrato (A-D) |
| `INTEGRATION VERIFIED` | Verificado mediante PostgreSQL real (E) |
| `READY FOR GATE` | Toda la evidencia del Gate está disponible |
| `CLOSED` | Gate cerrado formalmente |

**Regla:** `"documentado"` ≠ `"verificado"`. Agregar JSDoc no cierra un bloqueador arquitectónico.

Un Gate solo puede declararse CLOSED cuando:
- Toda la evidencia requerida por su contrato está disponible.
- La evidencia es del tipo correcto (no sustitutos).
- TypeScript: 0 errores.
- Tests del dominio: 0 fallos.
- Suite completa: 0 fallos (ejecutada solo al cierre de Gate).
- Baseline registrada con incrementos separados de la histórica.

---

## 11. CONTABILIDAD DE BASELINE

```
Baseline histórica: 161 suites / 1.394 tests  ← INMUTABLE
```

Los incrementos posteriores se registran separadamente:

```
C1.2 implementation:  +N → X tests
[Fase/tarea]:         +N → X tests
```

La baseline histórica nunca se reemplaza por el total acumulado.

---

## 12. OPERACIONES COSTOSAS — AUTORIZACIÓN PREVIA

Antes de ejecutar cualquiera de estas operaciones, verificar que existe una razón concreta:

| Operación | Costo | Autorización requerida |
|---|---|---|
| `npx jest` (suite completa) | ALTO | Cierre de Gate/Fase, regresión transversal, instrucción explícita |
| `npm run build` | ALTO | Cierre de Gate/Fase, ruta nueva añadida |
| `grep_search` global sobre todo `src/` | MEDIO | Hipótesis nueva no cubierta por búsqueda previa |
| `list_dir` recursivo del repositorio | MEDIO | Primer contacto con un módulo desconocido |
| Lectura completa de archivo >200 líneas | MEDIO | Solo si el rango relevante no es suficiente |
| `npx tsc --noEmit` | MEDIO | Completar todos los cambios del turno |

---

*Versión: 1.0 · 2026-09-27 · Post-Auditoría C1.2*
