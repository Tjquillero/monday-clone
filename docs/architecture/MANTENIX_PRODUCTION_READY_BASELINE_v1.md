# MANTENIX PRODUCTION READY BASELINE v1

## Estado del Release
**Freeze de Arquitectura & Release Control (2026-09-03).**
El sistema Mantenix ha completado y certificado formalmente su núcleo de dominio de tres capas y las 5 fases del **Production Readiness Gate v1**.

---

## 1. Matriz Consolidada de Baselines

### CAPA A · CONTRACTUAL CORE v1
- **Baseline Commit**: `78e23ba`
- **Estado**: **Congelado (v1)**
- **Subdominios**: POA, Planning, Execution, Certification, Billing.
- **Invariante Fundamental**: La cantidad ejecutada (`executed_qty`) y los valores contractuales son server-authoritative y no aceptan inferencias u operativas externas.

### CAPA B · OPERATIONAL CORE v1
- **Baseline Commit**: `3d159b9`
- **Estado**: **Congelado (v1)**
- **Subdominios**: Offline Sync (`17ed670`), Evidence Integrity (`7963c22`), Crew Assignment (`a2126b8`), Mobile Supervision (`eda396f`), Operational Tracking (`9bd4a4f`), Incidents (`ac16dbf`).
- **Invariante Fundamental**: La realidad operacional de campo se conserva al 100%. `operational_journals` y asignaciones de cuadrilla no alteran cantidades ni valores contractuales.

### CAPA C · PRODUCTIZACIÓN E2E v1
- **Application Boundary Audit**: Commit `3533b3f`
- **Field Workflow E2E (Test 22)**: Commit `fa12e64`
- **Field Reliability Adversarial Audit (Test 23)**: Commit `93b7297`
- **Evidence Curation & Acta Presentation Domain v1 (Test 24)**: Commit `1a87dfa` / `f24ed0b`
- **Productization E2E Audit (Test 25)**: Commit `3107a37`

---

## 2. Production Readiness Gate v1 (Fases 1 a 5)

| Fase | Prueba / Audit | Commit | Estado |
|---|---|---|---|
| **Phase 1** | Test 26 · Production Reliability E2E | `45bcebb` | ✅ CERTIFICADO |
| **Phase 2** | Test 27 · Storage & Attachment Recovery Audit | `b36c53f` | ✅ CERTIFICADO |
| **Phase 3** | Test 28 · Multi-Tenant Security & RLS Audit | `eb113c5` | ✅ CERTIFICADO |
| **Phase 4** | Test 29 · Volumetry & Performance Audit (29A / 29B) | `227345e` | ✅ CERTIFICADO |
| **Phase 5** | Test 30 · Observability & Failure Recovery Audit (30A-30D) | `6730c62` | ✅ CERTIFICADO |

---

## 3. Estado de Pruebas y Metadatos Técnicos

- **Compilador TypeScript (`tsc --noEmit`)**: 0 errores.
- **Suite de Pruebas Jest (`npm test`)**: 63/63 test suites pasadas, 481/481 unit tests pasados.
- **Corrupción Contractual**: 0
- **Accesos Cross-Tenant**: 0
- **Pérdida Silenciosa de Evidencia**: 0
- **Fallos Críticos no Recuperables**: 0
- **Fuga de Credenciales / Logs**: 0

---

## 4. Regla de Gobierno de Ingeniería (Release Control Rule)

> [!CAUTION]
> **Regla de Gobierno Inmutable**:
> A partir de este baseline (`MANTENIX PRODUCTION READY BASELINE v1`), cualquier modificación que afecte a un dominio congelado, sus invariantes o las fronteras de integración entre capas **debe aportar pruebas de regresión automatizadas** antes de incorporarse al baseline siguiente.
> 
> Ningún cambio puede relajar o alterar las fronteras contractuales de la Capa A ni la inmutabilidad de los snapshots documentales de las Actas emitidas.
