import * as fs from 'fs';
import * as path from 'path';

describe('Guardia Estática D17 — sync_weekly_plan_items_rpc (2026093001)', () => {
  const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/2026093001_sync_gateway_guard_d17.sql');
  const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

  test('La migración 2026093001 existe y contiene las cláusulas y códigos obligatorios', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Cláusulas e invariantes obligatorios
    expect(content).toContain('FOR UPDATE');
    expect(content).toContain('PLAN_NOT_EMPTY');
    expect(content).toContain('ZONE_MISMATCH');
    expect(content).toContain('DUPLICATE_SEQUENCE');
    expect(content).toContain('DATE_OUT_OF_WEEK');
    expect(content).toContain('jsonb_typeof');
    expect(content).toContain("IS DISTINCT FROM 'number'");
    expect(content).toContain('must_execute');
    expect(content).toContain('pg_temp');
    expect(content).toContain('UNAUTHENTICATED');
    expect(content).toContain('EMPTY_PAYLOAD');
    expect(content).toContain('PLAN_NOT_FOUND');
    expect(content).toContain('PLAN_WITHOUT_SITE');
    expect(content).toContain('PLAN_TERMINAL');
    expect(content).toContain('FORBIDDEN');
    expect(content).toContain('SITE_BOARD_MISMATCH');
    expect(content).toContain('ACTIVE_POA_VERSION_INVALID');
    expect(content).toContain('INVALID_ITEM');
  });

  test('La migración 2026093001 NO contiene patrones prohibidos (D16 / D17)', () => {
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Prohibido ON CONFLICT (D14/D17: inserción atómica en planes vacíos)
    expect(content).not.toContain('ON CONFLICT');

    // Prohibido LIMIT 1 (prohibido asignar zonas arbitrarias)
    expect(content).not.toContain('LIMIT 1');

    // Prohibido usar activity_standard_id como zona
    expect(content).not.toContain('activity_standard_id');

    // Prohibido COALESCE sobre poa_activity_zone_id
    const coalesceZoneRegex = /COALESCE\s*\([^)]*poa_activity_zone_id/i;
    expect(coalesceZoneRegex.test(content)).toBe(false);

    // Prohibido COALESCE sobre is_manual_override (se fuerza false por construcción)
    expect(content).not.toContain("COALESCE((item->>'is_manual_override')");

    // Prohibido ELSE NULL END en el INSERT (casts directos tras validación previa)
    expect(content).not.toContain('ELSE NULL END');

    // Prohibido <> 'number' (debe usarse IS DISTINCT FROM 'number')
    expect(content).not.toContain("<> 'number'");
  });

  test('El directorio supabase/migrations ya no contiene la migración rechazada 2026092801', () => {
    const files = fs.readdirSync(migrationsDir);
    const rejectedPresent = files.some(file => file.includes('2026092801'));
    expect(rejectedPresent).toBe(false);
  });
});
