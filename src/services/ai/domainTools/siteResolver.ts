import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedSite {
  id: string;
  title: string;
}

export function normalizeSiteName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Resuelve un nombre de sitio (texto del usuario/modelo) al registro real de `groups`
 * del tablero actual. No distingue mayúsculas ni tildes y acepta coincidencia parcial única.
 */
export async function resolveSite(
  supabase: SupabaseClient,
  boardId: string,
  siteInput?: string | null,
  fallbackGroupId?: string | null
): Promise<ResolvedSite> {
  const { data: groups, error } = await supabase
    .from('groups')
    .select('id, title')
    .eq('board_id', boardId)
    .order('position', { ascending: true });

  if (error) {
    throw new Error(`Error al consultar los sitios del tablero: ${error.message}`);
  }

  const allSites: ResolvedSite[] = (groups || []).map((g) => ({
    id: g.id,
    title: g.title,
  }));

  if (allSites.length === 0) {
    throw new Error('El tablero no tiene sitios configurados.');
  }

  const siteListNames = allSites.map((s) => s.title).join(', ');

  // 1. Sin siteInput, usar fallbackGroupId si existe
  if (!siteInput || !siteInput.trim()) {
    if (fallbackGroupId) {
      const found = allSites.find((s) => s.id === fallbackGroupId);
      if (found) return found;
    }
    throw new Error(
      `No se especificó un sitio y no hay sitio activo. Sitios disponibles: ${siteListNames}.`
    );
  }

  const query = normalizeSiteName(siteInput);

  // 2. Coincidencia exacta normalizada
  const exactMatches = allSites.filter((s) => normalizeSiteName(s.title) === query);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  // 3. Coincidencia parcial normalizada (el título contiene el query o el query contiene el título)
  const partialMatches = allSites.filter((s) => {
    const normalizedTitle = normalizeSiteName(s.title);
    return normalizedTitle.includes(query) || query.includes(normalizedTitle);
  });

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    const matchedNames = partialMatches.map((s) => s.title).join(', ');
    throw new Error(
      `El nombre "${siteInput}" coincide con varios sitios: ${matchedNames}. Especifica el nombre completo.`
    );
  }

  throw new Error(
    `No se encontró ningún sitio que coincida con "${siteInput}". Sitios disponibles: ${siteListNames}.`
  );
}
