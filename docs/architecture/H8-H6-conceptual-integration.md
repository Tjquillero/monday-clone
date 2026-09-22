# ADR-0013 / H8-H6 — Integración Controlada de Gobernanza del Solver

**Estado:** 🟢 **CLOSED / CERTIFIED / FROZEN (ESPECIFICACIÓN CONCEPTUAL)**  
**Fecha de Certificación:** 2026-09-10  
**Código del Solver:** 🔴 **STRICTLY NO-GO**  
**Runtime Solver:** 🔒 **BLOCKED**  
**Mutación H1 $\rightarrow$ H7 / F4-H1 $\rightarrow$ F4-H3 / H8-H1 $\rightarrow$ H8-H5:** ❌ **PROHIBIDA**

---

## 1. Axioma Rector de Integración

$$\mathbf{INTEGRAR\ CONTRATOS\ EXISTENTES \neq IMPLEMENTAR\ EL\ SOLVER \neq OTORGAR\ NUEVA\ AUTORIDAD\ A\ H8}$$

El módulo **H8-H6** actúa de manera exclusiva como una capa de **orquestación contractual, transporte inmutable de contexto y trazabilidad de fronteras**. No implementa heurísticas, no genera candidatos, no calcula métricas y no asume soberanía evaluativa.

---

## 2. Los 14 Contratos de Integración Controlada (R-INT-01 $\rightarrow$ R-INT-14)

### R-INT-01 · Axioma Rector de Integración
$$\text{Integración Contractual} \equiv \text{Conexión Unidireccional de Servicios Congelados (0 Cómputo de Búsqueda)}$$

### R-INT-02 · Prohibiciones Negativas Explicitas
H8-H6 **TIENE ESTRICTAMENTE PROHIBIDO**:
* ❌ Generar candidatos o estados de planificación.
* ❌ Aplicar transformaciones o mutaciones sobre los planes.
* ❌ Explorar el espacio de búsqueda.
* ❌ Evaluar factibilidad ($H_4$) o clasificar restricciones.
* ❌ Calcular el vector lexicográfico de calidad $V(P)$ ($H_5$).
* ❌ Seleccionar el candidato preferido o dominante ($F_4\text{-}H_3$).
* ❌ Reinterpretar las causas operacionales de terminación ($H_8\text{-}H_4$).
* ❌ Modificar los diagnósticos de insuficiencia ($F_4\text{-}H_2$).

### R-INT-03 · Contrato de Entrada `SolverProblemInput`
El orquestador consume como insumo de entrada únicamente el tipo inmutable:
$$\texttt{SolverProblemInput} = \langle \texttt{problemId}, P_0, \text{catalogVersion}, \text{calendarVersion}, \text{holidaysVersion}, N_{max}, D_{max}, T_{max}, \text{mode} \rangle$$

### R-INT-04 · Invariabilidad de `ExecutionContext`
El artefacto `ExecutionContext` es una estructura pasiva e inmutable:
* Contiene únicamente referencias inmutables a los snapshots congelados de $P_0$, catálogos, calendarios, festivos y presupuestos.
* **Prohibición de campos heurísticos o drafts:** Queda estrictamente prohibido incorporar atributos como `preferredResource`, `recommendedTransformation`, `bestCandidate`, `optimizationScore` o `fallbackPlan`.

### R-INT-05 · Pasividad Diagnóstica de `auditReportP0`
El informe de diagnóstico $F_4\text{-}H_2$ (`auditReportP0`) ingresa como contexto probatorio pasivo:
$$\texttt{auditReportP0} \implies \text{Información Diagnóstica Pasiva (NO inyecta restricciones al Solver)}$$

### R-INT-06 · Matriz Exclusiva de Ownership y Soberanía
Queda congelada la matriz de responsabilidad única sin traslapes:
* **H4:** Factibilidad (FEASIBLE / INFEASIBLE).
* **H5:** Calidad Lexicográfica $V(P) = [v_0, v_1, v_2, v_3, v_4]$.
* **H6:** Aplicación determinista 1:1 de transformaciones autorizadas.
* **H7:** Exploración del espacio de búsqueda alcanzable.
* **F4-H3:** Selección del candidato dominante.
* **H8-H4:** Determinación de causa operacional de terminación.
* **H8-H5:** Documentación y certificación de la evidencia.
* **H8-H6:** Orquestación contractual y transporte de contexto.

### R-INT-07 · Prohibición Semántica de Firma de Resolución (`solve` / equivalentes)
Prohibición léxica y semántica de cualquier función ejecutable con flujo $\text{Input} \rightarrow [\text{Generar} \to \text{Evaluar} \to \text{Seleccionar}] \rightarrow \text{Solución}$. Prohibidas las firmas: `solve`, `execute`, `run`, `resolve`, `process`, `orchestrateAndSelect`, `computeSolution`.

