// =============================================================================
// Capa 3 del importador del Excel del POA: validaciones antes de persistir.
// Ref: docs/architecture/poa-excel-import-design.md, Sección 7.
//      docs/architecture/poa-excel-import-test-matrix.md (TC-02, TC-03, TC-07,
//      TC-08, TC-09).
//
// Principio de esta capa (instrucción explícita del dueño del proceso): no
// decide la regla de negocio de la frecuencia por zona. Cuando FREC. no es
// constante entre las zonas de una actividad, se reporta como
// 'frecuencia_pendiente_regla_negocio' — un estado explícito distinto de un
// error de datos — y esa actividad no se persiste hasta que se resuelva
// docs/discovery/poa-frequency-per-zone.md. El resto del archivo sigue
// validándose con normalidad.
//
// Regla de negocio ya resuelta (consistente con docs/domain/poa-domain.md,
// distinción "Catálogo Técnico" vs. "Catálogo Contractual"): una actividad
// del catálogo técnico sin cantidad contratada en ninguna zona (CANT. = 0 en
// las 9 zonas) no genera poa_activities para esta versión del POA — sigue
// existiendo en el catálogo técnico, simplemente no forma parte del universo
// contratado de esta versión. Se reporta en `noContratadas` (informativo, no
// bloqueante), no como error.
//
// "Todo o nada" (ADR-0004): si valid === false, `activities` queda vacío. No
// existe una persistencia parcial del archivo completo — pero eso no impide
// que esta función reporte TODOS los errores encontrados de una vez, no solo
// el primero.
// =============================================================================

import type {
  ParseResult,
  ParsedActivity,
  ImportValidationError,
  ValidatedActivity,
  ValidationResult,
  ZoneFrecuenciaRaw,
  NoContratadaActivity,
} from './types';

export interface ValidatePoaImportContext {
  /** excelZoneName -> group_id resuelto, o null/undefined si está pendiente (ADR-0004). */
  zoneMappings: Map<string, string | null | undefined>;
  /** activity_key vigentes en board_activity_standards para este board. */
  knownActivityKeys: Set<string>;
}

const FREC_EPSILON = 1e-6;

type FrecuenciaResolution =
  | { estado: 'resuelta'; valor: number }
  | { estado: 'pending_business_rule'; valoresPorZona: ZoneFrecuenciaRaw[] }
  | { estado: 'valor_faltante'; faltantes: ZoneFrecuenciaRaw[] };

/**
 * Decide, para una actividad, si su frecuencia es constante entre zonas
 * (resuelta), si falta algún valor (error de dato), o si difiere entre zonas
 * (pendiente de la decisión de negocio documentada en el discovery).
 */
function resolveFrecuencia(frecuenciasPorZona: ZoneFrecuenciaRaw[]): FrecuenciaResolution {
  const faltantes = frecuenciasPorZona.filter((f) => f.frecuencia === null);
  if (faltantes.length > 0) {
    return { estado: 'valor_faltante', faltantes };
  }

  const valores = frecuenciasPorZona.map((f) => f.frecuencia as number);
  const primero = valores[0];
  const constante = valores.every((v) => Math.abs(v - primero) < FREC_EPSILON);

  if (constante) {
    return { estado: 'resuelta', valor: primero };
  }
  return { estado: 'pending_business_rule', valoresPorZona: frecuenciasPorZona };
}

function validateZoneMappings(
  parseResult: ParseResult,
  zoneMappings: ValidatePoaImportContext['zoneMappings'],
  errors: ImportValidationError[],
): void {
  for (const zona of parseResult.zonas) {
    const groupId = zoneMappings.get(zona.excelZoneName);
    if (groupId === undefined || groupId === null) {
      errors.push({
        code: 'zona_sin_mapeo',
        message: `La zona "${zona.excelZoneName}" no tiene un mapeo resuelto a un group del board (poa_zone_mappings).`,
        zona: zona.excelZoneName,
      });
    }
  }
}

function validateNoDuplicateActivityKeys(
  actividades: ParsedActivity[],
  errors: ImportValidationError[],
): void {
  const seen = new Map<string, number>();
  for (const act of actividades) {
    const firstRow = seen.get(act.activityKey);
    if (firstRow !== undefined) {
      errors.push({
        code: 'codigo_actividad_duplicado',
        message: `El código de actividad "${act.activityKey}" aparece más de una vez en el archivo (filas ${firstRow} y ${act.excelRow}).`,
        activityKey: act.activityKey,
        excelRow: act.excelRow,
      });
    } else {
      seen.set(act.activityKey, act.excelRow);
    }
  }
}

