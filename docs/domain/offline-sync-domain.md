# Definición y Reglas del Dominio: Ejecución Offline y Sincronización (Offline Execution & Synchronization Domain v1)

## Estado
**Congelado v1 (2026-09-02).** El modelo de captura offline en dispositivos móviles, preservación de identificador único, idempotencia de sincronización y aislamiento de autoridad contractual quedan formalmente consolidados.

## Principio Fundamental Rector
> [!IMPORTANT]
> **Offline permite capturar la realidad; no permite redefinirla ni certificarla.**
> La autoridad de certificación y elegibilidad de facturación reside exclusivamente en PostgreSQL. Un dispositivo móvil en modo desconectado no puede otorgar estado `verified` ni forzar elegibilidad de cobro.

---

## Glosario y Conceptos del Dominio
- **Captura Offline**: Registro local de una jornada de terreno (`executed_qty`, `execution_date`, `started_at`, `finished_at`, `worker_count`, `notes`, `file_hash`) realizado en IndexedDB sin conexión a internet.
- **Identificador Cliente (UUID v4)**: `execution_id` generado en el cliente al momento de la captura local. Se conserva inalterado durante todo el ciclo hasta PostgreSQL.
- **Cola de Comandos de Dominio (`domain_commands`)**: Almacén local de intenciones de negocio (`REPORT_EXECUTION`, `UPLOAD_ATTACHMENT`) indexadas por el `command_id` / `execution_id`.
- **Cola de Evidencias (`pending_attachments`)**: Almacén local de Blobs fotográficos indexados por `execution_id` + `file_hash`.

---

## Las 7 Reglas de Negocio e Invariantes del Dominio

### 1. Invariante de Identidad Única
Una ejecución creada en modo offline conserva exactamente el mismo UUID v4 durante todo el trayecto:
$$\text{Dispositivo} \longrightarrow \text{IndexedDB} \longrightarrow \text{Sync Queue} \longrightarrow \text{RPC} \longrightarrow \text{PostgreSQL}$$
El servidor **nunca** genera un nuevo UUID sustituto para una ejecución reportada desde el cliente.

### 2. Idempotencia Absoluta de Sincronización
Múltiples reintentos de red o envíos duplicados del mismo comando:
$$\text{sync}(\text{execution\_X}) + \text{sync}(\text{execution\_X}) + \dots \implies 1 \text{ registro en PostgreSQL}$$
Garantizado mediante `ON CONFLICT (id) DO UPDATE` / `DO NOTHING` a nivel de base de datos.

### 3. Orden Temporal y Resolución de Conflictos
- **Server-State Wins on Status**: Si en PostgreSQL la ejecución ya pasó a `status IN ('verified', 'rejected')` por acción del supervisor, cualquier actualización local tardía proveniente del móvil en estado `draft` / `reported` **es rechazada**.
- **Client-State Wins on Draft Data**: Si la ejecución sigue en estado `draft` o `reported`, la sincronización actualiza únicamente datos físicos y observaciones.

### 4. Trazabilidad Inequívoca de Evidencias
- Cada adjunto (`pending_attachments`) se vincula de forma única a `execution_id` + `file_hash` (SHA-256).
- La sincronización se realiza en dos fases atómicas:
  1. Subida del Blob a Supabase Storage (`storage_path`).
  2. Inserción en `execution_attachments`.
- Un archivo no se considera sincronizado hasta existir exitosamente en ambas capas.

### 5. Ciclo de Vida y Transiciones de Estado
```
[Local Capture] ──► status: 'draft' (IndexedDB)
                         │
                         ▼ (Sync Queue)
[Sincronizado]  ──► status: 'reported' (PostgreSQL)
                         │
                         ▼ verify_execution() [Solo Supervisor Online]
[Certificado]   ──► status: 'verified' (PostgreSQL) ──► Billing Eligible
```

### 6. Prohibición de Auto-Certificación Offline
Un usuario en terreno o líder de cuadrilla no puede auto-aprobar ejecuciones ni cambiar el estado a `verified` mientras esté desconectado. La verificación exige la ejecución del RPC `verify_execution()` por un supervisor autorizado con conexión a PostgreSQL.

### 7. Invariante de Integridad Contractual
Ninguna mutación realizada en modo offline puede alterar el Plan Semanal (`weekly_plans`), la versión activa del POA (`poa_versions`) ni las tarifas contractuales. La captura offline registra exclusivamente datos de ejecución física.
