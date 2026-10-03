import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { launchReportBrowser } from '../../../../lib/reportBrowser';
import {
  buildMonthlyScheduleReportData,
  renderMonthlyScheduleReportHtml,
} from '../../../../lib/monthlyScheduleReportService';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let browser: any = null;
  try {
    const { boardId, month, groupId, version } = await req.json();

    if (!boardId || !month || !groupId || !version) {
      return NextResponse.json(
        { error: 'boardId, month (YYYY-MM), groupId y version son requeridos' },
        { status: 400 }
      );
    }

    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json(
        { error: 'month debe tener el formato YYYY-MM' },
        { status: 400 }
      );
    }

    if (version !== 'external' && version !== 'full') {
      return NextResponse.json(
        { error: 'version debe ser "external" o "full"' },
        { status: 400 }
      );
    }

    // 1. Autenticación y cliente Supabase
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado: sesión no válida' }, { status: 401 });
    }

    // 2. Validación de membresía del tablero
    const { data: membership, error: memErr } = await supabase
      .from('board_members')
      .select('user_id, role')
      .eq('board_id', boardId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memErr || !membership) {
      return NextResponse.json(
        { error: 'No autorizado: el usuario no es miembro del tablero' },
        { status: 403 }
      );
    }

    // 3. Construir datos del reporte
    const reportData = await buildMonthlyScheduleReportData(supabase, {
      boardId,
      month,
      groupId,
      version,
    });

    if (reportData.sites.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron sitios con programación para el mes especificado' },
        { status: 404 }
      );
    }

    // 4. Renderizar HTML
    const htmlContent = renderMonthlyScheduleReportHtml(reportData);

    // 5. Lanzar Puppeteer y generar PDF
    browser = await launchReportBrowser();
    const page = await browser.newPage();

    await page.setContent(htmlContent, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      width: '355.6mm',
      height: '215.9mm',
      printBackground: true,
      margin: {
        top: '9mm',
        bottom: '11mm',
        left: '8mm',
        right: '8mm',
      },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:6pt;width:100%;padding:0 8mm;color:#6b7686;display:flex;justify-content:space-between"><span>Mantenix · Cronograma de mantenimiento</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
    });

    const siteLabel = groupId === 'ALL' ? 'Todos_los_sitios' : (reportData.sites[0]?.siteName || 'Sitio').replace(/\s+/g, '_');
    const versionLabel = version === 'external' ? 'externo' : 'completo';
    const filename = `Cronograma_${month}_${siteLabel}_${versionLabel}.pdf`;

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating Monthly Schedule PDF:', error);
    const isLaunchError =
      error?.code === 'PDF_BROWSER_LAUNCH_FAILED' ||
      error?.message?.includes('PDF_BROWSER_LAUNCH_FAILED');
    const isReadFailed =
      error?.message?.includes('SCHEDULE_REPORT_READ_FAILED') ||
      error?.message?.includes('SCHEDULE_REPORT_NO_ACTIVE_POA');

    let code = 'PDF_GENERATION_FAILED';
    if (isLaunchError) code = 'PDF_BROWSER_LAUNCH_FAILED';
    else if (isReadFailed) code = 'SCHEDULE_REPORT_READ_FAILED';

    return NextResponse.json(
      {
        error: error?.message || 'Error al generar el reporte PDF del cronograma mensual',
        code,
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
