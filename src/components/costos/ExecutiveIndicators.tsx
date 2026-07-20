'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { TrendingUp, LayoutGrid } from 'lucide-react';
import { BoardSitePlan } from '@/lib/weeklyPlanner';
import { rankSitesByUtilization, computeJrPareto } from '@/lib/executiveIndicators';

// Vista ejecutiva a nivel de BOARD (todas las zonas a la vez) — la sección
// de "aterrizaje" del Dashboard de Costos, antes de entrar al detalle de un
// sitio. Alcance JR únicamente (Fase 3): sin ningún indicador en dinero,
// porque ningún sitio real tiene costo de jornal configurado todavía — ver
// docs/adr (Fase 3 redefinida). No hay fórmula propia: ranking y Pareto son
// solo orden/agrupación de lo que buildBoardPlanningContexts ya calculó.

interface Props {
  sites: BoardSitePlan[];
  onSelectSite: (groupId: string) => void;
  isLoading: boolean;
}

function TooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; activity_key: string; jr: number; cumulativePct: number } }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[#0B1220] px-3 py-2 text-[10px] shadow-xl">
      <p className="font-black text-white">{p.name}</p>
      <p className="text-slate-400">{p.jr.toFixed(2)} JR/mes</p>
      <p className="text-[#3B7EF8]">{p.cumulativePct.toFixed(1)}% acumulado</p>
    </div>
  );
}

export default function ExecutiveIndicators({ sites, onSelectSite, isLoading }: Props) {
  const ranking = useMemo(() => rankSitesByUtilization(sites), [sites]);
  const pareto = useMemo(() => computeJrPareto(sites), [sites]);

  if (isLoading) {
    return (
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4 flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4">
        <p className="text-xs text-slate-500">Ningún sitio tiene un plan con actividades esta semana todavía.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* ── Ranking de sitios ─────────────────────────────────── */}
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-[#3B7EF8]" /> Ranking de sitios
        </h3>
        <div className="space-y-1.5 max-h-72 overflow-auto custom-scrollbar">
          {ranking.map((r) => (
            <button
              key={r.group.id}
              onClick={() => onSelectSite(r.group.id)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.feasible ? 'bg-[#10B981]' : 'bg-red-500'}`} />
                <span className="text-xs text-slate-300 truncate">{r.group.title}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {!r.feasible && (
                  <span className="text-[9px] font-black text-red-400">−{r.deficit.toFixed(1)} JR</span>
                )}
                <span className={`text-xs font-black ${r.feasible ? 'text-white' : 'text-red-400'}`}>{r.utilizacionPct}%</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Pareto de actividades por JR ──────────────────────── */}
      <div className="industrial-card rounded-xl border border-[var(--border-color)] p-4 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#3B7EF8]" /> Pareto de actividades (JR)
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pareto} margin={{ left: -20, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="activity_key" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} angle={-35} textAnchor="end" height={50} />
              <YAxis yAxisId="jr" tick={{ fontSize: 9, fill: '#64748b' }} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} />
              <Tooltip content={<TooltipContent />} />
              <ReferenceLine yAxisId="pct" y={80} stroke="#f59e0b" strokeDasharray="4 4" />
              <Bar yAxisId="jr" dataKey="jr" fill="#3B7EF8" radius={[3, 3, 0, 0]} />
              <Line yAxisId="pct" type="monotone" dataKey="cumulativePct" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
