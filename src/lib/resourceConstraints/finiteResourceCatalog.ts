/**
 * Catálogo y Servicio de Recursos Finitos (FASE 3 Hito 1)
 *
 * Servicio puro de consulta y resolución de recursos finitos y dependencias de disponibilidad.
 *
 * Invariantes Congeladas:
 * - R-FIN-01: No inferencia histórica (K:AOA no determina existencia de recursos).
 * - R-FIN-02: Identidad única por UUID/ID estable.
 * - R-FIN-03: Persona != capacidad.
 * - R-FIN-04: Máquina != operador.
 * - R-FIN-05: Dependencia explícita (disponibilidad efectiva = máquina AND operador).
 * - R-FIN-06: Disponibilidad != asignación != consumo (0 funciones de asignación).
 * - R-FIN-07: Capacidad Y != jornales requeridos X.
 * - R-FIN-08: Cero modificación retrospectiva de contratos congelados.
 */

import type {
  FinitePerson,
  FiniteCrew,
  FiniteMachinery,
  MachineryEffectiveAvailability,
  SiteResourceState,
} from './types';

/**
 * Normaliza el rol para comparaciones robustas de elegibilidad de operador (R-FIN-05)
 */
export function normalizeOperatorRole(role: string): string {
  const r = (role || '').toUpperCase().trim();
  if (r.includes('TRACTOR')) return 'TRACTORISTA';
  if (r.includes('VOLQUETA') || r.includes('CONDUCTOR')) return 'CONDUCTOR_VOLQUETA';
  if (r.includes('GUADAÑA') || r.includes('GUADAÑADOR')) return 'GUADAÑADOR';
  if (r.includes('MINICARGADOR') || r.includes('OPERADOR')) return 'OPERADOR_EQUIPO';
  return r;
}

/**
 * Evalúa la disponibilidad efectiva de una maquinaria considerando sus dependencias
 * de operadores capacitados disponibles (R-FIN-04 & R-FIN-05).
 */
export function evalMachineryEffectiveAvailability(
  machinery: FiniteMachinery,
  availablePersons: FinitePerson[]
): MachineryEffectiveAvailability {
  // 1. Verificar si la máquina física está disponible
  if (!machinery.isAvailable) {
    return {
      machineryId: machinery.id,
      machineryCode: machinery.code,
      machineryName: machinery.name,
      siteGroupId: machinery.siteGroupId,
      isMachineAvailable: false,
      operatorRequirement: machinery.operatorRequirement,
      hasEligibleOperators: false,
      eligibleOperatorIds: [],
      effectiveStatus: 'UNAVAILABLE_MACHINE',
      reason: `La maquinaria ${machinery.code} (${machinery.name}) está fuera de servicio o indisponible.`,
    };
  }

  // 2. Si no requiere operador especializado (ej. herramienta manual sin restricción de rol)
  if (!machinery.operatorRequirement) {
    return {
      machineryId: machinery.id,
      machineryCode: machinery.code,
      machineryName: machinery.name,
      siteGroupId: machinery.siteGroupId,
      isMachineAvailable: true,
      operatorRequirement: null,
      hasEligibleOperators: true,
      eligibleOperatorIds: [],
      effectiveStatus: 'FULLY_AVAILABLE',
      reason: `Maquinaria ${machinery.code} totalmente disponible (no requiere operador especializado).`,
    };
  }

  // 3. Evaluar la disponibilidad de operadores elegibles (R-FIN-05)
  const reqRole = normalizeOperatorRole(machinery.operatorRequirement.requiredRole);
  const requiredCount = machinery.operatorRequirement.operatorCount;

  const eligiblePersons = availablePersons.filter((p) => {
    if (!p.isAvailable) return false;
    // Si la máquina pertenece a un sitio específico, priorizar personas del sitio o globales
    if (machinery.siteGroupId && p.siteGroupId && p.siteGroupId !== machinery.siteGroupId) {
      return false;
    }
    const personRole = normalizeOperatorRole(p.role);
    return personRole === reqRole || personRole === 'OPERARIO_POLIVALENTE' || personRole === 'OPERADOR_EQUIPO';
  });

  const eligibleOperatorIds = eligiblePersons.map((p) => p.id);
  const hasEnoughOperators = eligiblePersons.length >= requiredCount;

  if (hasEnoughOperators) {
    return {
      machineryId: machinery.id,
      machineryCode: machinery.code,
      machineryName: machinery.name,
      siteGroupId: machinery.siteGroupId,
      isMachineAvailable: true,
      operatorRequirement: machinery.operatorRequirement,
      hasEligibleOperators: true,
      eligibleOperatorIds,
      effectiveStatus: 'FULLY_AVAILABLE',
      reason: `Maquinaria ${machinery.code} plenamente disponible con ${eligiblePersons.length} operador(es) elegible(s) (requeridos: ${requiredCount}).`,
    };
  }

  return {
    machineryId: machinery.id,
    machineryCode: machinery.code,
    machineryName: machinery.name,
    siteGroupId: machinery.siteGroupId,
    isMachineAvailable: true,
    operatorRequirement: machinery.operatorRequirement,
    hasEligibleOperators: false,
    eligibleOperatorIds,
    effectiveStatus: 'UNAVAILABLE_OPERATOR',
    reason: `Maquinaria ${machinery.code} físicamente disponible pero indisponible efectivamente: Faltan operadores capacitados (requeridos: ${requiredCount} con rol ${machinery.operatorRequirement.requiredRole}, disponibles: ${eligiblePersons.length}).`,
  };
}

/**
 * Resuelve el estado de recursos de un sitio físico específico (R-FIN-02 & R-FIN-06)
 */
export function getSiteResourceState(
  siteGroupId: string,
  siteName: string,
  allPersons: FinitePerson[],
  allCrews: FiniteCrew[],
  allMachinery: FiniteMachinery[]
): SiteResourceState {
  const sitePersons = allPersons.filter((p) => p.siteGroupId === siteGroupId);
  const siteCrews = allCrews.filter((c) => c.siteGroupId === siteGroupId);
  // Incluye maquinaria adscrita al sitio o maquinaria de flota concesional (siteGroupId === null)
  const siteMachinery = allMachinery.filter(
    (m) => m.siteGroupId === siteGroupId || m.siteGroupId === null
  );

  const machineryAvailability = siteMachinery.map((m) =>
    evalMachineryEffectiveAvailability(m, allPersons)
  );

  const totalPersonsCount = sitePersons.length;
  const totalAvailablePersonsCount = sitePersons.filter((p) => p.isAvailable).length;
  const totalMachineryCount = siteMachinery.length;
  const fullyAvailableMachineryCount = machineryAvailability.filter(
    (ma) => ma.effectiveStatus === 'FULLY_AVAILABLE'
  ).length;

  return {
    siteGroupId,
    siteName,
    persons: sitePersons,
    crews: siteCrews,
    machinery: siteMachinery,
    machineryAvailability,
    totalPersonsCount,
    totalAvailablePersonsCount,
    totalMachineryCount,
    fullyAvailableMachineryCount,
  };
}

/**
 * Evalúa el catálogo global de recursos finitos agrupado por sitios (R-FIN-01 → R-FIN-08)
 */
export function evaluateGlobalResourceCatalog(
  sites: Array<{ id: string; title: string }>,
  allPersons: FinitePerson[],
  allCrews: FiniteCrew[],
  allMachinery: FiniteMachinery[]
): SiteResourceState[] {
  return sites.map((s) => getSiteResourceState(s.id, s.title, allPersons, allCrews, allMachinery));
}
