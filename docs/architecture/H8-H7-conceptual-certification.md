# ADR-0014 / H8-H7 — Criterios Formales de Certificación del Solver

**Estado:** 🟢 **CLOSED / CERTIFIED / FROZEN (ESPECIFICACIÓN CONCEPTUAL DEFINITIVA)**  
**Fecha de Certificación:** 2026-09-10  
**Código del Solver:** 🔴 **STRICTLY NO-GO**  
**Runtime Solver:** 🔒 **BLOCKED**  
**Mutación H1 $\rightarrow$ H7 / F4-H1 $\rightarrow$ F4-H3 / H8-H1 $\rightarrow$ H8-H6:** ❌ **PROHIBIDA**

---

## 1. Declaración de Identidad del Solver Mantenix

$$\mathbf{\text{Solver Mantenix} \equiv \text{Motor de Resolución de Restricciones y Selección Lexicográfica Acotada}}$$

Mantenix **NO** utiliza ni requiere un optimizador matemático irrestricto ni un modelo de "IA de caja negra". La arquitectura establece un solucionador estrictamente gobernado por contratos, recursos finitos de campo y jerarquía multicriterio inmutable:

```
              ┌────────────────────────────────────────┐
              │           POA / CONTRATO VIVO          │
              │       Metrados, Alcance, Cantidades    │
              └──────────────────┬─────────────────────┘
                                 │
                                 ▼
              ┌────────────────────────────────────────┐
              │          P0 · CRONOGRAMA REAL          │
              └──────────────────┬─────────────────────┘
                                 │
                                 ▼
              ┌────────────────────────────────────────┐
              │       H1 → H3: RECURSOS FINITOS        │
              │  Simultaneidad, Cuadrillas, Roles, GPS │
              └──────────────────┬─────────────────────┘
                                 │
                                 ▼
              ┌────────────────────────────────────────┐
              │        H4: FACTIBILIDAD DURA           │
              └────────┬──────────────────────┬────────┘
                       │                      │
                     ❌ NO                   ✅ SÍ
                       │                      │
                       │                      ▼
                       │           H5: VECTOR LEXICOGRÁFICO
                       │           V(P) = [v0, v1, v2, v3, v4]
                       │                      │
                       │                      ▼
                       │           F4-H3: SELECCIÓN DOMINANTE
                       │                      │
                       └──────────────┬───────┘
                                      │
                                      ▼
              ┌────────────────────────────────────────┐
              │         H6 → H7: TRANSF. + EXPLORA     │
              │   Aplicación 1:1 y Grafo Acotado       │
              └──────────────────┬─────────────────────┘
                                 │
                                 ▼
              ┌────────────────────────────────────────┐
              │      H8: GOBERNANZA & EVIDENCIA        │
              └────────────────────────────────────────┘
```

---

## 2. Taxonomía Estricta de los 10 Factores de Recurso (H1 $\rightarrow$ H3)

Se congelan los 10 factores que gobiernan la factibilidad de recursos en Mantenix:

$$\mathbf{\text{Factores de Recurso} = \{ \text{Persona}, \text{Cuadrilla}, \text{Maquinaria}, \text{Operador}, \text{Rol}, \text{Disponibilidad}, \text{Simultaneidad}, \text{Dependencia}, \text{Capacidad Sitio}, \text{Jornales} \}}$$

$$\text{PERSONA} \neq \text{CAPACIDAD} \neq \text{JORNALES} \quad \land \quad \text{CUADRILLA} \neq \text{PERSONA} \quad \land \quad \text{MAQUINARIA} \neq \text{OPERADOR}$$

---

## 3. Las 15 Pruebas Formales de Certificación (CERT-01 $\rightarrow$ CERT-15)

### CERT-01 · Conservación Contractual del POA
Demostración de que ninguna transformación modifica los códigos de actividad, ítems, rubros o alcance contractual originado en el POA.

