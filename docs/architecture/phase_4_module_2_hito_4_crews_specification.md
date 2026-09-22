# FASE 4 · MÓDULO 2 · HITO 4 — Integración Operacional de Cuadrillas (`crews`)

**Estado:** 🟢 **CLOSED / CERTIFIED / FROZEN (IMPLEMENTACIÓN COMPLETADA)**  
**Fecha de Certificación:** 2026-09-11  
**Código Solver H8:** 🔴 **STRICTLY NO-GO (INTOCABLE Y BLOQUEADO)**  
**Invariantes Contratadas (ADR-0007 $\rightarrow$ ADR-0012):** 🟢 **100% PRESERVADAS**

---

## 1. Declaración de Dominio y Frontera Contractual

El Hito 4 formaliza y certifica la **Integración Operacional de Cuadrillas** entre el catálogo de personal adscrito por sitio (`personnel_site_assignments`), las cuadrillas autorizadas (`crews` / `crew_members`), los ítems planificados semanalmente (`weekly_plan_items.crew_id`) y la agenda operativa de campo (`/my-work`).

### Cadena de Dominio Certificada:
$$\text{PERSONNEL} \longrightarrow \text{PERSONNEL\_SITE\_ASSIGNMENTS} \longrightarrow \text{CREWS / CREW\_MEMBERS} \xrightarrow{\text{validación de sitio CUAD-03}} \text{WEEKLY\_PLAN\_ITEMS.crew\_id} \longrightarrow \text{DAILY EXECUTION (/my-work)}$$

---

## 2. Ortogonalidad Semántica Obligatoria Certificada

$$\mathbf{\text{CUADRILLA ASIGNADA} \neq \text{PERSONAL ADSCRITO} \neq \text{CAPACIDAD OPERACIONAL}}$$
$$\mathbf{\texttt{crew\_id} \neq \texttt{leader\_id} \neq \text{Capacidad JR} \neq \text{Jornales Consumidos}}$$

---

## 3. Matriz de Cumplimiento de Invariantes (CUAD-01 $\rightarrow$ CUAD-10)

| Invariante | Regla de Gobierno Operacional | Estado |
| :--- | :--- | :---: |
| **CUAD-01. Identidad** | `crew_id` proviene exclusivamente de la PK UUID `crews.id`. Cero cadenas/nombres arbitrarios. | 🟢 PASS |
| **CUAD-02. Pertenencia** | Pertenencia de trabajador vía `crew_members` referenciando `personnel_site_assignments.id`. | 🟢 PASS |
| **CUAD-03. Sitio** | `assignCrewToPlanItem` valida en backend que `crew.board_id === board_id`. Falla con `Incompatibilidad de sitio`. | 🟢 PASS |
| **CUAD-04. Fecha** | `crew_id` identifica responsabilidad asignada; no demuestra capacidad diaria temporal por sí solo. | 🟢 PASS |
| **CUAD-05. Jornales** | Demanda `theoretical_jr` / `planned_jr` 100% inmutable ante asignaciones de cuadrilla. | 🟢 PASS |
| **CUAD-06. Capacidad** | Prohibida la fórmula simplista $\text{personas} \equiv \text{jornales disponibles}$. | 🟢 PASS |
| **CUAD-07. Ejecución** | `/my-work` (`DailyAgendaPanel`) consume directamente `weekly_plan_items.crew_id` sin heurísticas. | 🟢 PASS |
| **CUAD-08. Persistencia** | Escritura atómica vía `assignCrewToPlanItem` en `crewService.ts` / `useCrewMutations` respetando RLS. | 🟢 PASS |
| **CUAD-09. Inmutabilidad** | Reasignación de `crew_id` en plan pendiente jamás muta `weekly_plan_item_executions` pasadas ni actas. | 🟢 PASS |
| **CUAD-10. Sin Solver** | Aislamiento total del Solver $H_8$. Cero algoritmos de optimización o reasignación automática. | 🟢 PASS |

---

## 4. Matriz de Ejecución Técnica (H4.1 $\rightarrow$ H4.9)

```
┌──────────┬─────────────────────────────────────────────────────────────┬──────────────────────────────────────────┐
│ Hito     │ Sub-etapa Técnica                                            │ Estado                                   │
├──────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
│ H4.1     │ Auditoría de tablas `crews` y `crew_members`                │ 🟢 CLOSED / CERTIFIED                    │
│ H4.2     │ Auditoría de relación `crew` ↔ `site` ↔ `personnel`         │ 🟢 CLOSED / CERTIFIED                    │
│ H4.3     │ Auditoría de FK `weekly_plan_items.crew_id`                 │ 🟢 CLOSED / CERTIFIED                    │
│ H4.4     │ Definición del Contrato de Asignación UX                    │ 🟢 CLOSED / CERTIFIED                    │
│ H4.5     │ Implementación de Asignación en `WeeklyPlannerView.tsx`     │ 🟢 CLOSED / CERTIFIED                    │
│ H4.6     │ Exposición de `crew_id` en `/my-work` (`DailyAgendaPanel`)  │ 🟢 CLOSED / CERTIFIED                    │
│ H4.7     │ Filtro Operativo de Agenda por Cuadrilla                    │ 🟢 CLOSED / CERTIFIED                    │
│ H4.8     │ Suite de Pruebas de Regresión y Casos Negativos             │ 🟢 CLOSED / CERTIFIED (Suite 40 PASS)    │
│ H4.9     │ Proyección de Capacidad de Cuadrilla                         │ 🟡 DIFERIDO                              │
└──────────┴─────────────────────────────────────────────────────────────┴──────────────────────────────────────────┘
```

---

## 5. Estado Gobernacional Consolidado

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                      MANTENIX · ROADMAP FUNCIONAL                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ ADR-0007 → ADR-0012      🟢 CLOSED / CERTIFIED / FROZEN                   ║
║ Phase 3 H1 → H7          🟢 CLOSED / CERTIFIED / FROZEN                   ║
║ F4-H1 → F4-H3            🟢 CLOSED / CERTIFIED / FROZEN                   ║
║ H8-H1 → H8-H7            🟢 CLOSED / CERTIFIED / FROZEN                   ║
║ FASE 4 · MOD 2 · HITO 4  🟢 CLOSED / CERTIFIED / FROZEN (H4.1 → H4.8)      ║
║ H4.9 Capacidad Cuadrilla 🟡 DEFERRED                                      ║
║                                                                           ║
║ IMPLEMENTACIÓN CÓDIGO    🟢 COMPLETADA PARA H4.5 → H4.8                    ║
║ RUNTIME SOLVER H8        🔒 BLOCKED                                       ║
╚═══════════════════════════════════════════════════════════════════════════╝
```
