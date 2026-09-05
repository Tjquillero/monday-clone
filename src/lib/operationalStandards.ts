/**
 * Resource Analysis V3 — Isolated Operational Standards Catalog
 *
 * Architecture Invariant (ADR-0010 Decoupling):
 * This module is STRICTLY ISOLATED from board_activity_standards, poaCatalog, and
 * the Contractual Scheduler.
 *
 * Source of Truth: COSTOS GENERALES (V3).xlsx (Operaciones)
 */

export interface OperationalStandard {
  id: string;
  site_key: string;
  activity_key: string;
  name: string;
  category: 'ZONA VERDE' | 'ZONA DURA' | 'ZONA DE PLAYA';
  unit: string;
  rendimiento: number;
  frecuencia: number;
}

export interface OperationalScopeMapping {
  site_key: string;
  activity_key: string;
  scope_key: string;
}

export type OperationalActivityRule = {
  id: string;
  name: string;
  unit: string;
  rend: number;
  freq: number;
  category: 'ZONA VERDE' | 'ZONA DURA' | 'ZONA DE PLAYA';
};

// =============================================================================
// CATALOGO OPERATIVO V3 (COSTOS GENERALES V3.xlsx)
// =============================================================================

export const OPERATIONAL_STANDARDS_CATALOG_V3: OperationalStandard[] = [
  // ---------------------------------------------------------------------------
  // PLAZA PUERTO COLOMBIA (site_key: puerto_colombia)
  // Matching COSTOS GENERALES (V3).xlsx Active Calculation Rows (H16:H29 + H49:H51)
  // ---------------------------------------------------------------------------
  // ZONA VERDE
  { id: 'pc-poda-arboles', site_key: 'puerto_colombia', activity_key: 'poda_arboles', name: 'Poda Arboles y Palmas', category: 'ZONA VERDE', unit: 'Und/día', rendimiento: 200, frecuencia: 75 },
  { id: 'pc-poda-arbustos', site_key: 'puerto_colombia', activity_key: 'poda_arbustos', name: 'Poda Arbustos y CS', category: 'ZONA VERDE', unit: 'm2/día', rendimiento: 1200, frecuencia: 12.5 },
  { id: 'pc-mtto-cama', site_key: 'puerto_colombia', activity_key: 'mtto_cama_siembra', name: 'CONTROL DE MALEZAS MECANICA DE ARBUSTOS Y CUBRESUELOS', category: 'ZONA VERDE', unit: 'm2/día', rendimiento: 600, frecuencia: 6.25 },
  { id: 'pc-limpieza-general', site_key: 'puerto_colombia', activity_key: 'limpieza_general_zv', name: 'Limpieza General', category: 'ZONA VERDE', unit: 'm2/día', rendimiento: 7500, frecuencia: 2.083 },
  { id: 'pc-riego-arboles', site_key: 'puerto_colombia', activity_key: 'riego_arboles', name: 'Riego general Arboles y Palmas', category: 'ZONA VERDE', unit: 'und/día', rendimiento: 480, frecuencia: 3.125 },
  { id: 'pc-riego-arbustos', site_key: 'puerto_colombia', activity_key: 'riego_arbustos', name: 'Riego general Arbusto, Cubresuelos y grama', category: 'ZONA VERDE', unit: 'm2/día', rendimiento: 3500, frecuencia: 2.083 },
  { id: 'pc-tc-insecticida-arb', site_key: 'puerto_colombia', activity_key: 'tc_insecticida_arb', name: 'TC INSECTICIDA Y FUNGICIDA ARB', category: 'ZONA VERDE', unit: 'Und/día', rendimiento: 240, frecuencia: 50 },
  { id: 'pc-tc-fungicida-cs', site_key: 'puerto_colombia', activity_key: 'tc_fungicida_cs', name: 'SUMINISTRO Y APLICACIÓN DE FUNGICIDAS E INSECTICIDAS SEGÚN CONTROL FITOSANITARIO PARA ARBUSTOS, CUBRESUELOS', category: 'ZONA VERDE', unit: 'm2/día', rendimiento: 2000, frecuencia: 50 },
  { id: 'pc-tc-herbicida-grama', site_key: 'puerto_colombia', activity_key: 'tc_herbicida_grama', name: 'TC HERBICIDA GRAMA', category: 'ZONA VERDE', unit: 'm2/día', rendimiento: 2400, frecuencia: 50 },
  { id: 'pc-fertil-arboles', site_key: 'puerto_colombia', activity_key: 'fertil_arboles', name: 'FERTIL ARB Y PALMAS Compost', category: 'ZONA VERDE', unit: 'Und/día', rendimiento: 240, frecuencia: 150 },
  { id: 'pc-fertil-arbustos', site_key: 'puerto_colombia', activity_key: 'fertil_arbustos', name: 'FERTIL ARBUST Y CUBRESUELOS', category: 'ZONA VERDE', unit: 'm2/día', rendimiento: 3500, frecuencia: 150 },
  { id: 'pc-fertil-grama', site_key: 'puerto_colombia', activity_key: 'fertil_grama', name: 'FERTIL GRAMA', category: 'ZONA VERDE', unit: 'm2/día', rendimiento: 3500, frecuencia: 150 },

  // ZONA DURA
  { id: 'pc-limpieza-zd', site_key: 'puerto_colombia', activity_key: 'limpieza_zonas_duras', name: 'Limpieza General zonas duras', category: 'ZONA DURA', unit: 'm2/día', rendimiento: 10000, frecuencia: 1 },
  { id: 'pc-limpieza-marmol', site_key: 'puerto_colombia', activity_key: 'limpieza_marmol', name: 'Limpieza general mármol', category: 'ZONA DURA', unit: 'm2/día', rendimiento: 600, frecuencia: 1 },

  // ZONA DE PLAYA
  { id: 'pc-acopio-limpieza-playa', site_key: 'puerto_colombia', activity_key: 'acopio_limpieza_playa', name: 'Acopio y limpieza manual', category: 'ZONA DE PLAYA', unit: 'm2/día', rendimiento: 3000, frecuencia: 25 },
  { id: 'pc-arrume-tractor', site_key: 'puerto_colombia', activity_key: 'arrume_tractor', name: 'Arrume con tractor (trasiego)', category: 'ZONA DE PLAYA', unit: 'm2/día', rendimiento: 5000, frecuencia: 4 },
  { id: 'pc-corte-troncos', site_key: 'puerto_colombia', activity_key: 'corte_troncos', name: 'Corte de troncos', category: 'ZONA DE PLAYA', unit: 'Und/día', rendimiento: 30, frecuencia: 4 },
];

