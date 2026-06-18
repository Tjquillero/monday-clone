/**
 * Worker capacity per site/group, extracted from:
 * "CRONOGRAMA OPERACION 2025 V-2 SEGUIMIENTO EJECUCION" → sheet "DETALLE DE GRUPO"
 * 
 * daily_capacity = total workers available per working day (= max jornales per day)
 * zv = Zonas Verdes workers, zd = Zonas Duras workers, zp = Zona Playa workers
 */

export interface SiteCapacity {
  zv: number;   // green zone workers
  zd: number;   // hard zone workers
  zp: number;   // beach zone workers
  daily_capacity: number; // total jornales available per day
}

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

/**
 * Get capacity for a site group title (case-insensitive, partial match).
 */
export function getSiteCapacity(groupTitle: string): SiteCapacity | null {
  const upper = groupTitle.toUpperCase().trim();
  // Exact match first
  for (const [key, val] of Object.entries(SITE_CAPACITY)) {
    if (key.toUpperCase() === upper) return val;
  }
  // Partial match
  for (const [key, val] of Object.entries(SITE_CAPACITY)) {
    if (upper.includes(key.toUpperCase()) || key.toUpperCase().includes(upper)) return val;
  }
  return null;
}

/**
 * Given a list of items (activities) and the site capacity,
 * compute the total jornales required for today (based on FREC and working day),
 * and determine which activities can be done today vs need redistribution.
 * 
 * Algorithm:
 *  1. Filter items due today (FREC-based)
 *  2. Sort by jornal requirement (smallest first, to fit as many as possible)
 *  3. Assign activities until daily_capacity is filled
 *  4. Remaining activities are "deferred to next available day"
 */
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
  // Calculate jornales for each item
  const withJornales = items.map(item => {
    const cant = parseFloat(item.values['cant']) || 0;
    const rend = parseFloat(item.values['rend']) || 1;
    const frec = parseFloat(item.values['frec']) || 25;
    const totalJornales = rend > 0 ? cant / rend : 0;
    // Daily jornales = total / (frequency in 25 days) or total if daily
    const jornalesPerOccurrence = frec >= 25 ? totalJornales / 25 : totalJornales / Math.max(1, frec);
    return { ...item, jornalesPerOccurrence };
  });

  // Sort: items with fewer jornales needed first (greedy approach to maximize activities done)
  const sorted = [...withJornales].sort((a, b) => a.jornalesPerOccurrence - b.jornalesPerOccurrence);

  const capacity = siteCapacity.daily_capacity;
  const scheduledToday: typeof items = [];
  const deferred: typeof items = [];
  let capacityUsed = 0;
  let totalRequired = 0;

  for (const item of sorted) {
    totalRequired += item.jornalesPerOccurrence;
    if (capacityUsed + item.jornalesPerOccurrence <= capacity + 0.5) { // 0.5 tolerance
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
