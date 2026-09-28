# Mantenix — Próximos Gates de Gobernanza (Hito 6.3)

**Corte de Estado**: 23/09/2026

## Secuencia Obligatoria de Gates para Hito 6.3

```text
GATE 1: Clasificación de resource_analysis                        (🟢 COMPLETADO: Snapshot Derivado)
        ↓
GATE 2: Origen de Ausencia / Caso A vs Caso B                     (🟢 COMPLETADO: Caso B Confirmado)
        ↓
GATE 3: Semántica de Ausencia de resource_analysis               (🟢 COMPLETADO: Ausencia != Cero)
        ↓
GATE 4: Matriz de Conflictos POA vs resource_analysis            (🟢 COMPLETADO: Soberanía Contractual POA)
        ↓
GATE 5: Suite Integrativa de 8 Escenarios (A..H)                  (🟢 COMPLETADO: 9/9 TESTS PASS)
        ↓
DECISIÓN FINAL: Aprobación formal de H6.3 (IMPLEMENTACIÓN PENDIENTE DE AUTORIZACIÓN EXPLÍCITA)
```

---

## 🟢 GATE 5: Resultados de la Suite Integrativa (9/9 PASS)

* **Archivo de Prueba**: [`src/lib/__tests__/contractualScopeMaterializationGate5.test.ts`](file:///c:/desarrollo/monday-clone/src/lib/__tests__/contractualScopeMaterializationGate5.test.ts)
* **Estado**: **PASS (9/9 pruebas unitarias)**

| Escenario | Nombre de la Prueba | Resultado | Criterio de Verificación |
| :--- | :--- | :---: | :--- |
| **E1** | POA + RA inexistente (Caso Punta Astilleros) | 🟢 PASS | `planned_qty` toma el valor de POA. RA `null` NO produce `0`. |
| **E2** | POA + RA consistente | 🟢 PASS | Coincidencia limpia de alcance (`planned_qty = 100`). |
| **E3** | POA + RA divergente (POA=100, RA=80) | 🟢 PASS | Soberanía absoluta del POA sobre `planned_qty = 100`. |
| **E4** | POA = 0 | 🟢 PASS | Sin obligación contractual (`isEligible = false`, `planned_qty = 0`). |
| **E5** | RA residual sin POA | 🟢 PASS | RA no puede inventar tareas fuera de contrato (`planned_qty = 0`). |
| **E6** | Múltiples actividades heterogéneas | 🟢 PASS | Aislamiento perfecto por actividad en un mismo sitio. |
| **E7** | Múltiples sitios | 🟢 PASS | Aislamiento total por `board_id` y `zone_id`. |
| **E8** | Invarianza absoluta H6.2 | 🟢 PASS | Semántica de frecuencias canónicas intacta (`1`, `4`, `12.5`, `25`). |
| **TEST PA** | Caso Específico Punta Astilleros | 🟢 PASS | Las 8 actividades del POA resultan elegibles con `planned_qty > 0`. |

---

> [!IMPORTANT]
> **ESTADO DE AUTORIZACIÓN**:
> Con los **Gates 1, 2, 3, 4 y 5 en verde**, la arquitectura del Hito 6.3 queda **completamente definida e integrada en pruebas**.
> **La implementación de código funcional en `scheduleMaterializationService.ts` PERMANECE EN ESPERA de la decisión y autorización explícita de producción**.
