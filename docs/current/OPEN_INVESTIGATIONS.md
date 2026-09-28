# Mantenix — Investigaciones Abiertas

**Corte de Estado**: 23/09/2026

## Matriz de Investigaciones

| Investigación | Estado | Evidencia / Especificación | Siguiente Gate |
| :--- | :---: | :--- | :--- |
| **Linaje de `resource_analysis`** | 🟢 Completado (Gate 2) | Escrito por `importResourceAnalysisService` desde Excel de Costos/Eficiencia. Es un snapshot operacional derivado, NO la SoT del POA. | Gate 3 |
| **Semántica de Ausencia (Gate 3)** | 🟢 Completado (Gate 3) | `resource_analysis = null` representa falta de snapshot operacional, NO alcance contractual cero. | Gate 4 |
| **Matriz de Conflictos POA vs RA (Gate 4)** | 🟢 Completado (Gate 4) | Soberanía absoluta del POA sobre `planned_qty`. RA solo influye en rendimientos operacionales (`planned_jr`). | Gate 5 |
| **Hito 6.3** | 📋 Proposed | Arquitectura definida a nivel de gobernanza (Gates 1..4 cerrados). | Gate 5 (Suite Integrativa) |
| **Materialización Global** | 🟡 En Evaluación | 8 sitios con RA consistente, 1 sitio sin RA (Punta Astilleros) listo para materializarse bajo regla E1. | Validación final |

---

## Principio Fundamental Consolidado

$$\begin{matrix}
\text{POA Contractual (poa\_activity\_zones)} & \Longrightarrow & \text{SoT de Alcance Físico Legal (planned\_qty)} \\
\neq & & \neq \\
\text{resource\_analysis (RA)} & \Longrightarrow & \text{Proyección Derivada de Eficiencia (planned\_jr)}
\end{matrix}$$

1. **Jamás tratarlos como fuentes equivalentes de cantidad**.
2. **POA manda de forma soberana sobre la existencia y la magnitud física del trabajo**.
3. **RA es un lente operacional de eficiencia que calcula el esfuerzo teórico en jornales, pero jamás anula el trabajo contractual**.
