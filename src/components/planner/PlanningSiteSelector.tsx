'use client';

import React from 'react';
import { MapPin, MapPinOff, ArrowRight, Layers } from 'lucide-react';
import { Group } from '@/types/monday';

interface Props {
  sites: Group[];
  onSelectSite: (siteId: string) => void;
}

export default function PlanningSiteSelector({ sites, onSelectSite }: Props) {
  if (sites.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-[var(--card-bg)] max-w-md w-full rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-[var(--shadow-card)] p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--border-color)] flex items-center justify-center mx-auto text-[var(--text-muted)]">
            <MapPinOff className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-brand font-bold uppercase tracking-widest text-[var(--text-primary)]">
              Sin sitios operativos
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
              Este tablero no cuenta con sitios operativos configurados para la planificación semanal.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6 p-6 overflow-auto custom-scrollbar max-w-5xl mx-auto w-full">
      {/* Header explicativo */}
      <div className="bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] shadow-[var(--shadow-card)] p-6 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[var(--radius-control)] bg-[var(--color-primary-subtle)] border border-[var(--color-primary)]/30 flex items-center justify-center text-[var(--color-primary)] dark:text-[var(--text-primary)]">
            <MapPin className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-brand font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Selecciona un Sitio para Planificar
          </h2>
        </div>
        <p className="text-xs text-[var(--text-secondary)] max-w-2xl leading-relaxed">
          El Cronograma Semanal opera de manera individual por cada sitio de trabajo para calcular la capacidad de jornales, ocurrencias y cuadrillas asignadas. Elige una ubicación:
        </p>
      </div>

      {/* Grid de sitios disponibles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.map((site) => {
          const itemCount = site.items?.length ?? 0;
          return (
            <button
              key={site.id}
              onClick={() => onSelectSite(site.id)}
              className="group bg-[var(--card-bg)] rounded-[var(--radius-surface)] border border-[var(--border-color)] p-5 text-left transition-all duration-200 hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-surface-subtle)] shadow-[var(--shadow-card)] flex flex-col justify-between gap-4 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: site.color || '#3B7EF8' }}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      Sitio Operativo
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--color-surface-subtle)] px-2 py-0.5 rounded-[var(--radius-control)] border border-[var(--border-color)]">
                    {itemCount} {itemCount === 1 ? 'actividad' : 'actividades'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--color-primary)] dark:group-hover:text-[var(--color-accent)] transition-colors line-clamp-1">
                  {site.title}
                </h3>
              </div>

              <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-xs font-bold text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">
                <span className="text-[10px] uppercase tracking-wider">Planificar semana</span>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--color-primary)] dark:text-[var(--color-accent)] transform group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
