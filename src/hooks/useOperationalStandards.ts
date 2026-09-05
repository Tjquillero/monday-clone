'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import {
  OperationalStandard,
  OperationalScopeMapping,
  OPERATIONAL_STANDARDS_CATALOG_V3,
  OPERATIONAL_SCOPE_MAPPINGS_V3,
  normalizeSiteKey,
} from '@/lib/operationalStandards';

/**
 * Hook aislado que devuelve los Estándares Operativos de Campo (V3)
 * para el ResourceAnalysisWidget.
 *
 * Invariante Absoluto (ADR-0010):
 * Este hook NO consulta board_activity_standards, poa_activities, poaCatalog
 * ni ninguna tabla del Scheduler Contractual.
 */
export function useOperationalStandards(siteName?: string) {
  const siteKey = normalizeSiteKey(siteName || 'puerto_colombia');

  return useQuery({
    queryKey: ['operational_activity_standards', siteKey],
    queryFn: async (): Promise<OperationalStandard[]> => {
      const { data, error } = await supabase
        .from('operational_activity_standards')
        .select('*')
        .eq('site_key', siteKey);

      // Si la tabla aún no tiene filas para este sitio, usa el catálogo V3 oficial
      if (error || !data || data.length === 0) {
        return OPERATIONAL_STANDARDS_CATALOG_V3.filter(
          s => s.site_key === siteKey || s.site_key === 'puerto_colombia'
        );
      }

      return data as OperationalStandard[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook aislado para los Mapeos Operativos de Alcance (V3).
 */
export function useOperationalScopeMappings(siteName?: string) {
  const siteKey = normalizeSiteKey(siteName || 'puerto_colombia');

  return useQuery({
    queryKey: ['operational_scope_mappings', siteKey],
    queryFn: async (): Promise<OperationalScopeMapping[]> => {
      const { data, error } = await supabase
        .from('operational_scope_mappings')
        .select('*')
        .eq('site_key', siteKey);

      if (error || !data || data.length === 0) {
        return OPERATIONAL_SCOPE_MAPPINGS_V3.filter(
          m => m.site_key === siteKey || m.site_key === 'puerto_colombia'
        );
      }

      return data as OperationalScopeMapping[];
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}
