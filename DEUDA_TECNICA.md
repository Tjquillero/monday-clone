# Deuda Técnica - Referencias Legacy a Columnas del Tablero

Este documento detalla el estado actual de los accesos directos o referencias "hardcoded" a columnas de tableros. Como parte de la congelación del **Board Engine v1 Stable**, se ha completado la refactorización y centralización del módulo financiero, y se documenta el estado de deuda técnica de los módulos restantes para evitar modificaciones preventivas.

## Estado de Centralización del Módulo Financiero
- **Estado:** ✅ **COMPLETADO y UNIFICADO**.
- **Detalle:** Todos los widgets financieros (`BudgetExecutionWidget`, `CostDeviationWidget`, `FinancialWidget`, `SCurveWidget`) y la vista principal (`FinancialTableView`) consumen y resuelven sus datos exclusivamente mediante la utilidad centralizada [financialUtils.ts](file:///c:/desarrollo/monday-clone/src/utils/financialUtils.ts). No existen búsquedas duplicadas por título de columna o resolución ad-hoc de llaves dentro de este módulo.

## Accesos Legacy Pendientes por Normalizar (Otros Módulos)

Los siguientes componentes continúan utilizando lógica directa sobre `item.values` o buscando tipos de columna de forma aislada. Deberán refactorizarse únicamente cuando un requerimiento funcional del roadmap de negocio o un bug lo exija:

### 1. Reportes y Plantillas
- **Archivo:** `src/components/reports/BoardReportTemplate.ts` (o similar)
  - *Detalle:* Las vistas de reportes asumen la presencia de columnas específicas por tipo/nombre y aplican formatos fijos a campos como fechas y estados.

### 2. Vista de Calendario
- **Componente:** `src/components/views/CalendarViewContainer.tsx` (o equivalente)
  - *Detalle:* El calendario busca llaves estáticas como `date` o `timeline` para ubicar eventos en lugar de consultar de manera genérica el tipo de columna del tablero.

### 3. Vista de Evaluación (Assessment) y KPIs
- **Componente:** `src/components/views/AssessmentViewContainer.tsx` (o equivalente)
  - *Detalle:* Mapeos e interpretación de campos directamente acoplados a columnas creadas por plantilla inicial.

### 4. Vista de Gráficos (ChartView)
- **Componente:** `src/components/views/ChartViewContainer.tsx`
  - *Detalle:* Los ejes de graficación se configuran interpretando llaves dinámicas a nivel local. Sería ideal en el futuro exponer un resolvedor de series similar al de finanzas.

## Lineamientos de Trabajo
1. Ningún desarrollo nuevo de negocio debe replicar la búsqueda de columnas por título.
2. Si se requiere leer datos financieros fuera del módulo financiero, se debe importar y utilizar `getFinancialValues(item, columns)`.
