'use client';

// UI de resolución de mapeos de zona (ADR-0004). Muestra los excel_zone_name
// pendientes de asignar (poa_zone_mappings.group_id IS NULL) para un POA, y
// permite elegir el group real del board al que corresponde cada uno.
//
// Alcance de esta primera versión: reasignar mapeos ya existentes cuyo group
// se eliminó (Regla 5 de ADR-0004). Las zonas completamente nuevas de un
// Excel recién importado todavía no crean una fila aquí — ver
// src/hooks/usePoaZoneMappings.ts.

import { useState } from 'react';
import { Loader2, MapPinX, AlertTriangle, MapPin, Check } from 'lucide-react';
import { usePoaZoneMappings, useResolveZoneMapping } from '@/hooks/usePoaZoneMappings';

interface ZoneMappingsResolverProps {
  poaId: string;
}

export default function ZoneMappingsResolver({ poaId }: ZoneMappingsResolverProps) {
  const { data, isLoading, isError, error } = usePoaZoneMappings(poaId);
  const resolveMapping = useResolveZoneMapping(poaId);

  const [selections, setSelections] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<{ mappingId: string; message: string } | null>(null);

  const handleResolve = (mappingId: string) => {
    const groupId = selections[mappingId];
    if (!groupId) return;
    setRowError(null);
    resolveMapping.mutate(
      { mappingId, groupId },
      {
        onError: (e) => setRowError({ mappingId, message: e.message }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Cargando mapeos pendientes…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-red-50/50 rounded-2xl border-2 border-dashed border-red-200">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-4" />
        <p className="text-red-500 font-medium">No se pudieron cargar los mapeos de zona.</p>
        <p className="text-xs text-red-400 mt-1">{error instanceof Error ? error.message : 'Error desconocido'}</p>
      </div>
    );
  }

  const pending = data?.pending ?? [];
  const groups = data?.groups ?? [];

  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
        <MapPin className="w-8 h-8 text-slate-300 mb-4" />
        <p className="text-slate-500 font-medium">Sin mapeos de zona pendientes</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 mb-2">
        <span className="font-semibold text-slate-700">{pending.length}</span> zona{pending.length !== 1 ? 's' : ''} pendiente{pending.length !== 1 ? 's' : ''} de asignar
      </p>

      {pending.map((mapping) => {
        const busy = resolveMapping.isPending && resolveMapping.variables?.mappingId === mapping.id;
        const selected = selections[mapping.id] ?? '';

        return (
          <div key={mapping.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-500 flex items-center justify-center flex-shrink-0">
                <MapPinX className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-slate-800">{mapping.excelZoneName}</p>
                <p className="text-xs text-slate-400">Zona del Excel sin group asignado en este board</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <select
                value={selected}
                onChange={(e) => setSelections((prev) => ({ ...prev, [mapping.id]: e.target.value }))}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">Selecciona un group del board…</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleResolve(mapping.id)}
                disabled={!selected || busy}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Asignar
              </button>
            </div>

            {rowError?.mappingId === mapping.id && (
              <p className="text-xs text-red-500">{rowError.message}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
