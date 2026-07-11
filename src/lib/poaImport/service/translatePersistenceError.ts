// =============================================================================
// translatePersistenceError — función pura: error de Postgres/Postgrest ->
// ImportPoaResult 'persistence_failed'. Traducción deliberada por SQLSTATE,
// no un catch-all genérico — ver docs/architecture/import-poa-version-
// contract.md#errores-esperables.
//
// Nota importante: las excepciones propias de import_poa_version()
// (RAISE EXCEPTION sin SQLSTATE explícito — "POA % no encontrado", "Sin
// permiso...", "Actividad sin ninguna zona...", "Inconsistencia: ...")
// comparten TODAS el mismo SQLSTATE genérico de Postgres (P0001,
// raise_exception) — el código por sí solo no las distingue. Por eso, para
// P0001 esta función sí inspecciona el texto del mensaje; para las
// violaciones de esquema (FK, unicidad, CHECK, NOT NULL) el SQLSTATE ya es
// suficiente y no hace falta mirar el mensaje.
// =============================================================================

import type { ImportPoaResult } from './types';

export interface PostgrestLikeError {
  code?: string;
  message: string;
}

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';
const RAISE_EXCEPTION = 'P0001';

type PersistenceFailedResult = Extract<ImportPoaResult, { status: 'persistence_failed' }>;

export function translatePersistenceError(error: PostgrestLikeError): PersistenceFailedResult {
  const sqlState = error.code ?? 'unknown';

  if (sqlState === FOREIGN_KEY_VIOLATION) {
    return {
      status: 'persistence_failed',
      sqlState,
      message: 'Una zona hace referencia a un group_id que no existe en el board.',
    };
  }

  if (sqlState === UNIQUE_VIOLATION) {
    return {
      status: 'persistence_failed',
      sqlState,
      message: 'Se intentó insertar un valor duplicado (zona repetida en la misma actividad, o versión ya existente).',
    };
  }

  if (sqlState === CHECK_VIOLATION || sqlState === NOT_NULL_VIOLATION) {
    return {
      status: 'persistence_failed',
      sqlState,
      message: 'Un valor no cumple una restricción de la base de datos (precio, frecuencia o cantidad fuera de rango, o un campo obligatorio vacío).',
    };
  }

  if (sqlState === RAISE_EXCEPTION) {
    if (error.message.includes('no encontrado')) {
      return { status: 'persistence_failed', sqlState, message: 'El POA indicado no existe.' };
    }
    if (error.message.includes('Sin permiso')) {
      return {
        status: 'persistence_failed',
        sqlState,
        message: 'El usuario no tiene permiso de administrador sobre este POA.',
      };
    }
    if (error.message.includes('debe ser un array')) {
      return { status: 'persistence_failed', sqlState, message: 'El payload enviado no tiene el formato esperado.' };
    }
    if (error.message.includes('sin ninguna zona asociada')) {
      return {
        status: 'persistence_failed',
        sqlState,
        message: 'Una actividad llegó a persistencia sin ninguna zona — error de integración, no debería ocurrir si las capas 1-3 validaron correctamente.',
      };
    }
    if (error.message.startsWith('Inconsistencia:')) {
      return {
        status: 'persistence_failed',
        sqlState,
        message: `Inconsistencia interna detectada por import_poa_version(): ${error.message}`,
      };
    }
    // RAISE EXCEPTION propio no reconocido — se conserva el mensaje original
    // en vez de ocultarlo, para no perder información de diagnóstico.
    return { status: 'persistence_failed', sqlState, message: error.message };
  }

  return { status: 'persistence_failed', sqlState, message: error.message };
}
