'use client';

// Commit 2: presentación específica de cada variante de ImportPoaResult.
// Componente puramente presentacional — no invoca importPoaService ni
// reimplementa ninguna regla; solo interpreta el resultado ya producido.

import Link from 'next/link';
import {
  CheckCircle2, MapPinX, ScaleIcon, AlertTriangle, ServerCrash, RotateCw,
} from 'lucide-react';
import type { ImportPoaResult } from '@/lib/poaImport/service/types';

interface ImportResultViewProps {
  poaId: string;
  result: ImportPoaResult;
  onRetry?: () => void;
  retrying?: boolean;
}

function SuccessView({ result }: { result: Extract<ImportPoaResult, { status: 'success' }> }) {
  return (
    <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="w-5 h-5" />
        <p className="font-bold">Importación exitosa</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Versión creada</dt>
          <dd className="font-mono text-xs text-slate-700 break-all">{result.versionId}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Actividades importadas</dt>
          <dd className="font-semibold text-slate-800">{result.activitiesImported}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Zonas contratadas</dt>
          <dd className="font-semibold text-slate-800">{result.zonesImported}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Sin cobertura en esta versión</dt>
          <dd className="font-semibold text-slate-800">{result.activitiesNotContracted}</dd>
        </div>
      </dl>
    </div>
  );
}

function UnresolvedZonesSection({ poaId, zones }: { poaId: string; zones: { excelZoneName: string }[] }) {
  if (zones.length === 0) return null;
  return (
    <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-amber-700">
        <MapPinX className="w-5 h-5" />
        <p className="font-bold">{zones.length} zona{zones.length !== 1 ? 's' : ''} sin mapear</p>
      </div>
      <p className="text-sm text-slate-600">
        Estas zonas del Excel todavía no tienen un group asignado en este board. Resuélvelas y vuelve a importar
        el mismo archivo — no hace falta seleccionarlo de nuevo.
      </p>
      <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside">
        {zones.map((z) => (
          <li key={z.excelZoneName}>{z.excelZoneName}</li>
        ))}
      </ul>
      <Link
        href={`/poa/${poaId}/zone-mappings`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-800 underline underline-offset-2"
      >
        Ir a resolver mapeos de zona (pestaña nueva) →
      </Link>
    </div>
  );
}

function AmbiguousFrequencySection({
  activities,
}: {
  activities: { activityKey: string; descripcion: string; discoveryDoc: string }[];
}) {
  if (activities.length === 0) return null;
  return (
    <div className="bg-purple-50/50 border border-purple-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-purple-700">
        <ScaleIcon className="w-5 h-5" />
        <p className="font-bold">{activities.length} actividad{activities.length !== 1 ? 'es' : ''} pendiente{activities.length !== 1 ? 's' : ''} de una decisión de negocio</p>
      </div>
      <p className="text-sm text-slate-600">
        La frecuencia contractual de estas actividades varía por zona en el Excel — esto no se puede resolver desde
        esta pantalla. Requiere una decisión del dueño del proceso, documentada en <code className="text-xs bg-purple-100 px-1 py-0.5 rounded">{activities[0]?.discoveryDoc}</code>.
      </p>
      <ul className="text-sm text-slate-700 space-y-1">
        {activities.map((a) => (
          <li key={a.activityKey}>
            <span className="font-mono text-xs bg-purple-100 px-1.5 py-0.5 rounded mr-2">{a.activityKey}</span>
            {a.descripcion}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ValidationErrorsSection({ errors }: { errors: { message: string; activityKey?: string; excelRow?: number }[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="bg-red-50/50 border border-red-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-red-700">
        <AlertTriangle className="w-5 h-5" />
        <p className="font-bold">{errors.length} error{errors.length !== 1 ? 'es' : ''} en el Excel</p>
      </div>
      <ul className="text-sm text-slate-700 space-y-1.5">
        {errors.map((e, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-red-400">•</span>
            <span>
              {e.excelRow && <span className="text-slate-400">fila {e.excelRow}: </span>}
              {e.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockedView({ poaId, result }: { poaId: string; result: Extract<ImportPoaResult, { status: 'blocked' }> }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">La importación no se completó — revisa lo siguiente:</p>
      <UnresolvedZonesSection poaId={poaId} zones={result.unresolvedZones} />
      <AmbiguousFrequencySection activities={result.ambiguousFrequencyActivities} />
      <ValidationErrorsSection errors={result.validationErrors} />
    </div>
  );
}

function PersistenceFailedView({
  result,
  onRetry,
  retrying,
}: {
  result: Extract<ImportPoaResult, { status: 'persistence_failed' }>;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="bg-red-50/50 border border-red-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-red-700">
        <ServerCrash className="w-5 h-5" />
        <p className="font-bold">No se pudo guardar la importación</p>
      </div>
      <p className="text-sm text-slate-600">{result.message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-40 transition-colors"
        >
          <RotateCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
          Reintentar
        </button>
      )}
      <p className="text-xs text-slate-400 font-mono">sqlState: {result.sqlState}</p>
    </div>
  );
}

export default function ImportResultView({ poaId, result, onRetry, retrying }: ImportResultViewProps) {
  if (result.status === 'success') return <SuccessView result={result} />;
  if (result.status === 'blocked') return <BlockedView poaId={poaId} result={result} />;
  return <PersistenceFailedView result={result} onRetry={onRetry} retrying={retrying} />;
}
