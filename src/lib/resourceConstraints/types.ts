/**
 * Tipos y Contratos del Catálogo y Modelo de Restricciones de Simultaneidad (FASE 3 Hito 2)
 *
 * Invariantes Congeladas:
 * - R-FIN-01 a R-FIN-08: Recursos Finitos y Soberanía del Catálogo.
 * - R-RES-01: Exclusividad de recurso (0 ocupaciones simultáneas).
 * - R-RES-02: Satisfacción de dependencias (Máquina + Operador libre).
 * - R-RES-03: No sobreposición de operadores en distintas actividades.
 * - R-RES-04: Requerimiento multi-recurso por actividad.
 * - R-RES-05: Evaluación sobre intervalos semánticos [start, end).
 * - R-RES-06: Conflicto de simultaneidad != déficit de jornales.
 * - R-RES-07: Soberanía de validación actual (K:AOA no resuelve conflictos).
 * - R-RES-08: VALIDAR CONFLICTO != RESOLVER CONFLICTO (0 auto-resolución, 0 mutación).
 */

export type FiniteResourceType = 'PERSON' | 'CREW' | 'MACHINERY';

export interface FinitePerson {
  id: string; // ID estable (UUID o ID de personal) (R-FIN-02)
  documentId: string;
  name: string;
  role: string; // ej. 'OPERARIO', 'TRACTORISTA', 'LÍDER', 'GUADAÑADOR'
  isAvailable: boolean;
  siteGroupId: string | null;
}

export interface FiniteCrew {
  id: string; // ID estable (R-FIN-02)
  name: string;
  code: string | null;
  leaderId: string | null;
  memberIds: string[];
  siteGroupId: string;
  isAvailable: boolean;
}

export interface MachineryOperatorRequirement {
  requiredRole: string; // ej. 'TRACTORISTA', 'CONDUCTOR_VOLQUETA', 'GUADAÑADOR'
  operatorCount: number; // Número de operadores requeridos por máquina
}

export interface FiniteMachinery {
  id: string; // ID estable (R-FIN-02)
  code: string; // ej. 'TR-001', 'VQ-002'
  name: string; // ej. 'Tractor Agrícola 1'
  category: 'TRACTOR' | 'VOLQUETA' | 'MINICARGADOR' | 'GUADAÑA' | 'EQUIPO_MENOR';
  siteGroupId: string | null; // null si pertenece a flota global de la concesión
  simultaneousLimit: number; // Límite de operación simultánea
  operatorRequirement: MachineryOperatorRequirement | null;
  isAvailable: boolean;
}

export interface MachineryEffectiveAvailability {
  machineryId: string;
  machineryCode: string;
  machineryName: string;
  siteGroupId: string | null;
  isMachineAvailable: boolean;
  operatorRequirement: MachineryOperatorRequirement | null;
  hasEligibleOperators: boolean;
  eligibleOperatorIds: string[];
  effectiveStatus: 'FULLY_AVAILABLE' | 'UNAVAILABLE_MACHINE' | 'UNAVAILABLE_OPERATOR' | 'PARTIALLY_AVAILABLE';
  reason: string;
}

