# Definición y Reglas del Dominio: Curaduría de Evidencia y Presentación en Actas (Evidence Curation & Acta Presentation Domain v1)

## Estado
**Congelado v1 (2026-09-03).** El modelo de curaduría de evidencia documental, recomendación determinística reproducible, separación estricta entre evidencia operacional y evidencia presentada, selección por actividad, congelamiento inmutable post-emisión del Acta (`ISSUED`) y fronteras negativas con el Núcleo Contractual quedan formalmente consolidados.

---

## Principio Rector
> [!IMPORTANT]
> **Toda evidencia de campo se conserva; solo la mejor evidencia representa la ejecución en el Acta.**
> La captura en terreno genera evidencia operacional completa (inmutable y nunca eliminada). La curaduría genera una selección documental por actividad para el informe del Acta, sin alterar jamás las cantidades, fechas, jornadas ni valores del Núcleo Contractual.

---

## Arquitectura de Capas de Evidencia

```
CAPA A · CONTRACTUAL CORE v1
POA → Schedule → Execution → Certification → Billing
                    │
                    │ autoridad
                    ▼
CAPA B · OPERATIONAL CORE v1
                    │
Offline → Evidence → Crew → Supervision → Incidents
                    │
                    │ operacional (100% conservado)
                    ▼
CAPA C · PRODUCTIZACIÓN (REPRESENTACIÓN DOCUMENTAL)
                    │
         Evidence Curation Domain v1
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   Recomendación          Selección humana
   automática             Supervisor / Admin
  (Motor v1 reproducible)      │
          │                   │
          └─────────┬─────────┘
                    ▼
              Acta / Informe (ISSUED = Frozen Snapshot)
```

---

## Glosario y Estructura del Dominio

- **Evidencia Operacional Completa (`execution_attachments`)**: Colección bruta e inalterable de todos los adjuntos (fotos/documentos) capturados en campo durante una ejecución.
- **Evidencia Documental Curada (`acta_curated_evidence`)**: Entidad independiente de selección que vincula una ejecución/ítem de Acta con los adjuntos elegidos para la representación en el informe.
- **Motor de Recomendación (`curation_engine_version`)**: Identificador de versión del algoritmo de recomendación (`deterministic-v1`, `vision-ai-v1`).
- **Vector de Curaduría**: Estado formal de cada evidencia respecto al proceso:
  $$\text{Vector} = \langle \text{valid}, \text{relevant}, \text{redundant}, \text{representative}, \text{recommended}, \text{selected}, \text{presented\_in\_acta} \rangle$$
- **Snapshot de Presentación (`acta_evidence_snapshots`)**: Fotografía histórica inmutable de las evidencias seleccionadas y presentadas al momento de emitir el Acta (`status = 'issued'`).

---

## Las 8 Reglas de Negocio e Invariantes del Dominio

### 1. Separación Estricta de Persistencia
La selección o deselección para el Acta **nunca modifica la tabla `execution_attachments`**.
- La evidencia operacional se conserva en un 100%. Las 47 fotos capturadas en campo siguen existiendo en `execution_attachments` con su hash SHA-256.
- La curaduría vive en una entidad separada (`acta_curated_evidence`), evitando cualquier mutación de la historia operativa de campo.

### 2. Curaduría Obligatoria por Actividad (Per-Activity Allocation)
La recomendación y selección de fotografías se realiza **exclusivamente a nivel de actividad/ejecución (`execution_id` / `acta_item_id`)**, nunca en forma global por Acta.
- Si un Acta contiene 25 actividades, cada actividad evalúa y selecciona su propio subconjunto documental (ej. 2 a 3 fotos por actividad).
- Se prohíbe la acumulación global de fotografías que favorezca actividades vistosas en perjuicio de otras.

### 3. Reproducibilidad de la Recomendación y Versionado del Motor
El algoritmo de recomendación debe ser **100% reproducible**:
$$\text{attachments} + \text{rules}(V_{\text{engine}}) \longrightarrow \text{mismas recomendaciones}$$
- Toda recomendación almacena obligatoriamente `curation_engine_version = "deterministic-v1"`, `recommendation_score`, `recommendation_reasons` y `recommended_at`.
- Si el motor evoluciona a IA en el futuro, los registros históricos conservan la versión del motor con la que fueron evaluados originalmente.

### 4. Algoritmo Determinístico v1 (Scoring Contract)
El motor determinístico v1 evalúa los adjuntos de una actividad bajo los siguientes criterios cuantitativos:
1. **Deduplicación por SHA-256 (`file_hash`)**: Adjuntos con hash binario idéntico reciben penalización por redundancia (`redundant = true`).
2. **Balance de Fase (`before` / `after`)**: Se otorga bonificación (+30 pts) al par coordinado de fotografías `before` y `after`.
3. **Presencia de Georreferenciación (GPS)**: Coordenadas GPS válidas otorgan (+20 pts).
4. **Nitidez / Calidad (`sharpness_score`)**: Puntuación de calidad fotográfica aporta de +0 a +25 pts.
5. **Distribución Temporal**: Espaciamiento adecuado entre tomas otorga hasta +15 pts.

### 5. Capa de Selección Humana Consciente
La recomendación del sistema **no constituye certificación ni selección automática**.
- El motor propone las top $N$ evidencias recomendadas (`recommended = true`).
- El Supervisor o Administrador realiza la selección final consciente ($K$ fotografías elegidas).
- El usuario puede aceptar la sugerencia o seleccionar manualmente entre las 47 evidencias operacionales de la actividad.

### 6. Ciclo DRAFT $\rightarrow$ ISSUED y Snapshot Inmutable
- **En estado `DRAFT`**: El supervisor puede modificar libremente la selección documental (`acta_curated_evidence`) de cada actividad del Acta.
- **Al ejecutar `issue_acta()`**: Se genera un **Snapshot Inmutable (`acta_evidence_snapshots`)** que congela la selección documental, rutas de Storage, hashes SHA-256, metadatos y puntuaciones.
- Una vez emitida el Acta (`ISSUED`), queda prohibida la edición o alteración de la evidencia documental presentada.

### 7. Frontera Negativa Inviolable (Contractual Core Isolation)
La curaduría y selección de evidencias pertenece al universo documental y **no puede modificar bajo ninguna circunstancia**:
- `planned_qty`
- `executed_qty`
- `planned_jr`
- `executed_jr`
- `worker_count`
- `poa_id` / `version_id`
- `unit_price` / `tarifa`
- `status` (de ejecución o certificación)
- `cantidad_facturada`

### 8. Audibilidad Bidireccional
El dominio garantiza responder en todo momento dos preguntas fundamentales de auditoría:
1. **"¿Por qué esta fotografía aparece en el Acta?"**: Respondiendo con la selección explícita del supervisor, el score y las razones del motor de curaduría (`deterministic-v1`).
2. **"¿Qué otras evidencias existían cuando se certificó esta ejecución?"**: Permitiendo consultar la totalidad de la evidencia operacional almacenada en `execution_attachments` para esa misma actividad.
