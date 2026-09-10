/**
 * Mapeador Semántico y Modelo Intermedio Temporal (FASE 2 Hito 2)
 *
 * Mapea las asignaciones temporales puras de parseTemporalExcel.ts a la
 * estructura conceptual de Mantenix, vinculando los sitios a groups.id
 * sin alterar la solución de referencia inmutable.
 *
 * Invariantes Estrictas:
 * - parseTemporalExcel.ts permanece intacto (consumidor puro).
 * -groups.id es la identidad maestra de sitio (0 aliasing silencioso).
 * - Trazabilidad de actividad por código/NP sin fuzzy matching destructivo.
 * - Identidad de fecha ISO conservada.
 * - Separación explícita de recursos (Operador != Maquinaria).
 * - Distinción de estados: celda vacía vs 0 vs no resuelto vs entidad financiera.
 * - Cero modificación de contratos congelados (Gateway V6, F3.1, weekly_plans, weekly_plan_items).
 */

import type {
  TemporalScheduleParseResult,
  MappedTemporalScheduleResult,
  MappedTemporalActivity,
  MappedTemporalAllocation,
  ParsedTemporalAllocation,
  MappedSiteIdentity,
  TemporalParseWarning,
} from './types';

export const FINANCIAL_ENTITY_NAMES = [
  'PRESUPUESTO GENERAL',
  'TRACTOR',
  'RAN',
  'VOLQUETA',
  'SUPERVISOR',
  'OFICIAL (ELECTRICO)',
  'OFICIAL ELECTRICO',
];

/**
 * Resuelve la identidad maestra de un sitio a partir del catálogo de groups
 * de Mantenix. Retorna MappedSiteIdentity con resolución explícita (0 aliasing).
 */
export function resolveSiteIdentity(
  excelSiteName: string,
  availableGroups: Array<{ id: string; title: string }>
): MappedSiteIdentity {
  const rawName = (excelSiteName || '').trim();
  const upperName = rawName.toUpperCase();

  // 1. Detección de Entidad Financiera o Equipamiento (I-OP-01 & Separación Operacional)
  if (FINANCIAL_ENTITY_NAMES.some((fe) => upperName === fe || upperName.startsWith(fe))) {
    return {
      groupId: null,
      excelSiteName: rawName,
      matchedTitle: 'PRESUPUESTO GENERAL',
      resolutionStatus: 'EXCLUDED_FINANCIAL',
    };
  }

  // 2. Coincidencia exacta por title de group (case-insensitive)
  const exactMatch = availableGroups.find(
    (g) => g.title.trim().toUpperCase() === upperName
  );
  if (exactMatch) {
    return {
      groupId: exactMatch.id,
      excelSiteName: rawName,
      matchedTitle: exactMatch.title,
      resolutionStatus: 'RESOLVED',
    };
  }

  // 3. Coincidencia por alias oficial de catálogo maestro
  const aliasMatch = availableGroups.find((g) => {
    const gTitleUpper = g.title.trim().toUpperCase();
    if (upperName.includes('COUNTRY') && gTitleUpper.includes('COUNTRY')) return true;
    if (upperName.includes('SABANILLA') && gTitleUpper.includes('SABANILLA')) return true;
    if (upperName.includes('PUERTO COLOMBIA') && gTitleUpper.includes('PUERTO COLOMBIA')) return true;
    if (upperName.includes('SALINAS') && gTitleUpper.includes('SALINAS')) return true;
    if (upperName.includes('MANGLARES') && gTitleUpper.includes('MANGLARES')) return true;
    if (upperName.includes('MIRAMAR') && gTitleUpper.includes('MIRAMAR')) return true;
    if ((upperName.includes('GASTRONOMICO') || upperName.includes('GASTRONÓMICO') || upperName.includes('SAZON') || upperName.includes('SAZÓN')) &&
        (gTitleUpper.includes('GASTRONÓMICO') || gTitleUpper.includes('GASTRONOMICO') || gTitleUpper.includes('SAZÓN') || gTitleUpper.includes('SAZON'))) {
      return true;
    }
    if ((upperName.includes('VERONICA') || upperName.includes('VERÓNICA')) &&
        (gTitleUpper.includes('VERÓNICA') || gTitleUpper.includes('VERONICA'))) {
      return true;
    }
    return false;
  });

  if (aliasMatch) {
    return {
      groupId: aliasMatch.id,
      excelSiteName: rawName,
      matchedTitle: aliasMatch.title,
      resolutionStatus: 'RESOLVED',
    };
  }

  // 4. Si no se puede resolver inequívocamente: UNRESOLVED (NO inventar un group_id ni aliasing silencioso)
  return {
    groupId: null,
    excelSiteName: rawName,
    matchedTitle: null,
    resolutionStatus: 'UNRESOLVED',
  };
}

