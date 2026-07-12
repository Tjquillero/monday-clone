// =============================================================================
// Contrato del servicio de importación del POA (importPoaService) — PROPUESTO,
// sin implementar todavía. Congela la interfaz antes de escribir el
// coordinador, siguiendo la misma disciplina que la capa SQL: primero el
// contrato, luego la implementación.
//
// Responsabilidad única del servicio: coordinar parser -> validate ->
// resolución de zonas -> construcción del JSON -> import_poa_version(). No
// reimplementa ninguna regla que ya vive en src/lib/poaImport/validate.ts ni
// en la función SQL (docs/architecture/import-poa-version-contract.md) — se
// limita a traducir sus resultados a esta interfaz.
// =============================================================================

import type { ImportValidationError, FrecuenciaPendienteMotivo } from '../types';

export interface ImportPoaInput {
  poaId: string;
  boardId: string;
  file: ArrayBuffer;
  /**
   * Generado UNA VEZ por intento de importación por quien invoca al
   * servicio (no por el usuario final, no por el contenido del archivo) —
   * ver docs/architecture/import-poa-version-contract.md#idempotencia.
   * Reintentar la misma llamada con el mismo importOperationId es seguro.
   *
   * `importPoaService` NUNCA genera ni regenera este valor — lo recibe y
   * lo reenvía tal cual hasta import_poa_version(). Si el llamador
   * reintenta tras un fallo transitorio, debe reutilizar el mismo
   * importOperationId de su primer intento, no generar uno nuevo; un
   * intento genuinamente nuevo (el usuario vuelve a pulsar "Importar")
   * sí amerita un importOperationId nuevo, decidido por el llamador. Mover
   * esta generación al servicio rompería la idempotencia de
   * import_poa_version() — un reintento con un id distinto se interpreta
   * como una operación nueva, no como el mismo intento.
   */
  importOperationId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Los tres motivos de bloqueo son independientes entre sí — no son mutuamente
// excluyentes (un mismo intento puede tener zonas sin mapear, actividades del
// Grupo B, Y errores de validación normales, los tres a la vez) y requieren
// tratamientos de UI distintos:
//   - unresolvedZones: recurrente, autoservicio — cualquier admin lo resuelve
//     desde una pantalla (ADR-0004), sin depender de nadie más.
//   - ambiguousFrequencyActivities: una decisión de negocio, no algo que la UI
//     pueda resolver — ver docs/discovery/poa-frequency-per-zone.md. Mostrar
//     el enlace al discovery, no un formulario de resolución.
//   - validationErrors: errores de datos del propio Excel (activity_key
//     inexistente, campos requeridos vacíos, duplicados).
// ─────────────────────────────────────────────────────────────────────────────

export interface ZoneResolutionNeeded {
  excelZoneName: string;
}

export interface AmbiguousFrequencyActivity {
  activityKey: string;
  descripcion: string;
  /** Enlace al discovery correspondiente, para que la UI lo muestre directamente. */
  discoveryDoc: string;
  /**
   * Por qué esta actividad no tiene una única frecuencia resoluble (ADR-0005)
   * — ambos motivos bloquean igual hoy (la UI los trata igual), pero son
   * preguntas de negocio distintas: 'different_values' = valores reales que
   * no concuerdan entre zonas; 'mixed_null_and_value' = algunas zonas tienen
   * frecuencia y otras no, y consolidar un único valor requeriría una
   * política no definida. Se conserva para no perder esta distinción cuando
   * el dueño del proceso resuelva la pregunta pendiente.
   */
  motivo: FrecuenciaPendienteMotivo;
}

export type ImportPoaResult =
  | {
      status: 'success';
      versionId: string;
      activitiesImported: number;
      zonesImported: number;
      /**
       * Actividades del catálogo técnico (board_activity_standards) con
       * cantidad contratada = 0 en las 9 zonas de este Excel — existen como
       * actividad válida, pero no forman parte del universo contratado de
       * esta versión (corresponde a `ValidationResult.noContratadas` de
       * validate.ts; ver docs/domain/poa-domain.md, "Catálogo Técnico" vs.
       * "Catálogo Contractual"). NO es una validación fallida ni un motivo
       * de bloqueo — es información de cortesía para que la UI pueda
       * mostrar, junto al resumen de éxito, "N actividades del catálogo no
       * tienen cobertura en esta versión" si el negocio quiere verlo.
       */
      activitiesNotContracted: number;
    }
  | {
      status: 'blocked';
      unresolvedZones: ZoneResolutionNeeded[];
      ambiguousFrequencyActivities: AmbiguousFrequencyActivity[];
      validationErrors: ImportValidationError[];
    }
  | {
      status: 'persistence_failed';
      /** SQLSTATE de Postgres (ej. "23503") cuando aplica — ver import-poa-version-contract.md#errores-esperables. */
      sqlState: string;
      message: string;
    };

/**
 * Invariante de `status === 'blocked'`: al menos una de las tres colecciones
 * debe tener elementos. `{ status: 'blocked', unresolvedZones: [],
 * ambiguousFrequencyActivities: [], validationErrors: [] }` es un estado
 * imposible — no debe poder construirse. Este constructor es la única forma
 * permitida de producir un resultado `blocked`; lo hace estructuralmente
 * difícil devolver "blocked" sin una razón real.
 */
export function createBlockedResult(
  parts: Pick<
    Extract<ImportPoaResult, { status: 'blocked' }>,
    'unresolvedZones' | 'ambiguousFrequencyActivities' | 'validationErrors'
  >,
): Extract<ImportPoaResult, { status: 'blocked' }> {
  const { unresolvedZones, ambiguousFrequencyActivities, validationErrors } = parts;
  if (unresolvedZones.length === 0 && ambiguousFrequencyActivities.length === 0 && validationErrors.length === 0) {
    throw new Error(
      'createBlockedResult: las tres colecciones están vacías — "blocked" sin ninguna razón es un estado imposible.',
    );
  }
  return { status: 'blocked', ...parts };
}

/**
 * Coordina: leer el Excel -> parsePoaExcel -> validateParsedPoa -> resolver
 * zonas vía poa_zone_mappings -> construir el JSON de import_poa_version() ->
 * invocarla -> traducir el resultado. Sin implementar todavía.
 */
export interface ImportPoaService {
  importPoaVersion(input: ImportPoaInput): Promise<ImportPoaResult>;
}
