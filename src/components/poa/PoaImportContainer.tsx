'use client';

// Commit 1: esqueleto de la pantalla de importación. Selección de archivo,
// estado de carga, invocación de importPoaService — sin resolver todavía
// la presentación completa de cada variante de ImportPoaResult (Commit 2).
//
// Decisión de UX (confirmada antes de escribir esto): un solo paso. El
// usuario selecciona el Excel y se intenta importar de inmediato;
// importPoaService ya encapsula parseo, validación, resolución de contexto
// y persistencia — no hay una "prevalidación" separada que duplique esas
// reglas. blocked/success/persistence_failed se muestran en la misma
// pantalla, sin una vista previa intermedia.

import { useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { importPoaVersion } from '@/lib/poaImport/service/importPoaService';
import type { ImportPoaResult } from '@/lib/poaImport/service/types';

interface PoaImportContainerProps {
  poaId: string;
}

export default function PoaImportContainer({ poaId }: PoaImportContainerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportPoaResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!file || isImporting) return;

    setIsImporting(true);
    setLoadError(null);
    setResult(null);

    try {
      const { data: poaRow, error: poaError } = await supabase
        .from('poa')
        .select('board_id')
        .eq('id', poaId)
        .single();
      if (poaError) throw poaError;

      const buffer = await file.arrayBuffer();
      const importOperationId = crypto.randomUUID(); // una vez por intento, nunca dentro del servicio

      const importResult = await importPoaVersion({
        poaId,
        boardId: poaRow.board_id as string,
        file: buffer,
        importOperationId,
      });

      setResult(importResult);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error desconocido al importar el archivo.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-lg py-10 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
          <UploadCloud className="w-8 h-8 text-slate-400" />
          <span className="text-sm text-slate-500 font-medium">
            {file ? file.name : 'Selecciona el Excel del POA (.xlsx)'}
          </span>
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setLoadError(null);
            }}
          />
        </label>

        <button
          type="button"
          onClick={handleImport}
          disabled={!file || isImporting}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {isImporting ? 'Importando…' : 'Importar'}
        </button>
      </div>

      {loadError && (
        <div className="bg-red-50/50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-600">{loadError}</p>
        </div>
      )}

      {result && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase mb-2">
            status: {result.status}
          </p>
          <pre className="text-xs text-slate-600 whitespace-pre-wrap break-words">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
