'use client';

// Commit 1: esqueleto (selección, invocación). Commit 2: presentación por
// variante de ImportPoaResult (ImportResultView) + reintento que preserva
// el importOperationId del intento original — nunca genera uno nuevo al
// reintentar, solo al seleccionar un archivo distinto (nuevo intento).
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
import ImportResultView from './ImportResultView';

interface PoaImportContainerProps {
  poaId: string;
}

export default function PoaImportContainer({ poaId }: PoaImportContainerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importOperationId, setImportOperationId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportPoaResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const runImport = async (operationId: string) => {
    if (!file) return;
    setIsImporting(true);
    setLoadError(null);

    try {
      const { data: poaRow, error: poaError } = await supabase
        .from('poa')
        .select('board_id')
        .eq('id', poaId)
        .single();
      if (poaError) throw poaError;

      const buffer = await file.arrayBuffer();
      const importResult = await importPoaVersion({
        poaId,
        boardId: poaRow.board_id as string,
        file: buffer,
        importOperationId: operationId,
      });

      setResult(importResult);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error desconocido al importar el archivo.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImport = () => {
    if (!file || isImporting) return;
    setResult(null);
    // Primer intento con este archivo: genera un importOperationId nuevo.
    // Reintentos del MISMO intento (ver handleRetry) reutilizan este mismo id.
    const operationId = crypto.randomUUID();
    setImportOperationId(operationId);
    void runImport(operationId);
  };

  const handleRetry = () => {
    if (!importOperationId || isImporting) return;
    // Mismo importOperationId del intento original — nunca se regenera al
    // reintentar, o se rompería la idempotencia de import_poa_version().
    void runImport(importOperationId);
  };

  const handleFileChange = (newFile: File | null) => {
    setFile(newFile);
    setResult(null);
    setLoadError(null);
    setImportOperationId(null); // archivo nuevo = intento nuevo
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
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
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
        <ImportResultView
          poaId={poaId}
          result={result}
          onRetry={result.status === 'persistence_failed' ? handleRetry : undefined}
          retrying={isImporting}
        />
      )}
    </div>
  );
}