interface ValidateActivityOutcome {
  validated: ValidatedActivity | null;
  noContratada: NoContratadaActivity | null;
}

function validateActivity(
  act: ParsedActivity,
  context: ValidatePoaImportContext,
  errors: ImportValidationError[],
): ValidateActivityOutcome {
  if (!context.knownActivityKeys.has(act.activityKey)) {
    errors.push({
      code: 'activity_key_inexistente',
      message: `El código de actividad "${act.activityKey}" no existe en el catálogo técnico del board (board_activity_standards).`,
      activityKey: act.activityKey,
      excelRow: act.excelRow,
    });
    return { validated: null, noContratada: null };
  }

  // Actividad del catálogo técnico sin cantidad contratada en ninguna zona:
  // no pertenece al catálogo contractual de esta versión del POA (Regla de
  // negocio: poa_activities representa lo CONTRATADO, no el catálogo
  // completo — ver docs/domain/poa-domain.md, "Catálogo Contractual" vs.
  // "Catálogo Técnico"). No es un error — se reporta como informativo y no
  // se valida ni unidad, ni precio, ni frecuencia, porque no hay nada que
  // persistir para ella en esta versión.
  if (act.zonas.length === 0) {
    return { validated: null, noContratada: { activityKey: act.activityKey, excelRow: act.excelRow } };
  }

  let hasFieldError = false;

  if (!act.unidad) {
    errors.push({
      code: 'campo_requerido_vacio',
      message: `La actividad "${act.activityKey}" no tiene unidad (columna D) en la fila ${act.excelRow}.`,
      activityKey: act.activityKey,
      excelRow: act.excelRow,
    });
    hasFieldError = true;
  }

  if (act.precioUnitario === null || act.precioUnitario < 0) {
    errors.push({
      code: 'campo_requerido_vacio',
      message: `La actividad "${act.activityKey}" no tiene un precio unitario válido ("Vr. UNITARIO 2026") en la fila ${act.excelRow}.`,
      activityKey: act.activityKey,
      excelRow: act.excelRow,
    });
    hasFieldError = true;
  }

  const frecResult = resolveFrecuencia(act.frecuenciasPorZona);

  if (frecResult.estado === 'valor_faltante') {
    for (const f of frecResult.faltantes) {
      errors.push({
        code: 'campo_requerido_vacio',
        message: `La actividad "${act.activityKey}" no tiene FREC. en la zona "${f.excelZoneName}" (celda ${f.excelFrecCell}), pese a tener cantidad contratada.`,
        activityKey: act.activityKey,
        excelRow: act.excelRow,
        excelCell: f.excelFrecCell,
        zona: f.excelZoneName,
      });
    }
    return { validated: null, noContratada: null };
  }

  if (frecResult.estado === 'pending_business_rule') {
    errors.push({
      code: 'frecuencia_pendiente_regla_negocio',
      message: `La actividad "${act.activityKey}" tiene FREC. distinta entre zonas. Pendiente de decisión de negocio — ver docs/discovery/poa-frequency-per-zone.md. No se persiste hasta resolverse.`,
      activityKey: act.activityKey,
      excelRow: act.excelRow,
    });
    return { validated: null, noContratada: null };
  }

  if (hasFieldError) return { validated: null, noContratada: null };

  const zonasValidadas: ValidatedActivity['zonas'] = [];
  for (const z of act.zonas) {
    const groupId = context.zoneMappings.get(z.excelZoneName);
    // El error de "zona sin mapeo" ya se reportó a nivel de archivo
    // (validateZoneMappings); aquí solo se evita construir una fila inválida.
    if (!groupId) return { validated: null, noContratada: null };
    zonasValidadas.push({ groupId, cantidadContratada: z.cantidadContratada });
  }

  return {
    validated: {
      activityKey: act.activityKey,
      precioUnitario: act.precioUnitario as number,
      frecuencia: frecResult.valor,
      zonas: zonasValidadas,
    },
    noContratada: null,
  };
}

export function validateParsedPoa(
  parseResult: ParseResult,
  context: ValidatePoaImportContext,
): ValidationResult {
  const errors: ImportValidationError[] = [];

  validateZoneMappings(parseResult, context.zoneMappings, errors);
  validateNoDuplicateActivityKeys(parseResult.actividades, errors);

  const activities: ValidatedActivity[] = [];
  const noContratadas: NoContratadaActivity[] = [];
  for (const act of parseResult.actividades) {
    const { validated, noContratada } = validateActivity(act, context, errors);
    if (validated) activities.push(validated);
    if (noContratada) noContratadas.push(noContratada);
  }

  const valid = errors.length === 0;
  return { valid, errors, activities: valid ? activities : [], noContratadas };
}