/**
 * Mapea el resultado parseado de K:AOA al modelo semántico intermedio de Mantenix.
 */
export function mapTemporalScheduleToDomain(
  parsedResult: TemporalScheduleParseResult,
  availableGroups: Array<{ id: string; title: string }>
): MappedTemporalScheduleResult {
  const sitesMap = new Map<string, MappedSiteIdentity>();
  const mappedActivities: MappedTemporalActivity[] = [];
  const warnings: TemporalParseWarning[] = [...parsedResult.warnings];

  let totalMappedAllocations = 0;
  let totalQuantity = 0;
  let totalOperatorJornales = 0;
  let totalMachineryJornales = 0;
  let resolvedSitesCount = 0;
  let unresolvedSitesCount = 0;
  let excludedFinancialSitesCount = 0;

  // 1. Resolver identidades de sitios únicos
  for (const siteName of parsedResult.sites) {
    const siteId = resolveSiteIdentity(siteName, availableGroups);
    sitesMap.set(siteName, siteId);

    if (siteId.resolutionStatus === 'RESOLVED') {
      resolvedSitesCount++;
    } else if (siteId.resolutionStatus === 'UNRESOLVED') {
      unresolvedSitesCount++;
      warnings.push({
        excelRow: 0,
        type: 'header_mismatch',
        message: `El sitio "${siteName}" no pudo ser resuelto contra ningún grupo activo en groups.id. Se marca como UNRESOLVED.`,
        details: { excelSiteName: siteName },
      });
    } else if (siteId.resolutionStatus === 'EXCLUDED_FINANCIAL') {
      excludedFinancialSitesCount++;
    }
  }

  // 2. Mapear cada actividad y sus asignaciones diarias
  for (const parsedAct of parsedResult.activities) {
    const siteId = sitesMap.get(parsedAct.siteName) || resolveSiteIdentity(parsedAct.siteName, availableGroups);
    const activityKey = String(parsedAct.np ?? '0');

    let actSumQuantity = 0;
    let actSumOpJornales = 0;
    let actSumMaqJornales = 0;

    const mappedAllocations: MappedTemporalAllocation[] = parsedAct.allocations.map((alloc: ParsedTemporalAllocation) => {
      totalMappedAllocations++;

      let operatorJornales = 0;
      let machineryJornales = 0;

      // Separación de Recursos: Operador != Maquinaria
      if (alloc.resourceType === 'machinery') {
        machineryJornales = alloc.jornales;
      } else if (alloc.resourceType === 'operator') {
        operatorJornales = alloc.jornales;
      } else if (alloc.resourceType === 'mixed') {
        // Mixed: 50% operario / 50% maquinaria si aplica
        operatorJornales = alloc.jornales / 2;
        machineryJornales = alloc.jornales / 2;
      }

      actSumQuantity += alloc.quantity;
      actSumOpJornales += operatorJornales;
      actSumMaqJornales += machineryJornales;

      totalQuantity += alloc.quantity;
      totalOperatorJornales += operatorJornales;
      totalMachineryJornales += machineryJornales;

      return {
        id: alloc.id,
        site: siteId,
        activityKey,
        activityDescription: parsedAct.activityDescription,
        date: alloc.date,
        resourceType: alloc.resourceType,
        quantity: alloc.quantity,
        operatorJornales,
        machineryJornales,
        totalJornales: alloc.jornales,
        isEmptyCell: alloc.isEmptyCell,
        isZeroValue: alloc.isZeroValue,
        origin: alloc.origin,
      };
    });

    mappedActivities.push({
      excelRow: parsedAct.excelRow,
      site: siteId,
      activityKey,
      activityDescription: parsedAct.activityDescription,
      unit: parsedAct.unit,
      headers: parsedAct.headers,
      allocations: mappedAllocations,
      activeAllocationsCount: parsedAct.activeAllocationsCount,
      sumQuantity: actSumQuantity,
      sumOperatorJornales: actSumOpJornales,
      sumMachineryJornales: actSumMaqJornales,
      sumTotalJornales: actSumOpJornales + actSumMaqJornales,
      reconciliation: parsedAct.reconciliation,
    });
  }

  const totalJornales = totalOperatorJornales + totalMachineryJornales;

  return {
    sheetName: parsedResult.sheetName,
    parsedResult,
    sites: Array.from(sitesMap.values()),
    activities: mappedActivities,
    resolvedSitesCount,
    unresolvedSitesCount,
    excludedFinancialSitesCount,
    totalMappedAllocations,
    summary: {
      totalQuantity,
      totalOperatorJornales,
      totalMachineryJornales,
      totalJornales,
      reconciledCantCount: parsedResult.summary.reconciledCantCount,
      reconciledJornalesCount: parsedResult.summary.reconciledJornalesCount,
      discrepancyCount: parsedResult.summary.discrepancyCount,
    },
    warnings,
  };
}