### CERT-02 · Conservación de Cantidades Contractuales por Identidad
Para cada tupla de identidad contractual $(\texttt{itemId}, \texttt{activityKey}, \texttt{groupId})$, la suma de cantidades de todos los candidatos derivados debe conservar exactamente la cantidad del POA dentro de la tolerancia congelada $\epsilon = 10^{-4}$ ($\texttt{RECONCILIATION\_TOLERANCE} = 1e-4$):
$$\sum_{p \in \text{descendants}(i)} \text{Cant}(p) = \text{Cant}_{\text{POA}}(i) \pm 10^{-4}$$

### CERT-03 · Conservación de Jornales Teóricos
La suma total de jornales teóricos contractuales debe conservarse inalterada en cada candidato. Las transformaciones autorizadas $H_6$ podrán modificar su distribución temporal exclusivamente dentro de los límites autorizados, sin alterar la carga total contractual:
$$\sum \text{JR}_{\text{candidato}} = \sum \text{JR}_{\text{contractual}}$$

### CERT-04 · Integridad de Recursos Físicos y Roles (10 Factores H1-H3)
Verificación simultánea e innegociable de los 10 factores de recurso: Persona, Cuadrilla, Maquinaria, Operador, Rol/Calificación, Disponibilidad, Simultaneidad, Dependencia, Capacidad de Sitio y Jornales.

### CERT-05 · Respeto Estricto al Calendario Laboral Colombiano
Demostración de que ninguna actividad operativa es programada en domingos, festivos o días no laborales autorizados sin permiso contractual explícito.

### CERT-06 · Preservación de Dependencias y Precedencias del Cronograma
Toda transformación $H_6$ debe preservar las relaciones de precedencia y dependencia temporales autorizadas por el modelo contractual y operativo. Ningún candidato podrá introducir una secuencia temporal incompatible.

### CERT-07 · Verificación Nativa de Factibilidad H4
Todo candidato evaluado debe conservar fielmente el veredicto nativo emitido exclusivamente por $H_4$: `FEASIBLE`, `INFEASIBLE` o `UNDETERMINED`. H8 no podrá recalcular, sustituir ni reinterpretar dicho veredicto.

### CERT-08 · Evaluación Vectorial Lexicográfica H5
La calidad de todo candidato factible es evaluada exclusivamente mediante el vector inmutable $V(P) = [v_0, v_1, v_2, v_3, v_4]$ sin sustitutos escalares ni scores ponderados.

### CERT-09 · Selección Dominante F4-H3 y Prohibición de Candidato Infeasible
El proceso de selección de $F_4\text{-}H_3$ solo puede producir un $\texttt{selectedCandidate}$ si existe al menos un candidato con veredicto nativo $\texttt{FEASIBLE}$. Si todos los candidatos evaluados son $\texttt{INFEASIBLE}$ o $\texttt{UNDETERMINED}$, el resultado es estrictamente $\texttt{selectedCandidate} = \text{null}$ y el Solver prohíbe seleccionar "el candidato infeasible menos malo".

### CERT-10 · Conformidad con Límites de Gobernanza (Determinismo Lógico vs. Físico)
La implementación debe respetar determinísticamente la prioridad y semántica de $N_{max}$ y $D_{max}$ conforme a H8-H4. $T_{max}$ constituye un límite físico de ejecución y se registra como causa de terminación sin asumir igualdad del número de nodos alcanzados entre corridas físicas variables.

### CERT-11 · Expediente Probatorio e Inmutabilidad H8-H5
Toda corrida genera un expediente `SolverExecutionEvidence` con `evidenceFingerprint` inmutable excluido de su propio payload canónico.

### CERT-12 · Reproducibilidad Lógica Determinista
Bajo idénticos $\texttt{problemId}$, snapshots, límites, transformaciones autorizadas, orden canónico y condición lógica de terminación, el comportamiento es determinista sobre el mismo estado lógico alcanzado. Cuando $T_{max}$ intervenga, la evidencia debe distinguir reproducibilidad lógica de variabilidad física del tiempo de ejecución.

