// =============================================================================
// Incremento 3 del importador de Resource Analysis: validación de
// consistencia, sin escribir en la base de datos. Ref:
// docs/architecture/resource-analysis-import-design.md, Sección 7.
//
// Función pura: no importa Supabase, no resuelve `group_id` por sí misma —
// recibe el mapeo sitio→group_id ya resuelto en `context.siteMappings`
// (mismo patrón que src/lib/poaImport/validate.ts con `zoneMappings`). Cuando
// el caller todavía no tiene ese mapeo (hoy: siempre, porque
// resource_analysis_sheet_mappings no existe todavía — Incremento 4), pasar
// un Map vacío: cada bloque queda reportado como RA002 (sitio no
// identificado), que es la verdad actual del sistema, no un error del
// validador.
//
// Resource Analysis NO es todo-o-nada (a diferencia del POA, ver diseño
// Sección 5): cada bloque de sitio es independiente. `isValid` refleja
// "¿hay al menos un error en algún lado?", no "¿se puede importar el archivo
// completo?" — el Incremento 4 decide, bloque por bloque, cuáles importar
// usando `summary`/`errors` con su `blockIndex`.
// =============================================================================

import type {
  ParseResult,
  ParsedBlock,
  ValidateResourceAnalysisContext,
  ValidationIssue,
  ValidationResult,
} from './types';

function validateBlock(
  sheetName: string,
  block: ParsedBlock,
  blockIndex: number,
  context: ValidateResourceAnalysisContext,
  resolvedSitesInSheet: Map<string, { blockIndex: number; scopeKeys: Set<string> }>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): boolean {
  let hasError = false;
  const mappingKey = `${sheetName}#${blockIndex}`;
  const siteId = context.siteMappings.get(mappingKey);
  const scopeKeys = new Set(block.quantities.map((q) => q.scopeKey));

  if (siteId === undefined || siteId === null) {
    errors.push({
      code: 'RA002',
      message: `El bloque "${block.blockLabel}" (hoja "${sheetName}", bloque #${blockIndex}) no tiene un sitio resuelto.`,
      sheetName,
      blockIndex,
      blockLabel: block.blockLabel,
      excelRow: block.excelRow,
    });
    hasError = true;
  } else {
    const previous = resolvedSitesInSheet.get(siteId);
    // Dos bloques del mismo sitio son normales (Zona Verde + Zona de Playa,
    // ver docs/architecture/resource-analysis-site-mapping.md) — solo es un
    // problema real si además comparten scopeKey: eso sí arriesgaría
    // importar la misma cantidad física dos veces para el mismo sitio.
    const overlap = previous ? [...scopeKeys].filter((k) => previous.scopeKeys.has(k)) : [];
    if (previous && overlap.length > 0) {
      errors.push({
        code: 'RA005',
        message: `El bloque #${blockIndex} de "${sheetName}" comparte scopeKey (${overlap.join(', ')}) con el bloque #${previous.blockIndex}, ambos resueltos al mismo sitio — posible duplicado de datos.`,
        sheetName,
        blockIndex,
        blockLabel: block.blockLabel,
        excelRow: block.excelRow,
        detalle: siteId,
      });
      hasError = true;
    } else if (!previous) {
      resolvedSitesInSheet.set(siteId, { blockIndex, scopeKeys });
    }
  }

  if (block.activityStandardsRaw.some((a) => a.rendimiento !== null)) {
    warnings.push({
      code: 'RA006',
      message: `Se leyó rendimiento en este bloque — informativo, no se persiste (Regla de Gobierno de Datos, docs/domain/resource-analysis-domain.md Sección 2).`,
      sheetName,
      blockIndex,
      blockLabel: block.blockLabel,
    });
  }
  if (block.activityStandardsRaw.some((a) => a.frecuencia !== null)) {
    warnings.push({
      code: 'RA007',
      message: `Se leyó frecuencia en este bloque — informativa, no se persiste (Regla de Gobierno de Datos, docs/domain/resource-analysis-domain.md Sección 2).`,
      sheetName,
      blockIndex,
      blockLabel: block.blockLabel,
    });
  }

  return hasError;
}

export function validateResourceAnalysis(
  parseResult: ParseResult,
  context: ValidateResourceAnalysisContext,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  let totalBlocks = 0;
  let blockedBlocks = 0;

  for (const sheet of parseResult.sheets) {
    if (sheet.blocks.length === 0) {
      errors.push({
        code: 'RA001',
        message: `La hoja "${sheet.sheetName}" no tiene ningún bloque reconocible (patrón "NOMBRE DEL PROYECTO:" no encontrado).`,
        sheetName: sheet.sheetName,
      });
      continue;
    }

    const resolvedSitesInSheet = new Map<string, { blockIndex: number; scopeKeys: Set<string> }>();
    sheet.blocks.forEach((block, blockIndex) => {
      totalBlocks++;
      const blockHasError = validateBlock(
        sheet.sheetName,
        block,
        blockIndex,
        context,
        resolvedSitesInSheet,
        errors,
        warnings,
      );
      if (blockHasError) blockedBlocks++;
    });
  }

  // RA003 (actividad desconocida) y RA004 (cantidad negativa): el parser
  // (Incremento 2) solo registra el HECHO, sin juzgar severidad — juzgarla es
  // trabajo de esta capa. 'hoja_sin_bloques' no se reprocesa aquí: ya se
  // cubrió arriba directamente desde la estructura (evita duplicar RA001).
  for (const w of parseResult.warnings) {
    if (w.tipo === 'descripcion_no_reconocida') {
      warnings.push({
        code: 'RA003',
        message: `Descripción no reconocida: "${w.detalle}" — no mapea a ningún scope_key conocido.`,
        sheetName: w.sheetName,
        excelRow: w.excelRow,
        detalle: w.detalle,
      });
    } else if (w.tipo === 'cantidad_negativa') {
      errors.push({
        code: 'RA004',
        message: `Cantidad negativa detectada: ${w.detalle}.`,
        sheetName: w.sheetName,
        excelRow: w.excelRow,
        detalle: w.detalle,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalSheets: parseResult.sheets.length,
      totalBlocks,
      validBlocks: totalBlocks - blockedBlocks,
      blockedBlocks,
    },
  };
}