export interface SiteResourceState {
  siteGroupId: string;
  siteName: string;
  persons: FinitePerson[];
  crews: FiniteCrew[];
  machinery: FiniteMachinery[];
  machineryAvailability: MachineryEffectiveAvailability[];
  totalPersonsCount: number;
  totalAvailablePersonsCount: number;
  totalMachineryCount: number;
  fullyAvailableMachineryCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del Hito 2 (Restricciones de Simultaneidad y Exclusividad Temporal)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResourceTimeInterval {
  dateIso: string; // 'YYYY-MM-DD'
  startTime?: string; // 'HH:mm' (inclusivo)
  endTime?: string; // 'HH:mm' (exclusivo, semántica [start, end))
  isDailyExclusive?: boolean; // true si ocupa la jornada del día de forma exclusiva
}

export interface ResourceDemandAllocation {
  allocationId: string; // ID estable de asignación
  siteGroupId: string;
  siteName: string;
  activityKey: string;
  activityDescription: string;
  resourceType: FiniteResourceType;
  resourceId: string; // ID estable de recurso (R-RES-01 & R-FIN-02)
  resourceCodeOrName: string;
  requiredRole?: string;
  interval: ResourceTimeInterval;
  quantity: number;
  jornales: number;
  origin?: {
    sourceSheet?: string;
    sourceRow?: number;
    colOpLetter?: string;
    colCantLetter?: string;
    siteName?: string;
    np?: string;
    activityDescription?: string;
  };
}

export type ResourceConflictType =
  | 'RESOURCE_OVERLAP_COLLISION'
  | 'UNSATISFIED_OPERATOR_DEPENDENCY'
  | 'SIMULTANEOUS_LIMIT_EXCEEDED'
  | 'UNRESOLVED_RESOURCE';

export interface ResourceSimultaneityConflict {
  id: string; // ID sintáctico determinista
  conflictType: ResourceConflictType;
  resourceId: string;
  conflictingResourceId?: string;
  allocationA: ResourceDemandAllocation;
  allocationB?: ResourceDemandAllocation;
  overlapStart?: string;
  overlapEnd?: string;
  reason: string;
}

export interface SimultaneityValidationResult {
  isValid: boolean;
  totalDemandsEvaluated: number;
  conflictsCount: number;
  conflicts: ResourceSimultaneityConflict[];
  summary: {
    resourceOverlapCount: number;
    unsatisfiedDependencyCount: number;
    simultaneousLimitExceededCount: number;
    unresolvedResourceCount: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del Hito 3 (Modelo de Asignación Temporal de Recursos)
// ─────────────────────────────────────────────────────────────────────────────

export interface MachineryOperatorBinding {
  machineryAllocationId: string;
  machineryId: string;
  operatorAllocationId: string | null;
  operatorId: string | null;
  requiredRole: string;
  isSatisfied: boolean;
}

export interface ResourceTemporalAllocation {
  allocationId: string; // ID estable de la asignación
  demandId: string; // ID de la demanda satisfecha (R-ALLOC-03)
  siteGroupId: string;
  siteName: string;
  activityKey: string;
  activityDescription: string;
  resourceId: string; // ID estable de recurso (R-ALLOC-01)
  resourceType: FiniteResourceType; // PERSON | CREW | MACHINERY
  resourceCodeOrName: string;
  interval: ResourceTimeInterval; // Franja semántica [start, end) (R-ALLOC-02)
  quantity: number;
  jornales: number;
  machineryOperatorBinding?: MachineryOperatorBinding; // Dependencia explícita (R-ALLOC-04)
  contractualReference?: string; // Trazabilidad POA / K:AOA (R-ALLOC-06)
  origin?: {
    sourceSheet?: string;
    sourceRow?: number;
    colOpLetter?: string;
    colCantLetter?: string;
    siteName?: string;
    np?: string;
    activityDescription?: string;
  };
}

export type AllocationIssueType =
  | 'MISSING_STABLE_IDENTITY'
  | 'MISSING_TIME_INTERVAL'
  | 'INVALID_INTERVAL_SEMANTICS'
  | 'UNBOUND_OPERATOR_DEPENDENCY'
  | 'CARDINALITY_DUPLICATION'
  | 'SIMULTANITY_COLLISION_HITO2'
  | 'CATALOG_RESOURCE_NOT_FOUND';

export interface AllocationValidationIssue {
  id: string;
  issueType: AllocationIssueType;
  allocationId: string;
  resourceId: string;
  reason: string;
}

export interface AllocationSovereigntySummary {
  totalAllocations: number;
  validAllocationsCount: number;
  invalidAllocationsCount: number;
  satisfiedDependenciesCount: number;
  unsatisfiedDependenciesCount: number;
  simultaneityConflictsCount: number;
}

export interface AllocationTemporalValidationResult {
  isValid: boolean;
  totalAllocationsEvaluated: number;
  issuesCount: number;
  issues: AllocationValidationIssue[];
  simultaneityValidation: SimultaneityValidationResult;
  sovereigntySummary: AllocationSovereigntySummary;
}

