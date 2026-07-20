'use client';

import { useMemo, useState } from 'react';
import { FileText, Upload, CheckCircle2, Search, Download, AlertTriangle } from 'lucide-react';
import { DocumentType, OperationalDocument, UploadOperationalDocumentInput } from '@/hooks/useOperationalDocuments';

// Documentos — Biblioteca Documental de Mantenix (Fase 1). Solo almacenar,
// versionar y marcar vigente — sin fórmula ni interpretación de negocio.
// Los botones de admin no se ocultan por rol (mismo criterio que Catálogo
// Técnico): RLS es la fuente real de verdad, un intento no autorizado falla
// con un mensaje claro en vez de esconder la acción.

interface Props {
  boardId: string;
  documentTypes: DocumentType[];
  documents: OperationalDocument[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onUpload: (input: UploadOperationalDocumentInput) => Promise<unknown>;
  isUploading: boolean;
  uploadError: string | null;
  onMarkVigente: (documentId: string) => void;
  onDownload: (storagePath: string) => void;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OperationalDocumentsView({
  boardId, documentTypes, documents, isLoading, isError, error,
  onUpload, isUploading, uploadError, onMarkVigente, onDownload,
}: Props) {
  const [search, setSearch] = useState('');
  const [uploadOpenFor, setUploadOpenFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) =>
      d.title.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [documents, search]);

  const byType = useMemo(() => {
    const map = new Map<string, OperationalDocument[]>();
    for (const d of filtered) {
      const list = map.get(d.tipo_documento) ?? [];
      list.push(d);
      map.set(d.tipo_documento, list);
    }
    return map;
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-3 px-6 py-4 rounded-xl border border-red-500/30 bg-red-500/10">
        <p className="text-xs text-red-400">{error?.message ?? 'No se pudieron cargar los documentos.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white max-w-md">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título o etiqueta…"
          className="w-full text-sm outline-none"
        />
      </div>

      {documentTypes.map((type) => {
        const docs = byType.get(type.code) ?? [];
        return (
          <div key={type.code} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3B7EF8]" /> {type.name}
              </h3>
              <button
                onClick={() => setUploadOpenFor(uploadOpenFor === type.code ? null : type.code)}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-[#3B7EF8] text-white hover:bg-[#2563EB] transition-colors"
              >
                <Upload className="w-3 h-3" /> Subir documento
              </button>
            </div>

            {uploadOpenFor === type.code && (
              <UploadForm
                boardId={boardId}
                tipoDocumento={type.code}
                isUploading={isUploading}
                uploadError={uploadError}
                onUpload={async (input) => {
                  await onUpload(input);
                  setUploadOpenFor(null);
                }}
                onCancel={() => setUploadOpenFor(null)}
              />
            )}

            {docs.length === 0 ? (
              <p className="px-4 py-4 text-xs text-slate-400">Sin documentos subidos todavía.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 truncate">{d.title}</span>
                        {d.es_vigente ? (
                          <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Vigente
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            Histórico
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {d.version_label}{d.anio ? ` · ${d.anio}` : ''} · {d.file_name} · {formatBytes(d.file_size)}
                        {d.tags.length > 0 && ` · ${d.tags.join(', ')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onDownload(d.storage_path)}
                        title="Descargar"
                        className="p-2 rounded-lg text-slate-400 hover:text-[#3B7EF8] hover:bg-slate-50 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {!d.es_vigente && (
                        <button
                          onClick={() => onMarkVigente(d.id)}
                          className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border border-[#10B981]/40 text-[#10B981] hover:bg-[#10B981]/10 transition-colors"
                        >
                          Marcar vigente
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function UploadForm({
  boardId, tipoDocumento, isUploading, uploadError, onUpload, onCancel,
}: {
  boardId: string;
  tipoDocumento: string;
  isUploading: boolean;
  uploadError: string | null;
  onUpload: (input: UploadOperationalDocumentInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [anio, setAnio] = useState('');
  const [tags, setTags] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const canSubmit = title.trim() && versionLabel.trim() && file && !isUploading;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        await onUpload({
          boardId,
          tipoDocumento,
          anio: anio ? Number(anio) : null,
          versionLabel: versionLabel.trim(),
          title: title.trim(),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          observaciones: observaciones.trim() || null,
          file,
        });
      }}
      className="px-4 py-4 bg-slate-50/50 border-b border-slate-200 space-y-3"
    >
      {uploadError && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-600">{uploadError}</p>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" required
          className="col-span-2 text-xs px-3 py-2 rounded-lg border border-slate-200" />
        <input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="Versión (ej. V1)" required
          className="text-xs px-3 py-2 rounded-lg border border-slate-200" />
        <input value={anio} onChange={(e) => setAnio(e.target.value)} placeholder="Año" type="number"
          className="text-xs px-3 py-2 rounded-lg border border-slate-200" />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Etiquetas, separadas por coma"
          className="col-span-2 text-xs px-3 py-2 rounded-lg border border-slate-200" />
        <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones"
          className="col-span-2 text-xs px-3 py-2 rounded-lg border border-slate-200" />
      </div>
      <input
        type="file"
        accept=".xlsx,.xls,.pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={!canSubmit}
          className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-[#3B7EF8] text-white disabled:opacity-40 disabled:cursor-not-allowed">
          {isUploading ? 'Subiendo…' : 'Confirmar'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}
