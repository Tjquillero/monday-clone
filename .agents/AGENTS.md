# Reglas de Desarrollo y Gobernanza Arquitectónica — Mantenix

> **Propósito:** Definir los principios rectores, invariantes de dominio, directivas de persistencia y protocolos de evidencia de cumplimiento obligatorio en Mantenix.
> **Precedencia:** Estas reglas son de cumplimiento universal e ineludible para todo agente o desarrollador.

---

## 1. Cadena Arquitectónica Rectora e Invariantes

Toda extensión o flujo funcional en Mantenix debe respetar la cadena de verdad y soberanía de datos:

```text
POA (contractual)
  ↓
WeeklyPlan (planificación operativa)
  ↓
ExecutionRecord (realidad física en campo)
  ↓
Verification (autoridad operacional)
  ↓
Certification (reconocimiento contractual)
  ↓
Acta (documento contractual con AIU 20/5/5)
  ↓
Billing (resultado financiero)
```

### Invariantes de Dominio Congelados:
1. **No Mutación Retrospectiva:** Los componentes y contratos congelados no deben modificarse retrospectivamente para resolver necesidades de un nuevo incremento.
2. **Board Engine v1 Stable:** Queda prohibida cualquier refactorización preventiva o estética sobre la arquitectura de columnas, resolución de llaves o componentes estructurales del motor.
3. **Módulo Financiero (Llaves Estables):** Para ítems financieros (`isFinancialItem === true`), la extracción de datos debe hacerse exclusivamente mediante `getFinancialValues(item, columns)`.
4. **Prevención de Duplicados en Renderizado (React):** Al renderizar filas de tareas, tablas de planner, listas o barras de Gantt, validar siempre que el `id` sea único. **Nunca usar el índice del array (`index`) como `key`.**

---

## 2. Registro Rector de Hitos Congelados (Baseline)

