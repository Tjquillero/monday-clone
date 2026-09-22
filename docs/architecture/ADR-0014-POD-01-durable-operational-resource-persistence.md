# ADR-0014: Persistencia Durable de Recursos Operativos Observados v1 (POD-01)

## Estado
🟡 **APPROVED FOR CONTRACT FORMALIZATION** (Implementación y DDL pendientes de autorización explícita)

---

## Contexto y Motivación
En el hito **Gestión Operativa de Recursos de Ejecución v1** (RCO-01 a RCO-24), se certificó el contrato de dominio en memoria y el Read Model consultivo (`resourceConsumptionControlService.ts`) que modela la tríada de recursos operativos adicionales (`MATERIAL`, `EQUIPO_MENOR`, `EQUIPO_MAYOR`) con unidad operacional genérica (`quantity + unit`).

Para que la Inteligencia Mantenix pueda en el futuro correlacionar patrones históricos entre lo planificado (`requiredResources`), lo ejecutado (`usedResources`) y lo verificado ($ADR-0011$), es indispensable que el hecho operacional observado adquiera **persistencia física durable en PostgreSQL**, sin crear una segunda fuente de verdad y sin violar la soberanía del `ExecutionRecord` ($ADR-0009$ / F5.3).

---

## Alternativa Arquitectónica Seleccionada: Alternativa A
**Columna `used_resources JSONB` en `public.weekly_plan_item_executions`**.

### Justificación:
1. **Unicidad de la Fuente de Verdad:** La realidad física de una jornada de campo sigue residiendo en un único registro atómico en `weekly_plan_item_executions`.
2. **Atomicidad e Idempotencia:** La persistencia de los recursos utilizados se ejecuta dentro del mismo comando de inserción gobernado por `source_mutation_id`. No existe riesgo de registros huérfanos ni inserciones parciales.
3. **Reutilización Soberana de RLS:** Consume las políticas RLS y RBAC ya auditadas y certificadas sobre `weekly_plan_item_executions`.
4. **Acoplamiento Directo al Ciclo de Verificación ($ADR-0011$):** El estado de verificación de la jornada (`reported`, `verified`, `rejected`, etc.) gobierna directamente la validez de los recursos sin necesidad de estados paralelos.
5. **Inmutabilidad y Protección de Actas ($ADR-0012$):** Al liquidarse una ejecución en un Acta emitida (`issued`), los recursos asociados quedan automáticamente congelados.

---

## Contratos de Dominio y Validación

### 1. Estructura del Payload Persistido
```typescript
export type AdditionalResourceCategory = 'MATERIAL' | 'EQUIPO_MENOR' | 'EQUIPO_MAYOR';

export interface OperationalResourceItem {
  resourceKey: string;      // Identificador canónico (ej: 'MAT_CEMENTO_GRIS')
  resourceName: string;     // Nombre descriptivo (ej: 'Cemento Gris 50kg')
  category: AdditionalResourceCategory;
  unit: string;             // Unidad operacional genérica (ej: 'saco', 'galon', 'unidad', 'hora')
  quantity: number;         // Magnitud física (número finito >= 0)
}
```

### 2. Regla de Validación de Dominio (TypeScript Gateway)
JSONB no sustituye la validación de negocio. Todo consumo persistido debe ser validado por `validateOperationalResourceItem` en el Gateway autorizado antes de escribir en la base de datos:
- `resourceKey` no vacío y canónico.
- `category ∈ {'MATERIAL', 'EQUIPO_MENOR', 'EQUIPO_MAYOR'}`.
- `unit` no vacía.
- `quantity >= 0` (finito, rechaza `NaN` e `Infinity`).

### 3. Invarianzas Contractuales Congeladas
- **POD-01-INV-01 (No-Inventario):** `usedResources` representa exclusivamente hechos observados en campo; no representa stock, kardex, bodega, compras ni despachos.
- **POD-01-INV-02 (Separación Ontológica):** $\text{requiredResources (Plan)} \neq \text{usedResources (Ejecución)}$. La persistencia de recursos jamás muta `planned_qty`, `executed_qty`, `planned_date` ni `occurrence_key`.
- **POD-01-INV-03 (Idempotencia Transaccional):** Reintentos con idéntico `source_mutation_id` devuelven el registro existente sin duplicar magnitudes de recursos.
- **POD-01-INV-04 (Precedencia de Alcance):** Subejecución física prohíbe catalogar menor uso de recursos como ahorro.
- **POD-01-INV-05 (Aislamiento H8):** 0 dependencias transitivas o llamadas a solvers de optimización.
- **POD-01-INV-06 (Desacoplamiento Financiero):** `monetaryCostStatus = 'UNDETERMINED_MONETARY_COST'`.

---

## Matriz de Criterios de Aceptación (POD-01.01 a POD-01.13)

| ID | Criterio de Aceptación |
| :--- | :--- |
| **POD-01.01** | **Persistencia Atómica:** `used_resources` se inserta en `weekly_plan_item_executions` en la misma mutación física. |
| **POD-01.02** | **Validación Contractual:** El Gateway rechaza payloads con claves vacías, categorías inválidas o cantidades negativas. |
| **POD-01.03** | **Idempotencia con `source_mutation_id`:** Reintentos devuelven el snapshot existente sin duplicar cantidades. |
| **POD-01.04** | **Seguridad RLS y RBAC:** Solo usuarios autorizados en el tablero (`worker`, `crew_leader`, `supervisor`, `admin`) pueden reportar recursos. |
| **POD-01.05** | **Linaje de Ejecución:** `used_resources` queda unívocamente vinculado al `weekly_plan_item_id` y su cabecera de plan. |
| **POD-01.06** | **Aislamiento por `occurrence_key`:** Agregaciones no mezclan recursos de diferentes ocurrencias o semanas operativas. |
| **POD-01.07** | **Gobernanza ADR-0011:** Ejecuciones en estado `draft`, `reported` o `rejected` no acumulan consumo verificado en RCO. |
| **POD-01.08** | **Protección de Actas Emitidas (ADR-0012):** Bloquea mutaciones de recursos sobre ejecuciones liquidadas en actas `issued`/`approved`. |
| **POD-01.09** | **Consumo Transparente en RCO:** `resourceConsumptionControlService` lee `used_resources` de BD sin requerir transformaciones manuales. |
| **POD-01.10** | **0 Nuevas SoT:** No se crean tablas paralelas para el hecho de ejecución. |
| **POD-01.11** | **Concurrencia:** Mutaciones concurrentes sobre el ítem se manejan bajo el protocolo de lock y validación de F5.3. |
| **POD-01.12** | **Aislamiento H8 Solver:** 0 imports y 0 llamadas directas a solvers. |
| **POD-01.13** | **Regresión Global:** 108 suites / 871+ tests PASS / TS 0 errores. |
