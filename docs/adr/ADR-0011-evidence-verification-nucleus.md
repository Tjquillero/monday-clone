# ADR-0011 — Núcleo de Evidencia Fotográfica y Verificación Operacional

## Estado
**🟢 CLOSED / CERTIFIED (2026-09-05)** — Auditado y certificado transversalmente en el Baseline Audit ADR-0007 → ADR-0012 (Audit 38.1 PASS).

## Contexto
El modelo de ejecuciones de campo (`weekly_plan_item_executions`) requiere respaldar la realidad física reportada por los líderes de cuadrilla mediante evidencia objetiva (fotografías, coordenadas, sellos de tiempo) antes de que una cantidad pueda ser considerada certificable desde la perspectiva operacional.

## Decisión
1. **Modelado de Ejecución Física:** La cantidad ejecutada en campo (`executed_qty`) vive en `weekly_plan_item_executions` y es reportada por los ejecutores. Este valor es la fuente de verdad histórica de lo que realmente ocurrió físicamente en el terreno y se mantiene inalterado frente a procesos posteriores.
2. **Evidencia Adjunta:** Las fotos y respaldos viven en `execution_attachments` asociados al registro de ejecución.
3. **Flujo de Verificación Supervisora:** Un supervisor valida la evidencia y aplica la acción (`verifyExecutionRecordWithAudit`), transitando el estado del registro (`reported` → `verified` / `rejected`).
4. **Magnitud Certificable Operacional:** La función pura `computeCertifiableMetrics` deriva `certifiable_qty` considerando únicamente las ejecuciones en estado `verified`. 
5. **No Falsificación Física:** Si en campo se ejecutaron 1.200 m², `executed_qty` y `certifiable_qty` reflejarán 1.200 m², preservando la realidad operacional sin recortarla artificialmente para acomodar límites financieros.

## Invariantes Certificadas
- `executed_qty` es la fuente de verdad histórica de la realidad física.
- `certifiable_qty` es una derivación de autoridad operacional basada en verificaciones aprobadas.
- Cero mutaciones en sentido inverso hacia la planificación o el POA contractual.

## Consecuencias
- La capa de verificación operacional actúa como filtro de calidad sobre la realidad física sin mutar los registros históricos de ejecución.
- Garantiza trazabilidad completa de evidencia antes de la transferencia de datos hacia la certificación contractual.