Las especificaciones detalladas y bitácoras de auditoría completas se conservan de forma inmutable en [`docs/archive/ROADMAP_AUDIT_LOG.md`](file:///c:/desarrollo/monday-clone/docs/archive/ROADMAP_AUDIT_LOG.md).

| Módulo / Hito | Estado de Certificación | Descripción / Invariante Principal |
| :--- | :---: | :--- |
| **ADR-0007 a ADR-0012** | 🟢 **FROZEN** | Cadena de Verificación, Certificación de Actas y Reconciliación Financiera. |
| **ADR-0013 (Hito 6.1)** | 🟢 **FROZEN** | Reprogramación gobernada con OCC, calendario `isOperationalWorkingDay`. |
| **C1.2 / ADR-C1.2C** | 🟢 **FROZEN** | Gobernanza de Movilidad de Personal, RPC transaccional `reassign_personnel_governed_xact`. |
| **Frente 2 (Fase 2.1–2.4)**| 🟢 **FROZEN** | Membresía de cuadrillas y contexto de dotación por tablero en `/projects`. |
| **BRAND-01 (Ola 1–3)** | 🟢 **FROZEN** | Identidad visual canónica (Tokens Navy/Orange, Syne/Inter/Mono) en Dashboard, Vistas y Planner. |
| **AI Runtime Governance** | 🟢 **FROZEN** | Copilot confinado a 14 tools `READ_ONLY` en PostgreSQL con bitácora inmutable. |

---

## 3. Directiva Permanente de Base de Datos y Paridad de Esquema

### A. Principio Rector de Paridad
Una migración NO se considera válida únicamente porque termine exitosamente o aparezca como `APPLIED`. Debe demostrarse:
```text
LOCAL SOURCE → MIGRATION CONTRACT → REMOTE PHYSICAL SCHEMA → APPLICATION CONTRACT → SECURITY TESTS (pgTAP)
```

### B. Inmutabilidad y Versionamiento Único
* **Inmutabilidad:** Toda migración aplicada a un entorno compartido queda **FROZEN**. Prohibido editar migraciones pasadas (`M1 → M2 → M3 → CORRECTION_M4`).
* **Versionamiento:** Formato obligatorio único `YYYYMMDDNN_description.sql`.
* **No Assumed Columns:** Prohibido crear índices, policies o queries sobre columnas sin verificación física previa en Supabase.

### C. Stop Conditions Inmediatas (Parada Obligatoria)
El agente DEBE detenerse y reportar ante cualquiera de las siguientes condiciones:
```text
LOCAL ≠ REMOTE
Migración referencia columna o relación inexistente/obsoleta
Colisión de versiones de migración
RLS o firma RPC difiere del contrato esperado
Se requiere SQL manual fuera de la cadena de migraciones
```

---

## 4. Política de Evidencia y Testing Escalonado

1. **Evidence First:** Toda acción debe responder previamente: *¿Qué nueva evidencia verificable producirá esta operación?*
2. **Testing Escalonado:**
   * **Nivel 1:** `npx jest src/path/affected.test.ts` (Tras cada edición unitaria).
   * **Nivel 2:** `npx tsc --noEmit` + Tests del dominio (Al cerrar el scope).
   * **Nivel PG:** `npm run test:db` (pgTAP real: única fuente de verdad para permisos, RLS y RPCs).
   * **Nivel 5 & Build:** `npm test` y `npm run build` (Exclusivo en integración final / release).

---

## 5. Protocolo de Handoff Estándar

Al finalizar una tarea en cualquier ámbito, el informe de entrega debe seguir esta estructura mínima:

```text
# HANDOFF REPORT

## TASK: [Identificador y descripción de la tarea]
## SCOPE: [UX-Brand | Domain-Personnel | Data-Migrations]
## FILES_CHANGED: [Lista exacta de archivos modificados]
## CONTRACTS_TOUCHED: [Tipos o servicios afectados]
## TESTS_EXECUTED: [Resultados Nivel 1/2/PG y suites ejecutadas]
## DATABASE: [0 DDL / Migración aplicada si aplica]
## PRODUCTION_VERIFICATION: [N/A en tareas intermedias | PASS / BLOCKED en cierre de incremento]
## RISKS_OR_BLOCKERS: [Ninguno | Lista de advertencias]
## NEXT_ACTION: [Instrucción para el Orquestador o siguiente rol]
```

---

## 6. Gobernanza de Despliegue en Producción (GATE-PROD-01)

### A. Regla Transversal de Verificación
Antes de declarar un incremento contractual como **cerrado (`CLOSED`), certificado (`CERTIFIED`), congelado (`FROZEN`) o disponible para el siguiente incremento**, el agente debe verificar explícitamente si el commit/versión correspondiente está efectivamente desplegado en producción.

```text
LOCAL COMMIT != PRODUCCIÓN DESPLEGADA
El estado técnico de implementación (IMPLEMENTED) no equivale a despliegue (DEPLOYED).
```

### B. Matriz de Aplicación del Gate

| Situación / Tipo de Tarea | ¿Requiere verificación de producción? |
| :--- | :---: |
| Analizar código o arquitectura | No |
| Proponer una solución o diseño | No |
| Revisión puramente visual o local | No |
| Ejecutar pruebas locales / unitarias | No (no equivale a producción) |
| **Implementar técnicamente un incremento** | No bloquea el estado técnico de implementación; **Sí es requisito previo antes de declarar `CLOSED`/`CERTIFIED`/`FROZEN` o habilitar el siguiente incremento** |
| **Declarar Gate de Cierre (`CLOSED`)** | **Sí** |
| **Declarar Certificación (`CERTIFIED`)** | **Sí** |
| **Declarar Congelamiento (`FROZEN`)** | **Sí, si el cierre implica producción** |
| **Autorizar apertura del siguiente incremento** | **Sí** |

### C. Identidad de Producción (Production Identity)
La identidad del artefacto desplegado debe verificarse mediante la evidencia primaria disponible en el mecanismo real de deployment (Vercel, GitHub Actions, Supabase migrations remote status).

**Orden de Preferencia:**
1. Commit SHA desplegado en producción.
2. Deployment ID asociado inequívocamente al commit certificado.
3. Release / Version ID asociado de forma inmutable al commit.

**Prohibiciones Estrictas (No Asumir):**
* Prohibido asumir: *"El deploy probablemente ocurrió tras el push"*.
* Prohibido asumir: *"El último commit local seguramente está en producción"*.
* Prohibido asumir: *"El build local pasó (`npm run build`), por tanto está desplegado"*.

### D. Condición de Parada y Protocolo de Evidencia
Si `expected_commit != production_commit` o la migración remota no está físicamente aplicada:
```text
STATUS: BLOCKED — NO DECLARAR CIERRE NI CERTIFICACIÓN
```

Toda certificación o handoff final debe incluir el bloque formal de evidencia:

```text
PRODUCTION VERIFICATION
-----------------------
Commit esperado:     <hash_commit_certificado>
Commit en PROD:      <hash_commit_desplegado_real>
Environment:         production
Deployment:          VERIFIED
Verified at:         YYYY-MM-DD HH:mm
Verified by:         <agent/operator>
Status:              PASS
```


