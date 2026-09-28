# Scope: Domain & Personnel (Core Backend, Services & Governance)

> **Ámbito:** Lógica de negocio, servicios de dominio, contratos de tipos, resolución de adscripciones, movilidad de personal (C1.2/C1.2C) y persistencia segura.
> **Directiva de Aislamiento:** Las mutaciones directas de cliente sobre tablas versionadas están prohibidas. Todo cambio estructural debe respetar la cadena arquitectónica rectora.

---

## 1. Perímetro Autorizado de Archivos

* `src/lib/**` (Servicios de dominio, normalizadores, lógica de scheduler y dotación)
* `src/hooks/**` (Hooks de consulta React Query y mutaciones gobernadas)
* `src/types/**` (Contratos de tipos TypeScript)
* `src/lib/__tests__/**` (Suites de pruebas de contratos y servicios)
* `supabase/tests/**` (Pruebas de seguridad pgTAP)

---

## 2. Invariantes de Gobernanza C1.2 / C1.2C (Movilidad de Personal)

* **Soberanía Física:** El estado canónico de versiones y adscripciones se gobierna exclusivamente mediante:
  * `public.personnel_versions` (`status` canónico: `DRAFT`, `PUBLISHED`, `ARCHIVED`, `effective_from`).
  * `public.personnel_site_assignments`.
* **Mutaciones de Cliente Revocadas:** Prohibidas las mutaciones directas vía PostgREST sobre `personnel_versions` y `personnel_site_assignments`.
* **RPC Transaccional Única:** La reasignación y cambio de dotación se ejecuta exclusivamente a través de:
  ```sql
  reassign_personnel_governed_xact(p_board_id, p_personnel_id, p_target_site_id, ...)
  ```
* **Resolución Temporal Determinista:**
  La versión activa para cualquier fecha operativa debe resolverse con `resolvePersonnelVersionForDate(boardId, targetDate)` en `America/Bogota`.

---

## 3. Cadena Arquitectónica Intacta

```text
POA (contractual)
  ↓
WeeklyPlan (planificación)
  ↓
ExecutionRecord (realidad física)
  ↓
Verification (autoridad operacional)
  ↓
Certification (reconocimiento contractual)
  ↓
Acta (documento contractual)
  ↓
Billing (resultado financiero)
```

* **No Modificación Retrospectiva:** Los contratos expuestos por hitos cerrados no deben alterarse para acomodar necesidades puntuales.

---

## 4. Pruebas y Validación en este Scope

1. **Nivel 1:** `npx jest src/lib/__tests__/affectedService.test.ts`
2. **Nivel 2:** `npx tsc --noEmit`
3. **Nivel PG (Seguridad / RLS):**
   ```bash
   npm run test:db:setup
   npm run test:db
   npm run test:db:teardown
   ```
