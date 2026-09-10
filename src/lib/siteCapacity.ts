/**
 * Motor de Resolución Dinámica de Capacidad Operativa de Sitio (Módulo 3)
 *
 * Principios de Dominio:
 * 1. `groups` (Master Catalog de los 26 grupos) es la fuente de VERDAD de Identidad de Sitio.
 * 2. `personnel_site_assignments` es la fuente de VERDAD de Capacidad (Y = conteo de personas adscritas).
 * 3. `resource_analysis` es la fuente de VERDAD de Demanda Teórica (JR_mes y X).
 * 4. Sitio existente en `groups` con 0 personal adscrito -> Resultado Operacional Válido (daily_capacity = 0).
 * 5. Sitio inexistente en `groups` -> Error de Resolución (RESOLUTION_ERROR), NUNCA 0 JR silenciosamente válido.
 */

export interface SiteGroup {
  id: string;
  title: string;
}

export interface SiteIdentity {
  id: string;
  title: string;
}

export interface DynamicSiteCapacity {
  siteId: string;
  siteTitle: string;
  assignedPersonnelCount: number; // Y_pers
  daily_capacity: number; // Y_pers JR/día
  weekly_capacity: number; // Y_pers * dias_habiles_reales
  status: 'VALID' | 'RESOLUTION_ERROR';
  source: 'PERSONNEL_ASSIGNMENTS';
}

/**
 * Resuelve la identidad de un sitio contra el catálogo maestro `groups`.
 * Retorna null si el sitio no existe en `groups`.
 */
export function resolveSiteIdentity(
  siteIdOrTitle: string,
  masterGroups: SiteGroup[]
): SiteIdentity | null {
  if (!siteIdOrTitle || !masterGroups || masterGroups.length === 0) return null;
  const target = siteIdOrTitle.trim();
  const targetUpper = target.toUpperCase();

  // 1. Coincidencia exacta por ID (UUID)
  const byId = masterGroups.find((g) => g.id === target);
  if (byId) return { id: byId.id, title: byId.title };

  // 2. Coincidencia exacta por Título (case insensitive)
  const byTitleExact = masterGroups.find((g) => g.title.toUpperCase().trim() === targetUpper);
  if (byTitleExact) return { id: byTitleExact.id, title: byTitleExact.title };

  return null;
}

/**
 * Resuelve la capacidad dinámica a partir de un sitio con identidad validada y su conteo de adscripciones reales.
 */
