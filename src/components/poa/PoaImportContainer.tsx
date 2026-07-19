'use client';

// Commit 1: esqueleto (selección, invocación). Commit 2: presentación por
// variante de ImportPoaResult (ImportResultView) + reintento que preserva
// el importOperationId del intento original — nunca genera uno nuevo al
// reintentar, solo al seleccionar un archivo distinto (nuevo intento).
// Commit 4: pulido de UX — tras un success, "Importar" se reemplaza por
// "Importar otro archivo" (reintentar ahí generaría una SEGUNDA versión
// real del POA con el mismo archivo — cada importOperationId nuevo es un
// intento nuevo, ver Regla 1 de poa-domain.md); el selector de archivo se
// bloquea mientras hay una importación en curso; y hay un texto de estado
// explícito además del spinner del botón.
//
// Decisión de UX (confirmada antes de escribir esto): un solo paso. El
// usuario selecciona el Excel y se intenta importar de inmediato;
// importPoaService ya encapsula parseo, validación, resolución de contexto
// y persistencia — no hay una "prevalidación" separada que duplique esas
// reglas. blocked/success/persistence_failed se muestran en la misma
// pantalla, sin una vista previa intermedia.

import { useState } from 'react';
import { UploadCloud, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { importPoaVersion } from '@/lib/poaImport/service/importPoaService';
import type { ImportPoaResult } from '@/lib/poaImport/service/types';
import { registerUnresolvedZones } from '@/hooks/usePoaZoneMappings';
import ImportResultView from './ImportResultView';

interface PoaImportContainerProps {
  poaId: string;
}

export default function PoaImportContainer({ poaId }: PoaImportContainerProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [importOperationId, setImportOperationId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportPoaResult | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Fuerza el remount del <input type="file"> al reiniciar, así el navegador
  // permite volver a seleccionar el mismo archivo (si no cambia el "value"
  // del input, el evento change no se dispara la segunda vez).
  const [fileInputKey, setFileInputKey] = useState(0);

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
      setBoardId(poaRow.board_id as string);

      const buffer = await file.arrayBuffer();
      const importResult = await importPoaVersion({
        poaId,
        boardId: poaRow.board_id as string,
        file: buffer,
        importOperationId: operationId,
      });

      setResult(importResult);

      // Registrar como pendientes las zonas nunca antes vistas — así
      // aparecen en /poa/[poaId]/zone-mappings para resolverse. No es una
      // regla nueva: solo persiste lo que import_poa_version() ya decidió
      // que falta (Regla 2 de ADR-0004). No bloquea la pantalla si falla —
      // es un paso complementario, no la importación en sí.
      if (importResult.status === 'blocked' && importResult.unresolvedZones.length > 0 && user?.id) {
        try {
          await registerUnresolvedZones(
            poaId,
            importResult.unresolvedZones.map((z) => z.excelZoneName),
            user.id,
          );
        } catch {
          // silencioso: el usuario ya ve unresolvedZones en el resultado;
          // si el registro falla, la próxima importación lo reintenta.
        }
      }
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
    if (isImporting) return;
    setFile(newFile);
    setResult(null);
    setLoadError(null);
    setImportOperationId(null); // archivo nuevo = intento nuevo
  };

  const handleReset = () => {
    if (isImporting) return;
    setFile(null);
    setResult(null);
    setLoadError(null);
    setImportOperationId(null);
    setFileInputKey((k) => k + 1);
  };

  // Tras un success, "Importar" se oculta: reintentar con el mismo archivo
  // crearía otra versión real (import_poa_version() trata cada
  // importOperationId como un intento nuevo). La única acción disponible
  // es empezar de cero con "Importar otro archivo".
  const isSuccess = result?.status === 'success';

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <label
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-10 transition-colors ${
            isImporting
              ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-60'
              : 'border-slate-200 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30'
          }`}
        >
          <UploadCloud className="w-8 h-8 text-slate-400" />
          <span className="text-sm text-slate-500 font-medium">
            {file ? file.name : 'Selecciona el Excel del POA (.xlsx)'}
          </span>
          <input
            key={fileInputKey}
            type="file"
            accept=".xlsx"
            className="hidden"
            disabled={isImporting}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
        </label>

        {isSuccess ? (
          <button
            type="button"
            onClick={handleReset}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Importar otro archivo
          </button>
        ) : (
          <button
            type="button"
            onClick={handleImport}
            disabled={!file || isImporting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {isImporting ? 'Importando…' : 'Importar'}
          </button>
        )}

        {isImporting && (
          <p className="text-xs text-center text-slate-400">
            Leyendo el archivo, validando actividades y zonas contra el contrato, y guardando la versión — puede
            tardar unos segundos.
          </p>
        )}

        {!isImporting && file && !result && (
          <button
            type="button"
            onClick={handleReset}
            className="w-full text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
          >
            Seleccionar otro archivo
          </button>
        )}
      </div>

      {loadError && (
        <div className="bg-red-50/50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-600">{loadError}</p>
        </div>
      )}

      {result && (
        <ImportResultView
          poaId={poaId}
          boardId={boardId}
          result={result}
          onRetry={result.status === 'persistence_failed' ? handleRetry : undefined}
          retrying={isImporting}
        />
      )}
    </div>
  );
}
