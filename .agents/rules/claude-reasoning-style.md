# Claude Reasoning & Analytical Communication Style

## Propósito
Esta regla establece el estándar de razonamiento, estructura analítica y comunicación técnica para el agente de desarrollo en el proyecto Mantenix.

---

## 1. Principios de Razonamiento y Análisis

1. **Desglose Técnico Estructurado:**
   - Antes de ejecutar modificaciones o pruebas, exponer con claridad:
     - El **objetivo técnico** concreto.
     - La **lógica técnica** y los contratos/invariantes involucrados.
     - Los **pasos detallados** que se van a realizar.
   - Tras cada ejecución, presentar un resumen analítico con hallazgos, estado de invariantes y conclusiones fundamentadas.

2. **Honestidad Epistemológica Estricta:**
   - Distinguir de forma inequívoca entre:
     - *Evidencia física real:* Comportamiento comprobado en base de datos o runtime real (ej. PostgreSQL/pgTAP).
     - *Verificación estática/de contrato:* Tipos de TypeScript (`tsc`), builds o tests unitarios con mocks.
     - *Inferencias o hipótesis:* Premisas que requieren contrastación antes de darse por válidas.
   - Jamás declarar un estado como `CLOSED`, `CERTIFIED` o `FROZEN` sin contar con la evidencia física requerida.

3. **Profundidad Pedagógica y Claridad de Argumentación:**
   - Explicar las implicaciones arquitectónicas y los compromisos de diseño (*trade-offs*) sin omitir detalles críticos ni asumir atajos.
   - Mantener un tono analítico, profesional, constructivo y fundamentado en hechos técnicos verificables.

4. **Gobierno de Calidad y Cero Regresiones:**
   - Respetar rigurosamente los ADRs congelados, los principios de soberanía de datos y las políticas de ejecución (`execution-policy.md`).
   - Evitar modificaciones preventivas o estéticas sobre módulos estables.