export function resolveSiteCapacity(
  identity: SiteIdentity | null,
  assignedPersonnelCount: number,
  workingDays: number = 5
): DynamicSiteCapacity {
  if (!identity) {
    return {
      siteId: '',
      siteTitle: '',
      assignedPersonnelCount: 0,
      daily_capacity: 0,
      weekly_capacity: 0,
      status: 'RESOLUTION_ERROR',
      source: 'PERSONNEL_ASSIGNMENTS',
    };
  }

  const count = Math.max(0, assignedPersonnelCount);
  const effectiveDays = Math.max(0, workingDays);

  return {
    siteId: identity.id,
    siteTitle: identity.title,
    assignedPersonnelCount: count,
    daily_capacity: count,
    weekly_capacity: count * effectiveDays,
    status: 'VALID',
    source: 'PERSONNEL_ASSIGNMENTS',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPATIBILIDAD CON LEGADO (2025 Hardcoded SITE_CAPACITY Map)
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteCapacity {
  zv: number;   // green zone workers
  zd: number;   // hard zone workers
  zp: number;   // beach zone workers
  daily_capacity: number; // total jornales available per day
}

/** @deprecated Mantener solo para fixtures de tests descontextualizados */
export const SITE_CAPACITY: Record<string, SiteCapacity> = {
  'PLAZA PUERTO COLOMBIA':   { zv: 1,   zd: 3, zp: 4,   daily_capacity: 8  },
  'PLAYA MANGLARES':         { zv: 0.3, zd: 0, zp: 3.7, daily_capacity: 4  },
  'MANGLARES':               { zv: 0.3, zd: 0, zp: 3.7, daily_capacity: 4  },
  'CENTRO GASTRONÓMICO':     { zv: 1,   zd: 9, zp: 0,   daily_capacity: 10 },
  'CENTRO GASTRONOMICO':     { zv: 1,   zd: 9, zp: 0,   daily_capacity: 10 },
  'MIRAMAR SECTOR EL FARO':  { zv: 2,   zd: 2, zp: 0,   daily_capacity: 4  },
  'PLAYA MIRAMAR':           { zv: 2,   zd: 2, zp: 0,   daily_capacity: 4  },
  'PLAYA DEL COUNTRY':       { zv: 1,   zd: 1, zp: 5,   daily_capacity: 7  },
  'COUNTRY 1':               { zv: 1,   zd: 1, zp: 5,   daily_capacity: 7  },
  'PLAYA DE SABANILLA 2':    { zv: 1,   zd: 1, zp: 2,   daily_capacity: 4  },
  'COUNTRY 2':               { zv: 1,   zd: 1, zp: 2,   daily_capacity: 4  },
  'SALINAS DEL REY':         { zv: 1,   zd: 1, zp: 3,   daily_capacity: 5  },
  'SALINAS REY':             { zv: 1,   zd: 1, zp: 3,   daily_capacity: 5  },
  'SENDERO SANTA VERÓNICA':  { zv: 1,   zd: 2, zp: 0,   daily_capacity: 3  },
  'SENDERO SANTA VERONICA':  { zv: 1,   zd: 2, zp: 0,   daily_capacity: 3  },
};

/** @deprecated Usar resolveSiteIdentity + resolveSiteCapacity */
export function getSiteCapacity(groupTitle: string): SiteCapacity | null {
  const upper = groupTitle.toUpperCase().trim();
  for (const [key, val] of Object.entries(SITE_CAPACITY)) {
    if (key.toUpperCase() === upper) return val;
  }
  for (const [key, val] of Object.entries(SITE_CAPACITY)) {
    if (upper.includes(key.toUpperCase()) || key.toUpperCase().includes(upper)) return val;
  }
  return null;
}

export function planDailyActivities(
  items: Array<{ id: string | number; name: string; values: Record<string, any> }>,
  siteCapacity: SiteCapacity,
  workingDayOfMonth: number
): {
  scheduledToday: typeof items;
  deferred: typeof items;
  totalJornalesRequired: number;
  capacityUsed: number;
  overloaded: boolean;
} {
  const withJornales = items.map(item => {
    const cant = parseFloat(item.values['cant']) || 0;
    const rend = parseFloat(item.values['rend']) || 1;
    const frec = parseFloat(item.values['frec']) || 25;
    const totalJornales = rend > 0 ? cant / rend : 0;
    const jornalesPerOccurrence = frec >= 25 ? totalJornales / 25 : totalJornales / Math.max(1, frec);
    return { ...item, jornalesPerOccurrence };
  });

  const sorted = [...withJornales].sort((a, b) => a.jornalesPerOccurrence - b.jornalesPerOccurrence);

  const capacity = siteCapacity.daily_capacity;
  const scheduledToday: typeof items = [];
  const deferred: typeof items = [];
  let capacityUsed = 0;
  let totalRequired = 0;

  for (const item of sorted) {
    totalRequired += item.jornalesPerOccurrence;
    if (capacityUsed + item.jornalesPerOccurrence <= capacity + 0.5) {
      scheduledToday.push(item);
      capacityUsed += item.jornalesPerOccurrence;
    } else {
      deferred.push(item);
    }
  }

  return {
    scheduledToday,
    deferred,
    totalJornalesRequired: Math.round(totalRequired * 100) / 100,
    capacityUsed: Math.round(capacityUsed * 100) / 100,
    overloaded: totalRequired > capacity,
  };
}
