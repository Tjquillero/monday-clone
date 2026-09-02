# Definición y Reglas del Dominio: Supervisión y Certificación de Campo (Mobile Supervision Domain v1)

## Estado
**Congelado v1 (2026-09-02).** El modelo de supervisión técnica de campo, autoridad de certificación, validación de evidencia y ciclo de vida de rechazo quedan formalmente consolidados.

## Principio Rector
> [!IMPORTANT]
> **Supervisar no es editar la realidad. Supervisar es certificar si la realidad reportada cumple las reglas de aceptación.**
> El supervisor no altera ni edita silenciosamente la cantidad ejecutada (`executed_qty`) reportada por la cuadrilla. Aprueba (`verify_execution`) o rechaza (`reject_execution`) la jornada reportada de forma transparente. Si la cantidad o evidencia es disconforme, la rechaza con motivo documentado.

---

## Glosario y Autoridad de Supervisión
- **Supervisor Técnico**: Usuario con rol `supervisor` o `admin` asignado al tablero en `board_members`.
- **Transición de Verificación (`verify_execution`)**: Avance terminal `reported` $\rightarrow$ `verified`. Registra `verified_by` y `verified_at`.
- **Transición de Rechazo (`reject_execution`)**: Avance terminal `reported` $\rightarrow$ `rejected`. Requiere `rejection_notes` obligatorio.
- **Autoridad Server-Authoritative**: Las funciones de supervisión son `SECURITY DEFINER` en PostgreSQL. La interfaz móvil delega el 100% del control de acceso a la base de datos.

---

## Las 7 Reglas de Negocio e Invariantes del Dominio

### 1. Prohibición de Edición Silenciosa durante la Certificación
El supervisor no cuenta con atribución para modificar `executed_qty`, `execution_date`, `crew_name` o `worker_count` durante la verificación. Si el reporte en campo no coincide con la realidad o carece de evidencias válidas, la jornada debe ser **rechazada**.

### 2. Autoridad Exclusiva de Servidor (Server-Authoritative RLS & RPC)
- La verificación y el rechazo exigen la invocación explícita de `verify_execution(p_execution_id)` o `reject_execution(p_execution_id, p_notes)`.
- Ambas funciones evalúan la autorización con `can_verify_execution(board_id, user_id)` en PostgreSQL.
- Se prohíbe la "auto-verificación offline" en el cliente móvil.

### 3. Requisito de Evidencia Mínima Obligatoria
Una ejecución no puede pasar al estado `verified` si no satisface las reglas de evidencia fotográfica/documental requeridas para el plan o la actividad.

### 4. Terminalidad del Rechazo (`REJECTED`)
- El estado `rejected` es **terminal e inmutable**. Una jornada rechazada no se reabre ni se edita.
- Para corregir el trabajo, el líder de cuadrilla debe registrar una **NUEVA ejecución** en estado `draft` / `reported`.
- El motivo del rechazo (`rejection_notes`) permanece inalterable y visible para auditoría.

### 5. Inmediata Elegibilidad de Facturación
Al momento de pasar a `verified`, si el Plan Semanal asociado está en estado `confirmed` o `closed`, la ejecución entra automáticamente al saldo facturable consumible por `generate_acta_draft()`.

### 6. Isolation Contractual Absoluta
La supervisión de campo valida exclusivamente el evento físico de terreno. **No altera en ningún caso**:
- Tarifas ni versiones activas del POA (`poa_versions`).
- Metas contractuales ni frecuencias del Plan Semanal (`planned_qty`, `planned_jr`).
- Precios unitarios snapshots ni actas ya emitidas (`ISSUED`).

### 7. Trazabilidad Imborrable de Autoría
Toda verificación graba la identidad exacta del usuario autenticado (`verified_by = auth.uid()`) y el reloj del servidor (`verified_at = NOW()`). Ningún administrador puede borrar o suplantar la marca de autoría del supervisor.
