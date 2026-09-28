import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServerClient';
import { createSupabaseAdminClient } from '@/lib/supabaseAdminClient';
import { parsePersonnelExcel, executePersonnelIngestion } from '@/lib/personnelIngestionService';

/**
 * POST /api/personnel/bootstrap
 *
 * =============================================================================
 * CLASIFICACIÓN ARQUITECTÓNICA: BOOTSTRAP / INITIAL_DATA_LOAD
 * =============================================================================
 * Única frontera autorizada para invocar executePersonnelIngestion con
 * service_role. Ver: src/lib/personnelIngestionService.ts §CONTRATO DE LLAMADA.
 *
 * CONTROLES DE SEGURIDAD (en orden de ejecución):
 *   1. Autenticación: JWT válido (createSupabaseServerClient + getUser).
 *   2. Autorización: actor tiene rol admin o supervisor activo en board_id
 *      (user_board_roles). Denegado si no.
 *   3. Estado inicial: el board no debe tener una personnel_version activa
 *      con asignaciones (BOOTSTRAP_BLOCKED si ya existe).
 *   4. Ejecución privilegiada: solo aqui se instancia createSupabaseAdminClient.
 *
 * INVARIANTES:
 *   - No puede reutilizarse como mecanismo de movilidad operacional.
 *   - No modifica versiones PUBLISHED existentes.
 *   - La SERVICE_ROLE_KEY no llega al browser en ningún momento.
 *   - actor_user_id = user autenticado (no puede ser sobreescrito por el cliente).
 *
 * PROHIBIDO desde este endpoint:
 *   - group_id en el cuerpo (no existe en el modelo de datos de bootstrap).
 *   - Más de un Excel por invocación.
 *   - Invocar reassign_personnel_governed_xact.
 * =============================================================================
 */
export async function POST(req: NextRequest) {
  try {
    // ----------------------------------------------------------------
    // 1. Autenticación: verificar sesión activa
    // ----------------------------------------------------------------
    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // ----------------------------------------------------------------
    // 2. Parsear multipart/form-data
    // ----------------------------------------------------------------
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const boardId = formData.get('board_id') as string | null;
    const dryRunParam = formData.get('dry_run');
    const isDryRun = dryRunParam === 'true';

    if (!file || !boardId) {
      return NextResponse.json(
        { error: 'file y board_id son requeridos' },
        { status: 400 }
      );
    }

    if (typeof boardId !== 'string' || !/^[0-9a-f-]{36}$/i.test(boardId)) {
      return NextResponse.json(
        { error: 'board_id debe ser un UUID válido' },
        { status: 400 }
      );
    }

    // ----------------------------------------------------------------
    // 3. Autorización RBAC: actor debe tener rol admin o supervisor
    //    activo en el board. user_board_roles es la fuente de verdad.
    //    Se consulta con authClient (RLS activo) para que el propio
    //    usuario solo pueda ver sus propios roles.
    // ----------------------------------------------------------------
    const { data: roleRow, error: roleErr } = await authClient
      .from('user_board_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('board_id', boardId)
      .in('role', ['admin', 'supervisor'])
      .eq('is_active', true)
      .maybeSingle();

    if (roleErr) {
      console.error('[bootstrap] Error verificando rol:', roleErr);
      return NextResponse.json(
        { error: 'Error verificando autorización' },
        { status: 500 }
      );
    }

    if (!roleRow) {
      return NextResponse.json(
        {
          error: 'RBAC_FORBIDDEN: El usuario no tiene rol de admin o supervisor activo en este tablero',
          code: 'RBAC_FORBIDDEN',
        },
        { status: 403 }
      );
    }

    // ----------------------------------------------------------------
    // 4. Parsear Excel (server-side, Node.js Buffer)
    // ----------------------------------------------------------------
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rows;
    try {
      rows = parsePersonnelExcel(buffer);
    } catch (parseErr: any) {
      return NextResponse.json(
        { error: `Error parseando Excel: ${parseErr?.message || 'formato inválido'}` },
        { status: 422 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'El archivo Excel no contiene filas válidas en la hoja BASE DE DATA CCC' },
        { status: 422 }
      );
    }

    // ----------------------------------------------------------------
    // 5. Ejecución con service_role (PRIVILEGED)
    //    Solo aquí se instancia el cliente admin.
    //    actor_user_id = user.id (derivado del JWT del servidor, no del cliente)
    // ----------------------------------------------------------------
    const adminClient = createSupabaseAdminClient();

    const report = await executePersonnelIngestion(
      adminClient,
      boardId,
      rows,
      { dryRun: isDryRun }
    );

    // ----------------------------------------------------------------
    // 6. Respuesta
    // ----------------------------------------------------------------
    const hasErrors = report.errors.length > 0;
    const isBootstrapBlocked = report.errors.some(e => e.startsWith('BOOTSTRAP_BLOCKED'));

    if (isBootstrapBlocked) {
      return NextResponse.json(
        {
          success: false,
          code: 'BOOTSTRAP_BLOCKED',
          error: report.errors.find(e => e.startsWith('BOOTSTRAP_BLOCKED')),
          report,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: !hasErrors,
        actor_user_id: user.id,
        board_id: boardId,
        dry_run: isDryRun,
        report,
      },
      { status: hasErrors ? 207 : 200 }
    );
  } catch (error: any) {
    console.error('[bootstrap] Error inesperado:', error);
    return NextResponse.json(
      { error: error?.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// Solo POST — no GET, no PUT, no DELETE.
export const dynamic = 'force-dynamic';
