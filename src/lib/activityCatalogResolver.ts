import budgetData from '@/data/budget_seed.json';

const staticCatalogMap = new Map<string, string>();

function getCatalogMap(): Map<string, string> {
  if (staticCatalogMap.size === 0 && Array.isArray(budgetData)) {
    budgetData.forEach((item: any) => {
      if (item.code && item.name) {
        const cleanName = item.name.replace(/^[0-9.]+\s*/, '').trim();
        staticCatalogMap.set(String(item.code).trim(), cleanName || item.name);
      }
    });
  }
  return staticCatalogMap;
}

/**
 * Resuelve el nombre descriptivo completo de una actividad a partir de su clave técnica.
 * Prioridad:
 * 1. Estándar dinámico configurado en board_activity_standards (customStandardsMap).
 * 2. Catálogo contractual oficial consolidado (budgetData).
 * 3. Fallback limpio sobre la clave.
 */
export function resolveActivityDescriptiveName(
  activityKey: string | undefined | null,
  customStandardsMap?: Map<string, string>
): string {
  if (!activityKey) return 'Actividad Operativa';
  const key = String(activityKey).trim();
  
  if (customStandardsMap && customStandardsMap.has(key)) {
    const rawCustom = customStandardsMap.get(key)?.trim() || '';
    const cleanCustom = rawCustom.replace(/^[0-9.]+\s*/, '').trim();
    if (cleanCustom.length > 0 && !/^[0-9.]+$/.test(cleanCustom)) {
      return cleanCustom;
    }
  }

  const catalogMap = getCatalogMap();
  if (catalogMap.has(key)) {
    return catalogMap.get(key)!;
  }

  // Fallback para códigos no catalogados
  return `Actividad ${key}`;
}
