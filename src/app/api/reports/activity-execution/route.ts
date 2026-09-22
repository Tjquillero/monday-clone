import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildActivityExecutionReportDTO } from '@/lib/activityReportReadModelService';
import { resolveReportAssetUrls } from '@/lib/activityReportAssetResolver';
import { renderActivityExecutionReportHTML } from './ActivityExecutionReportTemplate';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const actaId = url.searchParams.get('acta_id');
    const boardId = url.searchParams.get('board_id');
    const periodStart = url.searchParams.get('period_start');
    const periodEnd = url.searchParams.get('period_end');

    if (!actaId && (!boardId || !periodStart || !periodEnd)) {
      return NextResponse.json(
        { error: 'Debe proporcionar acta_id o (board_id, period_start, period_end)' },
        { status: 400 }
      );
    }

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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const buildParams = actaId
      ? { mode: 'acta' as const, acta_id: actaId }
      : { mode: 'period' as const, board_id: boardId!, period_start: periodStart!, period_end: periodEnd! };

    // 1. Build Read Model DTO (stable storage_path references)
    const reportDTO = await buildActivityExecutionReportDTO(buildParams, supabase);

    // 2. Resolve Signed URLs for rendering
    const resolvedDTO = await resolveReportAssetUrls(reportDTO, supabase, 3600);

    // 3. Render HTML
    const htmlContent = renderActivityExecutionReportHTML(resolvedDTO);

    // 4. Puppeteer PDF Generation
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      landscape: false,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });

    await browser.close();

    const filename = actaId
      ? `Informe_Ejecucion_Acta_${reportDTO.header.acta_number || 'Borrador'}.pdf`
      : `Informe_Ejecucion_${periodStart}_${periodEnd}.pdf`;

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating activity execution report PDF:', error);
    return NextResponse.json(
      { error: error.message || 'Error al generar el informe en PDF' },
      { status: 500 }
    );
  }
}
