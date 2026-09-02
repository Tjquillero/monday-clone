# Definición y Reglas del Dominio: Evidencia e Integridad de Adjuntos (Evidence & Attachment Integrity Domain v1)

## Estado
**Congelado v1 (2026-09-02).** El modelo de integridad de evidencia fotográfica, hashing SHA-256, separación explícita de los tres relojes de tiempo, inmutabilidad post-certificación y reconciliación determinista ante fallos de red quedan formalmente consolidados.

## Principio Rector
> [!IMPORTANT]
> **La evidencia soporta la certificación; no la otorga por sí misma.**
> La presencia de una fotografía válida con GPS y SHA-256 no cambia automáticamente el estado a `verified` ni la vuelve facturable. Toda certificación exige la decisión consciente del supervisor mediante la invocación de `verify_execution()`.

---

## Glosario y Estructura de la Evidencia
- **Adjunto de Ejecución (`execution_attachments`)**: Registro en base de datos vinculando una foto/documento con una ejecución física (`execution_id`).
- **Fase de la Evidencia (`phase`)**: Clasificación operativa inmodificable: `before` (previo a la intervención) o `after` (posterior).
- **Hash de Contenido (`file_hash`)**: Firma criptográfica SHA-256 del contenido binario de la imagen (`SHA-256(file_bytes)`).
- **Storage Object (`storage_path`)**: Ubicación física del archivo en el Bucket seguro de Supabase Storage.

---

## Las 7 Reglas de Negocio e Invariantes del Dominio

### 1. Modelo de los Tres Relojes de Tiempo (Temporal Separation)
Toda evidencia registra en forma independiente y transparente tres marcas temporales que no deben confundirse:
$$\text{captured\_at} \neq \text{uploaded\_at} \neq \text{verified\_at}$$
- **`captured_at`**: Timestamptz del dispositivo cuando la foto fue tomada en terreno (móvil).
- **`created_at / uploaded_at`**: Timestamptz del servidor al completar la subida a Storage e inserción en base de datos.
- **`verified_at`**: Timestamptz del servidor cuando el supervisor ejecutó la RPC `verify_execution()`.

### 2. Integridad de Contenido por Hash SHA-256
Un cambio en un solo byte del archivo altera el `file_hash` e invalida la firma de evidencia. Si el cliente intenta subir un adjunto con el mismo `file_hash` para la misma ejecución, la base de datos **rechaza el duplicado** por restricción de unicidad (`ON CONFLICT DO NOTHING`).

### 3. Inmutabilidad Absoluta Post-Certificación (`VERIFIED` / `REJECTED`)
Una vez la ejecución vinculada alcanza el estado `verified` o `rejected`:
- No se pueden agregar nuevos adjuntos a esa ejecución.
- No se pueden eliminar (`DELETE`) ni editar (`UPDATE`) los adjuntos existentes.
- La tabla `execution_attachments` opera sin política RLS de `UPDATE` (deny-by-default por arquitectura).

### 4. Idempotencia y Reconciliación Determinista ante Caídas Intermedias
Ante una desconexión o fallo de sistema en el cliente:
$$\text{Storage Upload: SUCCESS} \longrightarrow \text{Caída de Conexión / Crash} \longrightarrow \text{INSERT DB: PENDIENTE}$$
1. `pending_attachments.storage_path` almacena la ruta de Storage tan pronto la subida del Blob tiene éxito.
2. Al reanudar la sincronización, la app detecta que `storage_path` ya existe, **evitando re-subir Blobs duplicados a Storage**.
3. Si el registro ya existe en `execution_attachments` (verificado por `file_hash` o `storage_path`), se marca inmediatamente como `sincronizado` sin crear filas duplicadas.

### 5. Trazabilidad de Pertenencia Inequívoca
Todo adjunto pertenece exactamente a una ejecución:
$$\text{attachment.execution\_id} = \text{execution.id}$$
Está prohibido desvincular un adjunto para asociarlo a otra ejecución distinta.

### 6. Clasificación Inmodificable de Fase (`before` / `after`)
La fase se selecciona en terreno al momento de tomar la fotografía. Se graba de forma inmutable durante la inserción inicial y no puede editarse posteriormente para satisfacer filtros o sugerencias de la IA.

### 7. Evidencia No Altera la Historia Financiera o Contractual
Los archivos de evidencia no almacenan precios, frecuencias, tarifas ni montos de dinero ($). Soporta la validación física de campo, dejando intocado el motor contractual.
