'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Search, Wrench, X } from 'lucide-react';
import { ActivityCategory, ActivityStandard, MissingActivityStandard } from '@/types/scheduler';

// Vista pura del Catálogo Técnico — responde "¿cómo debe ejecutarse
// técnicamente una actividad?", una pregunta distinta de la que responde
// ResourceEfficiencyWidget ("¿qué tan eficiente está siendo la operación?").
// Pendientes (arriba, sin filtros — el objetivo es resolver bloqueos del
// Cronograma en pocos minutos) y Catálogo completo (abajo, filtrable) usan
// el mismo panel de edición: board_activity_standards es insert-only, así
// que "crear" y "corregir" son la misma operación (useUpsertActivityStandard).
//
// `categoría` no viene del POA (poa_activities no la persiste — brecha
// documentada en poa-excel-import-design.md) — se sugiere por convención de
// rango de código (ya usada y confirmada por el usuario durante Flujo A/B de
// esta sesión) y el operador la confirma o corrige antes de guardar.

const CATEGORY_OPTIONS: ActivityCategory[] = ['ZONA VERDE', 'ZONA DURA', 'ZONA DE PLAYA'];

function suggestCategory(activityKey: string): ActivityCategory {
  const prefix = activityKey.split('.')[0];
  if (prefix === '1') return 'ZONA DE PLAYA';
  if (prefix === '3') return 'ZONA DURA';
  return 'ZONA VERDE';
}

interface EditTarget {
  activityKey: string;
  description: string;
  unit: string;
  category: ActivityCategory;
  rendimiento: number | '';
  requiereRendimiento: boolean;
}

