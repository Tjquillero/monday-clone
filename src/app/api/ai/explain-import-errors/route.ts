import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServerClient';
import { explainImportErrors } from '@/services/ai/explainImportErrors';
import type { ImportValidationError } from '@/lib/poaImport/types';

export async function POST(req: NextRequest) {
  try {
    const { errors } = await req.json();
    if (!Array.isArray(errors)) {
      return NextResponse.json({ error: 'errors debe ser un arreglo' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const explanation = await explainImportErrors(errors as ImportValidationError[]);
    return NextResponse.json({ explanation });
  } catch (error: any) {
    console.error('Error en /api/ai/explain-import-errors:', error);
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
