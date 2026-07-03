/**
 * CI wrapper: garantiza que teardown corra aunque test:db falle.
 *
 *   npm run test:db:setup
 *   npm run test:db        ← si falla, preserva el exit code
 *   npm run test:db:teardown   ← siempre corre
 *   exit <code de test:db>
 */

import { execSync } from 'child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', shell: true });
}

run('npm run test:db:setup');

let exitCode = 0;
try {
  run('npm run test:db');
} catch (err) {
  exitCode = typeof err.status === 'number' ? err.status : 1;
}

try {
  run('npm run test:db:teardown');
} catch (err) {
  console.error('Teardown falló:', err.message);
}

process.exit(exitCode);