// Mapeos explícitos 1:1 entre ScopeKey y Actividades Operativas V3
export const OPERATIONAL_SCOPE_MAPPINGS_V3: OperationalScopeMapping[] = [
  // Puerto Colombia Scope Mappings
  { site_key: 'puerto_colombia', activity_key: 'poda_arboles', scope_key: 'arboles' },
  { site_key: 'puerto_colombia', activity_key: 'poda_arbustos', scope_key: 'arbustos' },
  { site_key: 'puerto_colombia', activity_key: 'mtto_cama_siembra', scope_key: 'total_paisajismo' },
  { site_key: 'puerto_colombia', activity_key: 'limpieza_general_zv', scope_key: 'total_paisajismo' },
  { site_key: 'puerto_colombia', activity_key: 'riego_arboles', scope_key: 'arboles' },
  { site_key: 'puerto_colombia', activity_key: 'riego_arbustos', scope_key: 'arbustos' },
  { site_key: 'puerto_colombia', activity_key: 'riego_arbustos', scope_key: 'grama' },
  { site_key: 'puerto_colombia', activity_key: 'tc_insecticida_arb', scope_key: 'arboles' },
  { site_key: 'puerto_colombia', activity_key: 'tc_fungicida_cs', scope_key: 'arbustos' },
  { site_key: 'puerto_colombia', activity_key: 'tc_herbicida_grama', scope_key: 'grama' },
  { site_key: 'puerto_colombia', activity_key: 'fertil_arboles', scope_key: 'arboles' },
  { site_key: 'puerto_colombia', activity_key: 'fertil_arbustos', scope_key: 'arbustos' },
  { site_key: 'puerto_colombia', activity_key: 'fertil_grama', scope_key: 'grama' },
  { site_key: 'puerto_colombia', activity_key: 'limpieza_zonas_duras', scope_key: 'zona_dura' },
  { site_key: 'puerto_colombia', activity_key: 'limpieza_marmol', scope_key: 'limpieza_marmol' },
  { site_key: 'puerto_colombia', activity_key: 'acopio_limpieza_playa', scope_key: 'zona_playa' },
  { site_key: 'puerto_colombia', activity_key: 'arrume_tractor', scope_key: 'trasiego_playa' },
  { site_key: 'puerto_colombia', activity_key: 'corte_troncos', scope_key: 'corte_troncos' },
];

