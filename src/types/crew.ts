/**
 * Types & Domain Helpers for Module 2: Crew Management & Personnel Versioning
 * Baseline: 2386465 + ADR-0007..ADR-0012 + F3.1 (4084bcb)
 */

export interface PersonnelVersion {
  id: string;
  board_id: string;
  version_name: string;
  is_active: boolean;
  effective_from: string; // YYYY-MM-DD
  created_at?: string;
  updated_at?: string;
}

export interface PersonnelSiteAssignment {
  id: string;
  version_id: string;
  personnel_id: string;
  role_in_site?: string | null;
  zone: string; // 'ZV' | 'ZD' | 'ZP' | 'GENERAL'
  dedication_percentage: number; // 1..100
  daily_rate_override?: number | null;
  created_at?: string;
  updated_at?: string;

  // Joined relations (optional)
  personnel_name?: string;
  personnel_document_id?: string;
}

export interface Crew {
  id: string;
  board_id: string;
  version_id?: string | null;
  name: string;
  code?: string | null;
  leader_id?: string | null; // ÚNICA autoridad de liderazgo configurado en catálogo
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CrewMember {
  id: string;
  crew_id: string;
  personnel_assignment_id: string; // FK to personnel_site_assignments.id
  created_at?: string;
}

export interface CrewWithDetails extends Crew {
  leader_name?: string | null;
  members_count?: number;
  members?: Array<{
    id: string; // crew_member id
    personnel_assignment_id: string;
    personnel_id: string;
    full_name: string;
    role_in_site?: string | null;
    zone: string;
  }>;
}
