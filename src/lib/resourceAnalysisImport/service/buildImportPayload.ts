// =============================================================================
// buildImportPayload — función pura del Incremento 4. Convierte
// (ParseResult, ValidationResult, siteMappings) en la lista de sitios a
// reemplazar (REPLACE completo de scope_data, ver types.ts) y la lista de
// sitios que se saltan, con su razón. No conoce Supabase, no decide
// severidad (eso ya lo hizo validate.ts) — solo agrupa y arma el payload.
// =============================================================================

import type { ParseResult, ValidationResult } from '../types';
import type { ImportPayload, ImportPayloadSite, SkippedSiteDetail } from './types';

interface SiteAccumulator {
  groupId: string;
  sheetNames: Set<string>;
  scopeData: Record<string, number>;
}

export function buildImportPayload(
  parseResult: ParseResult,
  validationResult: ValidationResult,
  siteMappings: ReadonlyMap<string, string | null | undefined>,
): ImportPayload {
  // Errores a nivel de hoja completa (RA001: sin bloques; RA004: cantidad
  // negativa, que hoy no trae blockIndex — se trata de forma conservadora
  // como "toda la hoja queda bloqueada" en vez de asumir a qué bloque
  // pertenece).
  const sheetsWithFatalError = new Set(
    validationResult.errors.filter((e) => e.code === 'RA001' || e.code === 'RA004').map((e) => e.sheetName),
  );
  // Errores a nivel de bloque específico (RA002: sin sitio; RA005: bloque duplicado).
  const blockedBlockKeys = new Set(
    validationResult.errors
      .filter((e) => e.code === 'RA002' || e.code === 'RA005')
      .map((e) => `${e.sheetName}#${e.blockIndex}`),
  );

  const sites = new Map<string, SiteAccumulator>();
  const skipped: SkippedSiteDetail[] = [];

  for (const sheet of parseResult.sheets) {
    if (sheetsWithFatalError.has(sheet.sheetName)) {
      skipped.push({
        groupId: null,
        sheetNames: [sheet.sheetName],
        reason: `La hoja "${sheet.sheetName}" tiene un error a nivel de archivo (RA001/RA004) — ningún bloque de esta hoja se importa.`,
      });
      continue;
    }

    sheet.blocks.forEach((block, blockIndex) => {
      const mappingKey = `${sheet.sheetName}#${blockIndex}`;
      const groupId = siteMappings.get(mappingKey);

      if (!groupId) {
        skipped.push({
          groupId: null,
          sheetNames: [sheet.sheetName],
          reason: `El bloque "${block.blockLabel}" (${mappingKey}) no tiene sitio resuelto (RA002).`,
        });
        return;
      }
      if (blockedBlockKeys.has(mappingKey)) {
        skipped.push({
          groupId,
          sheetNames: [sheet.sheetName],
          reason: `El bloque "${block.blockLabel}" (${mappingKey}) tiene un error de validación (RA005) — el sitio completo se salta para no persistir un scope_data parcial.`,
        });
        return;
      }

      let acc = sites.get(groupId);
      if (!acc) {
        acc = { groupId, sheetNames: new Set(), scopeData: {} };
        sites.set(groupId, acc);
      }
      acc.sheetNames.add(sheet.sheetName);
      for (const q of block.quantities) {
        acc.scopeData[q.scopeKey] = q.cantidad;
      }
    });
  }

  // Si un sitio quedó parcialmente en `skipped` (uno de sus bloques falló)
  // pero otro bloque del mismo sitio sí se acumuló en `sites`, ese sitio NO
  // se importa completo (condición explícita: replace solo si el Excel
  // representa el análisis COMPLETO del sitio) — se remueve de `sites` y se
  // deja constancia en `skipped`.
  const partiallyFailedGroupIds = new Set(skipped.map((s) => s.groupId).filter((g): g is string => g !== null));
  const toUpsert: ImportPayloadSite[] = [];
  for (const [groupId, acc] of sites) {
    if (partiallyFailedGroupIds.has(groupId)) {
      skipped.push({
        groupId,
        sheetNames: [...acc.sheetNames],
        reason: `El sitio tiene al menos un bloque bloqueado — no se importa un scope_data parcial.`,
      });
      continue;
    }
    toUpsert.push({ groupId, sheetNames: [...acc.sheetNames], scopeData: acc.scopeData });
  }

  return { toUpsert, skipped, warnings: validationResult.warnings };
}
