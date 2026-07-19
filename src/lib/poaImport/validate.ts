// =============================================================================
// Capa 3 del importador del Excel del POA: validaciones antes de persistir.
// Ref: docs/architecture/poa-excel-import-design.md, Sección 7.
//      docs/architecture/poa-excel-import-test-matrix.md (TC-02, TC-03, TC-07,
//      TC-08, TC-09).
//
// Principio de esta capa (instrucción explícita del dueño del proceso): no
// decide la regla de negocio de la frecuencia por zona. Cuando la actividad
// tiene FREC. real en algunas zonas pero no en todas, o cuando los valores
// reales no concuerdan entre zonas, se reporta como
// 'frecuencia_pendiente_regla_negocio' (con `motivo` distinguiendo cuál de
// los dos casos es) — un estado explícito distinto de un error de datos — y
// esa actividad no se persiste hasta que se resuelva
// docs/discovery/poa-frequency-per-zone.md. El resto del archivo sigue
// validándose con normalidad.
//
// Regla de negocio ya resuelta (ADR-0005): una celda FREC. vacía NO es un
// error de captura por sí sola. Cuando NINGUNA zona contratada de la
// actividad reporta frecuencia, se persiste `frecuencia = null` — el
// dominio admite actividades contratadas sin programación periódica en una
// versión determinada del POA. Esto es distinto de "algunas zonas tienen
// valor y otras no" (motivo 'mixed_null_and_value' de arriba), que sigue
// pendiente porque consolidar un único valor de actividad a partir de un
// subconjunto de zonas no es una regla de negocio definida.
//
// Regla de negocio ya resuelta (consistente con docs/domain/poa-domain.md,
// distinción "Catálogo Técnico" vs. "Catálogo Contractual"): una actividad
// del catálogo técnico sin cantidad contratada en ninguna zona (CANT. = 0 en
// las 9 zonas) no genera poa_activities para esta versión del POA — sigue
// existiendo en el catálogo técnico, simplemente no forma parte del universo
// contratado de esta versión. Se reporta en `noContratadas` (informativo, no
// bloqueante), no como error.
//
// Separación de fases (2026-07-18, ver
// docs/architecture/poa-technical-catalog-decoupling.md): este archivo NO
// valida ni conoce `board_activity_standards`. La existencia del contrato
// (fase contractual: Excel → POA → poa_activities) y la configuración
// técnica que hace falta para programar jornales (fase técnica:
// board_activity_standards → Scheduler → weekly_plans) son preguntas
// distintas, con dueños y tiempos distintos — no comparten gate. Una
// actividad contratada se importa igual tenga o no catálogo técnico
// todavía; el Scheduler es quien bloquea la generación del Cronograma si
// falta (`get_missing_board_activity_standards`), no el importador. Si en
// el futuro alguien necesita "requerir catálogo técnico antes de importar",
// esa no es una corrección de este archivo — es reabrir esta decisión.
//
// Las 14 actividades del POA 2026 con FREC. inconsistente entre zonas
// (docs/discovery/poa-frequency-per-zone.md) quedaron RESUELTAS
// (2026-07-18) por decisión del administrador y responsable del proceso,
// dueño funcional del contrato — ver RESOLVED_FRECUENCIA_OVERRIDES más
// abajo. Ya no pasan por resolveFrecuencia(): su valor de `frecuencia` es
// fijo, sin importar lo que traiga cada celda del Excel. Dos categorías,
// no una sola regla (ADR-0002, enmienda 2026-07-18):
//   - Actividades por intensidad (`1.12`, `1.13`, `1.15`): la columna FREC.
//     no representa una periodicidad temporal — es un parámetro operativo
//     (m³ recolectados, número de pasadas de máquina) que varía por zona
//     por naturaleza, no por ambigüedad de captura. Se persiste
//     `frecuencia = null`. Esto no es una simplificación: es exactamente
//     el mecanismo que el administrador del proceso pidió ("el scheduler
//     debe interpretar estos casos como no periódicos") — `frecuencia
//     = null` ya hace que weeklyPlanner.ts excluya la actividad del
//     cálculo de jornales semanales (precedente ADR-0005 para `3.14`), sin
//     necesidad de un mecanismo nuevo. El valor operativo real (m³,
//     pasadas) no se persiste todavía — no hay columna del dominio que lo
//     represente por zona.
//   - Actividades periódicas (`2.04`-`2.09`, `2.10`/`2.11`/`2.14`, `3.1`,
//     `3.04`): sí son periodicidad contractual — se fija una única
//     frecuencia por actividad (Regla 18 sin cambios), expresada en la
//     unidad que ya usa el motor de planificación (ocurrencias por cada 25
//     días laborales, ver schedulerMath.ts: WORKING_DAYS_MONTH = 25).
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
  FrecuenciaPendienteMotivo,
} from './types';

export interface ValidatePoaImportContext {
  /** excelZoneName -> group_id resuelto, o null/undefined si está pendiente (ADR-0004). */
  zoneMappings: Map<string, string | null | undefined>;
}

const FREC_EPSILON = 1e-6;

