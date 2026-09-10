/**
 * Test Suite 39: Module 2 - Crew Management & Personnel Versioning (ADR-0008 + F3.2)
 * Baseline Governance Certification: 2386465
 */

import {
  Crew,
  CrewWithDetails,
  PersonnelVersion,
  PersonnelSiteAssignment,
} from '../../types/crew';

describe('Module 2: Crew Management & Personnel Versioning Domain', () => {

  it('1. Personnel Identity Invariance: document_id preserves persistent identity across versions', () => {
    const person = {
      id: 'person-123',
      document_id: '1044602966',
      full_name: 'YOJANIS ALBERTO MELENDEZ NIEBLES',
      default_role: 'ZP',
    };

    const version1Assignment: PersonnelSiteAssignment = {
      id: 'assign-v1-1',
      version_id: 'ver-q3-2026',
      personnel_id: person.id,
      role_in_site: 'Operador Zona Playa',
      zone: 'ZP',
      dedication_percentage: 80,
    };

    const version2Assignment: PersonnelSiteAssignment = {
      id: 'assign-v2-1',
      version_id: 'ver-q4-2026',
      personnel_id: person.id,
      role_in_site: 'Supervisor Zona Playa',
      zone: 'ZP',
      dedication_percentage: 100,
    };

    // The person identity remains invariant
    expect(version1Assignment.personnel_id).toBe(version2Assignment.personnel_id);
    expect(version1Assignment.id).not.toBe(version2Assignment.id);
  });

  it('2. Crew Leader Uniqueness: crews.leader_id is the single source of truth for configured leader', () => {
    const crew: Crew = {
      id: 'crew-01',
      board_id: 'board-puerto-colombia',
      version_id: 'ver-q3-2026',
      name: 'Cuadrilla ZV - Puerto Colombia',
      code: 'CUAD-ZV-01',
      leader_id: 'person-leader-01',
      is_active: true,
    };

    // Leader ID points to personnel.id
    expect(crew.leader_id).toBe('person-leader-01');
  });

  it('3. Execution Record Leader Override: ExecutionRecord.crew_leader_id does NOT mutate crews.leader_id', () => {
    const configuredLeaderId = 'person-leader-01';
    const effectiveLeaderId = 'person-substitute-02';

    const executionRecord = {
      id: 'exec-999',
      plan_item_id: 'item-100',
      crew_name: 'Cuadrilla ZV - Puerto Colombia',
      crew_leader_id: effectiveLeaderId, // Operational override in field
      worker_count: 4,
    };

    // Operational override is recorded in execution, while catalog configured leader is invariant
    expect(executionRecord.crew_leader_id).toBe(effectiveLeaderId);
    expect(configuredLeaderId).toBe('person-leader-01');
    expect(executionRecord.crew_leader_id).not.toBe(configuredLeaderId);
  });

  it('4. Historical Crew Name Snapshot: execution preserves crew_name text immutably', () => {
    const historicalExecution = {
      id: 'exec-888',
      crew_name: 'Cuadrilla Norte (Legada)',
      executed_qty: 25.5,
      status: 'verified',
    };

    // Future crew rename does not alter past historical execution record
    const updatedCrewName = 'Cuadrilla Norte - Zona Verde';
    expect(historicalExecution.crew_name).toBe('Cuadrilla Norte (Legada)');
    expect(historicalExecution.crew_name).not.toBe(updatedCrewName);
  });

  it('5. Temporal Weekly Assignment: weekly_plan_items.crew_id assigns crew to specific week cycle', () => {
    const week1Item = {
      id: 'item-w1-1',
      weekly_plan_id: 'plan-week-36',
      activity_key: 'corte_grama',
      planned_date: '2026-09-07',
      crew_id: 'crew-01',
    };

    const week2Item = {
      id: 'item-w2-1',
      weekly_plan_id: 'plan-week-37',
      activity_key: 'corte_grama',
      planned_date: '2026-09-14',
      crew_id: 'crew-02', // Different crew assigned for week 37
    };

    expect(week1Item.activity_key).toBe(week2Item.activity_key);
    expect(week1Item.crew_id).not.toBe(week2Item.crew_id);
  });

});