export interface CatalogoTecnicoViewProps {
  boardId: string;
  pendientes: MissingActivityStandard[];
  catalogo: ActivityStandard[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onSave: (target: { activityKey: string; description: string; unit: string; category: ActivityCategory; rendimiento: number | null; requiereRendimiento: boolean }) => Promise<boolean>;
  isSaving: boolean;
  saveError: string | null;
}

export default function CatalogoTecnicoView({
  pendientes, catalogo, isLoading, isError, error, onSave, isSaving, saveError,
}: CatalogoTecnicoViewProps) {
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | 'todas'>('todas');

  const filteredCatalogo = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalogo.filter((s) => {
      const matchesTerm = !term || s.activity_key.toLowerCase().includes(term) || s.name.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === 'todas' || s.category === categoryFilter;
      return matchesTerm && matchesCategory;
    });
  }, [catalogo, search, categoryFilter]);

  const openPendiente = (p: MissingActivityStandard) => {
    setEditTarget({
      activityKey: p.activity_key,
      description: p.description,
      unit: p.unit,
      category: suggestCategory(p.activity_key),
      rendimiento: '',
      requiereRendimiento: true,
    });
  };

  const openConfigurado = (s: ActivityStandard) => {
    setEditTarget({
      activityKey: s.activity_key,
      description: s.name,
      unit: s.unit,
      category: s.category,
      rendimiento: s.rendimiento ?? '',
      requiereRendimiento: s.requiere_rendimiento,
    });
  };

  const canSubmit = !!editTarget && (
    !editTarget.requiereRendimiento ||
    (editTarget.rendimiento !== '' && editTarget.rendimiento > 0)
  );

  const handleSubmit = async () => {
    if (!editTarget || !canSubmit) return;
    const ok = await onSave({
      activityKey: editTarget.activityKey,
      description: editTarget.description,
      unit: editTarget.unit,
      category: editTarget.category,
      rendimiento: editTarget.requiereRendimiento ? (editTarget.rendimiento as number) : null,
      requiereRendimiento: editTarget.requiereRendimiento,
    });
    if (ok) setEditTarget(null);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Cargando catálogo técnico...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 px-6 py-4 rounded-xl border border-red-500/30 bg-red-500/10">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error?.message ?? 'No se pudo cargar el catálogo técnico.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto custom-scrollbar p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
          <Wrench className="w-4 h-4 text-[#3B7EF8]" /> Catálogo Técnico
        </h2>
        <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest">
          Cómo debe ejecutarse técnicamente cada actividad
        </p>
      </div>

      {/* ── Pendientes ──────────────────────────────────────────── */}
      {pendientes.length > 0 && (
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-2">
            Pendientes ({pendientes.length})
          </h3>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-[var(--border-color)]">
                  <th className="p-3">Código</th>
                  <th className="p-3">Actividad</th>
                  <th className="p-3">Unidad</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p) => (
                  <tr key={p.activity_key} className="border-b border-[var(--border-color)] last:border-0">
                    <td className="p-3 font-mono text-slate-300">{p.activity_key}</td>
                    <td className="p-3 text-slate-300">{p.description}</td>
                    <td className="p-3 text-slate-400">{p.unit}</td>
                    <td className="p-3">
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-red-500/40 text-red-400">
                        Pendiente
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => openPendiente(p)}
                        className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-[#3B7EF8] text-white hover:bg-[#2563EB] transition-colors"
                      >
                        Configurar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Catálogo completo ───────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Catálogo completo ({filteredCatalogo.length})
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar código o nombre..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-500/5 border border-[var(--border-color)] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-[#3B7EF8]/50"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ActivityCategory | 'todas')}
              className="px-2 py-1.5 text-xs rounded-lg bg-slate-500/5 border border-[var(--border-color)] text-slate-300 focus:outline-none focus:border-[#3B7EF8]/50"
            >
              <option value="todas">Todas las categorías</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-widest text-slate-500 border-b border-[var(--border-color)]">
                <th className="p-3">Código</th>
                <th className="p-3">Actividad</th>
                <th className="p-3">Categoría</th>
                <th className="p-3">Unidad</th>
                <th className="p-3">Rendimiento</th>
                <th className="p-3">Estado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredCatalogo.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500 text-[10px] uppercase tracking-widest">
                    Sin resultados
                  </td>
                </tr>
              ) : (
                filteredCatalogo.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border-color)] last:border-0">
                    <td className="p-3 font-mono text-slate-300">{s.activity_key}</td>
                    <td className="p-3 text-slate-300">{s.name}</td>
                    <td className="p-3 text-slate-400">{s.category}</td>
                    <td className="p-3 text-slate-400">{s.unit}</td>
                    <td className="p-3 text-slate-300">
                      {s.requiere_rendimiento ? (s.rendimiento as number).toLocaleString() : (
                        <span className="text-slate-500 italic">No aplica</span>
                      )}
                    </td>
                    <td className="p-3">
                      {s.requiere_rendimiento ? (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-400">
                          Configurado
                        </span>
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-slate-500/40 text-slate-400">
                          No aplica
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => openConfigurado(s)}
                        className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-[#3B7EF8]/50 text-[#3B7EF8] hover:bg-[#3B7EF8]/10 transition-colors"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Panel de edición ────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[#0B1220] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-white">Configurar actividad</h3>
              <button onClick={() => setEditTarget(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Código">
                <p className="font-mono text-sm text-slate-300">{editTarget.activityKey}</p>
              </Field>
              <Field label="Descripción">
                <p className="text-sm text-slate-300">{editTarget.description}</p>
              </Field>
              <Field label="Unidad">
                <p className="text-sm text-slate-300">{editTarget.unit}</p>
              </Field>
              <Field label="Categoría">
                <select
                  value={editTarget.category}
                  onChange={(e) => setEditTarget({ ...editTarget, category: e.target.value as ActivityCategory })}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-500/5 border border-[var(--border-color)] text-slate-200 focus:outline-none focus:border-[#3B7EF8]/50"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!editTarget.requiereRendimiento}
                  onChange={(e) => setEditTarget({
                    ...editTarget,
                    requiereRendimiento: !e.target.checked,
                    rendimiento: e.target.checked ? '' : editTarget.rendimiento,
                  })}
                  className="w-3.5 h-3.5"
                />
                No aplica rendimiento (actividad reactiva, por evento o por condición de campo)
              </label>
              {editTarget.requiereRendimiento && (
                <Field label={`Rendimiento (${editTarget.unit} por jornal)`}>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={editTarget.rendimiento}
                    onChange={(e) => setEditTarget({ ...editTarget, rendimiento: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="Ej. 500"
                    autoFocus
                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-500/5 border border-[var(--border-color)] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#3B7EF8]/50"
                  />
                </Field>
              )}
            </div>

            {saveError && <p className="text-xs text-red-400">{saveError}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditTarget(null)}
                className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSaving || !canSubmit}
                className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-lg bg-[#3B7EF8] text-white hover:bg-[#2563EB] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