/**
 * Reglas definitivas para las 14 actividades de
 * docs/discovery/poa-frequency-per-zone.md, confirmadas por el
 * administrador y responsable del proceso (2026-07-18). Reemplazan
 * cualquier valor de FREC. que traiga el Excel para esa actividad — no se
 * concilia con lo capturado, se aplica la regla del contrato.
 *
 * `null` = Grupo A: FREC. es un parámetro operativo, no periodicidad
 * (ver comentario de cabecera del archivo). Los demás valores están en la
 * unidad del motor de planificación: ocurrencias por cada 25 días
 * laborales (25 / días_entre_ejecuciones — schedulerMath.ts).
 */
const RESOLVED_FRECUENCIA_OVERRIDES: ReadonlyMap<string, number | null> = new Map([
  ['1.12', null],
  ['1.13', null],
  ['1.15', null],
  ['2.04', 25 / 50],
  ['2.05', 25 / 50],
  ['2.06', 25 / 50],
  ['2.07', 25 / 50],
  ['2.08', 25 / 50],
  ['2.09', 25 / 50],
  ['2.10', 25 / 75],
  ['2.11', 25 / 75],
  ['2.14', 25 / 75],
  ['3.1', 25 / 90],
  ['3.04', 25 / 30],
]);

type FrecuenciaResolution =
  | { estado: 'resuelta'; valor: number | null }
  | { estado: 'pending_business_rule'; valoresPorZona: ZoneFrecuenciaRaw[]; motivo: FrecuenciaPendienteMotivo };

/**
 * Decide, para una actividad, cuál es su frecuencia — o si queda pendiente de
 * una decisión de negocio que este validador no toma (ADR-0005).
 *
 * Una celda FREC. vacía NO es un error: el dominio admite actividades
 * contratadas sin programación periódica en esta versión del POA (se
 * preserva `null`, tal cual viene el Excel — no se corrige ni se infiere).
 *
 * Lo único que sigue bloqueando la importación (sin cambios respecto a
 * antes de ADR-0005) es la ausencia de una única frecuencia resoluble:
 *   - si TODAS las zonas están vacías → resuelta como `null` (inequívoco,
 *     no hay ningún valor entre el cual elegir).
 *   - si TODAS las zonas tienen valor y concuerdan → resuelta a ese valor.
 *   - si TODAS las zonas tienen valor pero no concuerdan → pendiente
 *     (motivo 'different_values' — la ambigüedad ya conocida del discovery).
 *   - si ALGUNAS zonas tienen valor y otras no → pendiente (motivo
 *     'mixed_null_and_value'). Consolidar un único valor de actividad a
 *     partir de un subconjunto de zonas sería una política de negocio no
 *     definida — este validador no la asume, la deja pendiente.
 */
function resolveFrecuencia(frecuenciasPorZona: ZoneFrecuenciaRaw[]): FrecuenciaResolution {
  const conValor = frecuenciasPorZona.filter((f) => f.frecuencia !== null);

  if (conValor.length === 0) {
    return { estado: 'resuelta', valor: null };
  }

  if (conValor.length < frecuenciasPorZona.length) {
    return { estado: 'pending_business_rule', valoresPorZona: frecuenciasPorZona, motivo: 'mixed_null_and_value' };
  }

  const valores = conValor.map((f) => f.frecuencia as number);
  const primero = valores[0];
  const constante = valores.every((v) => Math.abs(v - primero) < FREC_EPSILON);

  if (constante) {
    return { estado: 'resuelta', valor: primero };
  }
  return { estado: 'pending_business_rule', valoresPorZona: frecuenciasPorZona, motivo: 'different_values' };
}

/**
 * Punto de entrada real usado por validateActivity(): si la actividad tiene
 * una regla definitiva confirmada (RESOLVED_FRECUENCIA_OVERRIDES), se aplica
 * directamente y NUNCA se llega a 'pending_business_rule' para ella, sin
 * importar lo que traiga el Excel. El resto del catálogo sigue el camino de
 * siempre (resolveFrecuencia).
 */
function resolveFrecuenciaConOverride(
  activityKey: string,
  frecuenciasPorZona: ZoneFrecuenciaRaw[],
): FrecuenciaResolution {
  if (RESOLVED_FRECUENCIA_OVERRIDES.has(activityKey)) {
    return { estado: 'resuelta', valor: RESOLVED_FRECUENCIA_OVERRIDES.get(activityKey) ?? null };
  }
  return resolveFrecuencia(frecuenciasPorZona);
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

  const frecResult = resolveFrecuenciaConOverride(act.activityKey, act.frecuenciasPorZona);

  if (frecResult.estado === 'pending_business_rule') {
    const mensajePorMotivo: Record<FrecuenciaPendienteMotivo, string> = {
      different_values: `La actividad "${act.activityKey}" tiene FREC. distinta entre zonas. Pendiente de decisión de negocio — ver docs/discovery/poa-frequency-per-zone.md. No se persiste hasta resolverse.`,
      mixed_null_and_value: `La actividad "${act.activityKey}" tiene FREC. presente en algunas zonas y vacía en otras. Consolidar un único valor requiere una decisión de negocio no definida — ver docs/discovery/poa-frequency-per-zone.md. No se persiste hasta resolverse.`,
    };
    errors.push({
      code: 'frecuencia_pendiente_regla_negocio',
      message: mensajePorMotivo[frecResult.motivo],
      activityKey: act.activityKey,
      excelRow: act.excelRow,
      motivo: frecResult.motivo,
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
      descripcion: act.descripcion,
      unidad: act.unidad as string,
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
