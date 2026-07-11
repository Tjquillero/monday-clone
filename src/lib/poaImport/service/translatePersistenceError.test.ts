import { translatePersistenceError } from './translatePersistenceError';

describe('translatePersistenceError', () => {
  it('23503 (foreign_key_violation) -> mensaje específico de zona/group_id inexistente', () => {
    const result = translatePersistenceError({
      code: '23503',
      message: 'insert or update on table "poa_activity_zones" violates foreign key constraint "poa_activity_zones_zone_id_fkey"',
    });
    expect(result).toEqual({
      status: 'persistence_failed',
      sqlState: '23503',
      message: expect.stringContaining('group_id que no existe'),
    });
  });

  it('23505 (unique_violation) -> mensaje específico de duplicado', () => {
    const result = translatePersistenceError({ code: '23505', message: 'duplicate key value violates unique constraint' });
    expect(result.sqlState).toBe('23505');
    expect(result.message).toContain('duplicado');
  });

  it('23502/23514 (NOT NULL / CHECK) -> mensaje de restricción de datos', () => {
    const notNull = translatePersistenceError({ code: '23502', message: 'null value in column violates not-null constraint' });
    const check = translatePersistenceError({ code: '23514', message: 'new row violates check constraint' });
    expect(notNull.message).toContain('restricción');
    expect(check.message).toContain('restricción');
  });

  it('P0001 "POA % no encontrado" -> mensaje de POA inexistente', () => {
    const result = translatePersistenceError({ code: 'P0001', message: 'POA a1b2 no encontrado' });
    expect(result.sqlState).toBe('P0001');
    expect(result.message).toContain('POA indicado no existe');
  });

  it('P0001 "Sin permiso..." -> mensaje de permiso denegado', () => {
    const result = translatePersistenceError({
      code: 'P0001',
      message: 'Sin permiso para importar una versión de este POA',
    });
    expect(result.message).toContain('permiso de administrador');
  });

  it('P0001 "Actividad sin ninguna zona asociada" -> mensaje de error de integración', () => {
    const result = translatePersistenceError({
      code: 'P0001',
      message: 'Actividad sin ninguna zona asociada — la importación se revierte por completo',
    });
    expect(result.message).toContain('error de integración');
  });

  it('P0001 "Inconsistencia: ..." -> conserva el detalle exacto del mensaje original', () => {
    const result = translatePersistenceError({
      code: 'P0001',
      message: 'Inconsistencia: 5 zonas esperadas, 4 insertadas',
    });
    expect(result.message).toContain('5 zonas esperadas, 4 insertadas');
  });

  it('P0001 no reconocido conserva el mensaje original en vez de ocultarlo', () => {
    const result = translatePersistenceError({ code: 'P0001', message: 'algo nuevo que RAISE EXCEPTION todavía no cubre' });
    expect(result.message).toBe('algo nuevo que RAISE EXCEPTION todavía no cubre');
  });

  it('sin código (undefined) usa sqlState "unknown" y conserva el mensaje', () => {
    const result = translatePersistenceError({ message: 'fallo de red' });
    expect(result.sqlState).toBe('unknown');
    expect(result.message).toBe('fallo de red');
  });

  it('un SQLSTATE no mapeado explícitamente conserva el mensaje original (no lo oculta)', () => {
    const result = translatePersistenceError({ code: '08006', message: 'connection failure' });
    expect(result.sqlState).toBe('08006');
    expect(result.message).toBe('connection failure');
  });
});
