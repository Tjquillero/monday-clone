---
name: verify-nav
description: Verificación E2E en navegador de la navegación congelada de Mantenix — levanta el dev server, crea un usuario E2E temporal, hace login real, comprueba el ribbon (Tabla, Ejecución, Mapa, Costos, Cronograma), que cada vista cargue sin errores de consola y que los ids retirados (?view=gantt/work-orders/ops) caigan en Tabla. Usar cuando se pida "verificar la navegación", "probar el dashboard en el navegador" o tras cambios en src/config/navigation.ts o el ribbon de src/app/dashboard/page.tsx.
---

# Verificación E2E de navegación

El contrato verificado es `src/config/navigation.ts` (modelo congelado). Si
`BOARD_TABS` cambia legítimamente (con aprobación del propietario), actualizar
`EXPECTED_TABS` en `scripts/verify-nav.cjs` en el mismo commit.

## Requisitos

- `.env.local` con `SUPABASE_SERVICE_ROLE_KEY` (para el usuario E2E temporal).
- `playwright-core` resoluble desde el proyecto. Si falta, instalar SIN tocar
  package.json: `npm i --no-save playwright-core`. Usa el Chrome del sistema
  (`channel: 'chrome'`) — no descarga navegadores.

## Secuencia (desde la raíz del repo)

```bash
# 1. Dev server (si :3000 no responde). Poll, no sleep fijo.
npm run dev &   # en background
timeout 60 bash -c 'until curl -sf http://localhost:3000/login >/dev/null; do sleep 2; done'

# 2. Usuario E2E temporal (idempotente; credenciales en <tmp>/mantenix-e2e-creds.json)
node .claude/skills/verify-nav/scripts/e2e-user.cjs

# 3. Verificación (exit 0 = PASS; screenshots en <tmp>/mantenix-e2e/)
node .claude/skills/verify-nav/scripts/verify-nav.cjs

# 4. Limpieza SIEMPRE (usuario + credenciales)
node .claude/skills/verify-nav/scripts/e2e-user.cjs --cleanup
# y detener el dev server si lo levantó esta sesión
```

Tras ejecutar, **mirar al menos `ribbon.png`** en la carpeta de screenshots:
un PASS textual con página en blanco es un falso positivo.

## Gotchas aprendidos (no redescubrir)

- **La sesión vive en COOKIES, no en localStorage**: el cliente es
  `createBrowserClient` de `@supabase/ssr` (`src/lib/supabaseClient.ts`).
  Detectar sesión con `document.cookie.includes('-auth-token')`. No inyectar
  sesión por localStorage: la app no la lee de forma estable y la rotación del
  refresh token revoca la sesión inyectada a mitad de la verificación.
  Login real por formulario, siempre.
- **Precalentar `/dashboard` con `ctx.request.get()`, nunca con `page.goto()`
  anónimo**: la visita anónima deja un redirect diferido de `ProtectedRoute`
  que expulsa del login segundos después. La petición HTTP pura compila la
  ruta en el servidor sin efectos en el cliente.
- El botón "Iniciar Sesión" existe dos veces en /login (toggle y submit):
  usar `.last()`.
- Los labels del ribbon viven en spans `hidden xl:inline`: viewport ≥1280px
  de ancho o los spans devuelven texto vacío.
- Turbopack compila vistas on-demand: primeras cargas de 5-10 s; usar
  `waitForFunction`/`waitForSelector` con timeouts de 90 s, nunca sleeps cortos.
- `page.waitForFunction(fn, arg, opts)`: el timeout va en el TERCER argumento.
- Si el driver muere sin `browser.close()`, quedan Chromium headless huérfanos
  que pueden colgar el dev server. Limpiar solo los headless:
  PowerShell → `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like '*headless*' } | ForEach-Object
  { Stop-Process -Id $_.ProcessId -Force }` (nunca `taskkill /IM chrome.exe`,
  mataría el Chrome del usuario).
- En PowerShell no existe `<` para stdin: los scripts que redirigen SQL al CLI
  de Supabase deben correr en Bash.