/**
 * Normaliza nombres de sitio para búsqueda idempotente en el catálogo V3
 */
export function normalizeSiteKey(siteName: string): string {
  const s = (siteName || '').toLowerCase().trim();
  if (s.includes('puerto colombia') || s.includes('plaza puerto')) return 'puerto_colombia';
  if (s.includes('manglares')) return 'playa_manglares';
  if (s.includes('gastronomico') || s.includes('centro')) return 'centro_gastronomico';
  if (s.includes('sazon') || s.includes('mercado')) return 'mercado_sazon';
  if (s.includes('miramar')) return 'playa_miramar';
  if (s.includes('country 1')) return 'country_1';
  if (s.includes('country 2')) return 'country_2';
  if (s.includes('salinas')) return 'salinas_rey';
  if (s.includes('veronica') || s.includes('sendero')) return 'santa_veronica';
  if (s.includes('castillo') || s.includes('salgar')) return 'castillo_salgar';
  return 'puerto_colombia';
}

/**
 * Construye el mapa Record<scope_key, OperationalActivityRule[]> exclusivamente
 * desde el catálogo operativo V3, con garantía absoluta de desacople del POA.
 */
export function buildOperationalActivityMappings(
  standards: OperationalStandard[] = OPERATIONAL_STANDARDS_CATALOG_V3,
  mappings: OperationalScopeMapping[] = OPERATIONAL_SCOPE_MAPPINGS_V3,
  siteName: string = 'puerto_colombia',
): Record<string, OperationalActivityRule[]> {
  const targetSiteKey = normalizeSiteKey(siteName);

  const siteStandards = standards.filter(s => s.site_key === targetSiteKey || s.site_key === 'puerto_colombia');
  const siteMappings = mappings.filter(m => m.site_key === targetSiteKey || m.site_key === 'puerto_colombia');

  const scopeByKey = new Map<string, string[]>();
  for (const m of siteMappings) {
    const keys = scopeByKey.get(m.activity_key) ?? [];
    keys.push(m.scope_key);
    scopeByKey.set(m.activity_key, keys);
  }

  const result: Record<string, OperationalActivityRule[]> = {};

  for (const s of siteStandards) {
    if (s.rendimiento <= 0 || s.frecuencia <= 0) continue;
    const targetScopes = scopeByKey.get(s.activity_key) ?? [];

    for (const scopeKey of targetScopes) {
      (result[scopeKey] ??= []).push({
        id: s.id,
        name: s.name,
        unit: s.unit,
        rend: s.rendimiento,
        freq: s.frecuencia,
        category: s.category,
      });
    }
  }

  return result;
}
