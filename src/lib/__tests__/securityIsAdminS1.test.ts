import * as fs from 'fs';
import * as path from 'path';

describe('Guardia Estática S1 — is_admin() app_metadata (2026093002)', () => {
  const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/2026093002_security_is_admin_app_metadata.sql');

  test('La migración 2026093002 contiene los elementos de seguridad de SECURITY-AUDIT-01', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Validación de elementos de seguridad requeridos
    expect(content).toContain('raw_app_meta_data');
    expect(content).toContain('auth.uid()');
    expect(content).toContain('SET search_path = pg_catalog, public, pg_temp');

    // Las 4 sentencias ALTER FUNCTION
    expect(content).toContain('ALTER FUNCTION public.get_user_board_role(uuid, uuid)');
    expect(content).toContain('ALTER FUNCTION public.handle_new_user()');
    expect(content).toContain('ALTER FUNCTION public.fn_insert_activity_standard()');
    expect(content).toContain('ALTER FUNCTION public.get_or_create_financial_item(uuid, text, jsonb)');

    // Prohibido user_metadata en el cuerpo ejecutable de SQL (vulnerabilidad corregida)
    const sqlExecutableLines = content
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    expect(sqlExecutableLines).not.toContain('user_metadata');
  });
});
