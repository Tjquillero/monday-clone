# ADR-0012 — Certificación Contractual y Mecanismo de Generación de Actas de Cobro

## Estado
**🟢 CLOSED / VERIFIED / CERTIFIED (2026-09-05)** — Auditado y verificado transversalmente en el Baseline Audit ADR-0007 → ADR-0012 (Audit 38.1 PASS).

## Contexto
El sistema requiere transformar la cantidad certificable operacionalmente (`certifiable_qty`) en documentos de cobro contractual (Actas de cobro / facturación), respetando estrictamente los topes o cantidades máximas contratadas en el POA sin falsificar ni sobreescribir los datos de ejecución física reportados en campo.

## Decisión
1. **Aislamiento del Dominio de Facturación:** El módulo de actas (`actaService.ts`) consume los datos de ejecución verificada y aplica los límites del contrato POA (`poa_activities.cantidad`).
2. **Derivación de Magnitudes Distintas:** El sistema distingue formalmente cuatro magnitudes conceptuales y funcionales independientes:
   - `executed_qty`: Cantidad ejecutada físicamente en terreno.
   - `certifiable_qty`: Cantidad verificada y aprobada por la supervisión operativa.
   - `contractually_certifiable_qty`: Cantidad certificable acotada al tope contractual POA.
   - `cantidad_facturada`: Cantidad efectivamente liquidada e incluida en un Acta emitida.
3. **Invariante de Dominancia Contractual Preservada:**
   `POA.cantidad ≥ contractually_certifiable_qty ≥ cantidad_facturada`
   *(Relación de orden no estricta, permitiendo igualdades exactas cuando se factura hasta el tope contratado)*.
4. **Manejo de Sobreejecución (Overage):** La sobreejecución física (ej. 1.200 m² ejecutados frente a 1.000 m² POA) se preserva en `executed_qty` (1.200 m²) y `certifiable_qty` (1.200 m²), mientras que `contractually_certifiable_qty` y `cantidad_facturada` se topan a 1.000 m², quedando los 200 m² sobrantes aislados como excedentarios no facturables en el resumen contractual.
5. **Inmutabilidad y Snapshots del Acta:** Al emitir un Acta (`issueActa`), se genera un snapshot inmutable de precios, descripciones y cantidades facturadas, garantizando que futuras modificaciones del POA o ejecuciones no alteren las actas históricas emitidas.

## Cadena de Autoridad Transversal (ADR-0007 → ADR-0012)
```
             FUENTES DE VERDAD

POA ──────────── contractual
 │
 ▼
WeeklyPlan ───── planificación
 │
 ▼
ExecutionRecord ─ realidad física
 │
 ▼
Verification ─── autoridad operacional
 │
 ▼
Certification ── reconocimiento contractual
 │
 ▼
Acta ─────────── documento contractual
 │
 ▼
Billing ──────── resultado financiero
```

Cada frontera consume información de la anterior de forma unidireccional, sin mutaciones inversas hacia las fuentes de verdad aguas arriba.

## Regla de Gobierno Congelada
ADR-0007 → ADR-0012 constituyen una cadena arquitectónica certificada. Las futuras extensiones deberán consumir sus contratos y no modificar retrospectivamente sus fuentes de verdad ni sus invariantes congeladas.