### R-INT-08 · Contrato de Topología de Invocación Unidireccional
La secuencia de invocación es estrictamente unidireccional y sin ciclos:
$$H_8\text{-}H_6 \longrightarrow H_7 \longrightarrow H_6 \longrightarrow (H_4 \land H_5) \longrightarrow F_4\text{-}H_3 \longrightarrow H_8\text{-}H_4 \longrightarrow H_8\text{-}H_2 \longrightarrow H_8\text{-}H_5$$

### R-INT-09 · Prohibición de Invocación Directa $H_8 \rightarrow H_6$
H8-H6 **NO** invoca a $H_6$ directamente. La solicitud de aplicación de transformaciones 1:1 es atribución exclusiva de $H_7$ durante la exploración del árbol.

### R-INT-10 · Snapshot Closure Probatorio
Toda orquestación opera sobre snapshots inmutables. Se prohíben lecturas o consultas SQL directas a tablas viva mutables durante la ejecución.

### R-INT-11 · Cero Efectos Laterales en Base de Datos
La orquestación de H8-H6 es puramente pasiva y en memoria. Queda prohibida cualquier escritura o persistencia SQL durante el proceso de orquestación.

### R-INT-12 · Contrato de Salida `SolverExecutionReport` ($H_8\text{-}H_2$)
H8-H6 ensambla la salida ejecutiva consumiendo directamente el veredicto de $F_4\text{-}H_3$ y la causa de parada de $H_8\text{-}H_4$ sin recalcular ningún campo.

### R-INT-13 · Contrato de Salida `SolverExecutionEvidence` ($H_8\text{-}H_5$)
H8-H6 ensambla el expediente probatorio completo calculando la huella inmutable `evidenceFingerprint` sobre el payload canónico serializado.

### R-INT-14 · Propagación Transparente de Invariantes de Identidad
Se preservan e independizan las 5 identidades de la arquitectura:
$$\texttt{problemId} \neq \texttt{candidateId} \neq \texttt{resultFingerprint} \neq \texttt{executionId} \neq \texttt{evidenceFingerprint}$$

---

## 3. Matriz de Verificación de Cumplimiento (Compliance Matrix R-INT-01 $\rightarrow$ R-INT-14)

```
┌──────────┬───────────────────────────────────────────────────────────────────┬──────────┐
│ Regla    │ Requerimiento Contractual                                         │ Estado   │
├──────────┼───────────────────────────────────────────────────────────────────┼──────────┤
│ R-INT-01 │ Axioma Rector: Integración ≠ Implementación ≠ Nueva Autoridad    │ 🟢 PASS  │
│ R-INT-02 │ Prohibiciones Negativas Explicitas (0% gen/eval/sel en H8)       │ 🟢 PASS  │
│ R-INT-03 │ Contrato de Entrada SolverProblemInput inmutable                  │ 🟢 PASS  │
│ R-INT-04 │ ExecutionContext Pasivo (0 campos heurísticos/drafts)             │ 🟢 PASS  │
│ R-INT-05 │ Pasividad Diagnóstica de auditReportP0 (0 inyección de reglas)    │ 🟢 PASS  │
│ R-INT-06 │ Ownership Matrix Estricta sin traslapes ni octava autoridad       │ 🟢 PASS  │
│ R-INT-07 │ Prohibición Léxica y Semántica de solve() y equivalentes          │ 🟢 PASS  │
│ R-INT-08 │ Flujo de Invocación Unidireccional H8->H7->H6->H4/H5->F4-H3->...  │ 🟢 PASS  │
│ R-INT-09 │ Prohibición de llamada directa H8 -> H6                           │ 🟢 PASS  │
│ R-INT-10 │ Snapshot Closure Probatorio (0 consultas SQL vivas)               │ 🟢 PASS  │
│ R-INT-11 │ Cero Efectos Laterales en Base de Datos durante Orquestación      │ 🟢 PASS  │
│ R-INT-12 │ Ensamblado de SolverExecutionReport (H8-H2) consumido sin recálculo│ 🟢 PASS │
│ R-INT-13 │ Ensamblado de SolverExecutionEvidence (H8-H5) con hash inmutable  │ 🟢 PASS  │
│ R-INT-14 │ Preservación de la Matriz de Identidades Invariantes             │ 🟢 PASS  │
└──────────┴───────────────────────────────────────────────────────────────────┴──────────┘
```

---

## 4. Estado Gobernacional Oficial

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                      MANTENIX · SOLVER GOVERNANCE                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ Phase 3 H1 → H7          🟢 CLOSED / CERTIFIED / FROZEN                   ║
║ F4-H1 → F4-H3            🟢 CLOSED / CERTIFIED / FROZEN                   ║
║ H8-H1 → H8-H5            🟢 CLOSED / CERTIFIED / FROZEN                   ║
║ H8-H6                    🟢 CLOSED / CERTIFIED / FROZEN (CONCEPTUAL SPEC) ║
║                                                                           ║
║ H8 implementation        🔴 STRICTLY NO-GO                            ║
║ H8 execution             🔒 BLOCKED                                   ║
╚═══════════════════════════════════════════════════════════════════════════╝
```