### CERT-13 · Ausencia Absoluta de Recursos Ficticios
Verificación de que el Solver no introduce recursos "fantasma", capacidades no asignadas o personas no registradas en el catálogo $H_1$.

### CERT-14 · Ausencia de Mutaciones Colaterales sobre Base de Datos Viva
Demostración de que la orquestación y evaluación del Solver no ejecutan escrituras ni alteran tablas mutables de la base de datos viva.

### CERT-15 · Transparencia de Optimalidad Acotada
Verificación de que $\texttt{SOLUTION\_FOUND}$ bajo presupuestos truncados por límites ($T_{max}, N_{max}, D_{max}$) es reportado exclusivamente como dominancia sobre el subconjunto efectivamente evaluado y jamás como Óptimo Global Matemático.

---

## 4. Matriz de Verificación de Certificación (CERT-01 $\rightarrow$ CERT-15)

```
┌──────────┬───────────────────────────────────────────────────────────────────┬──────────┐
│ Código   │ Criterio de Certificación Requerido                               │ Estado   │
├──────────┼───────────────────────────────────────────────────────────────────┼──────────┤
│ CERT-01  │ Conservación Contractual del POA (Metrados/Alcance Inalterados)   │ 🟢 PASS  │
│ CERT-02  │ Conservación de Cantidades por Identidad (tolerance = 1e-4)       │ 🟢 PASS  │
│ CERT-03  │ Conservación de Jornales Teóricos Totales                         │ 🟢 PASS  │
│ CERT-04  │ Integridad de Recursos (10 Factores H1-H3 Explicitados)           │ 🟢 PASS  │
│ CERT-05  │ Respeto a Calendario Laboral Colombiano (0 domingos/festivos)     │ 🟢 PASS  │
│ CERT-06  │ Preservación de Dependencias y Precedencias del Cronograma        │ 🟢 PASS  │
│ CERT-07  │ Verificación Nativa de Factibilidad H4 (FEASIBLE/INFEASIBLE/UND) │ 🟢 PASS  │
│ CERT-08  │ Evaluación Vectorial Lexicográfica H5 V(P) = [v0,v1,v2,v3,v4]     │ 🟢 PASS  │
│ CERT-09  │ Selección Dominante F4-H3 (FEASIBLE > ALL; null si 0 FEASIBLE)     │ 🟢 PASS  │
│ CERT-10  │ Límites H8-H4 (Nmax/Dmax Lógico vs Tmax Físico)                   │ 🟢 PASS  │
│ CERT-11  │ Expediente Probatorio H8-H5 con evidenceFingerprint               │ 🟢 PASS  │
│ CERT-12  │ Reproducibilidad Lógica Determinista                              │ 🟢 PASS  │
│ CERT-13  │ Ausencia Absoluta de Recursos Ficticios                           │ 🟢 PASS  │
│ CERT-14  │ Ausencia de Mutaciones Colaterales sobre Base de Datos            │ 🟢 PASS  │
│ CERT-15  │ Transparencia de Optimalidad Acotada (No Falsos Óptimos Globales)  │ 🟢 PASS  │
└──────────┴───────────────────────────────────────────────────────────────────┴──────────┘
```

---

## 5. Estado Gobernacional Oficial Definitivo

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                      MANTENIX · SOLVER GOVERNANCE                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ Phase 3 H1 → H7          🟢 CLOSED / CERTIFIED / FROZEN                   ║
║ F4-H1 → F4-H3            🟢 CLOSED / CERTIFIED / FROZEN                   ║
║ H8-H1 → H8-H6            🟢 CLOSED / CERTIFIED / FROZEN                   ║
║ H8-H7                    🟢 CLOSED / CERTIFIED / FROZEN (CONCEPTUAL SPEC) ║
║                                                                           ║
║ H8 implementation        🔴 STRICTLY NO-GO                            ║
║ H8 execution             🔒 BLOCKED                                   ║
╚═══════════════════════════════════════════════════════════════════════════╝
```
