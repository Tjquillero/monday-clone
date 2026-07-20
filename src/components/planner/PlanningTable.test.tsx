/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import PlanningTable from './PlanningTable';
import type { PlanningActivity } from '@/types/scheduler';

// Regresión (2026-07-19): el nombre de la actividad y los valores de JR
// usaban text-white hardcodeado — invisible/muy bajo contraste en tema
// claro (--bg-primary claro = #fefbf6, texto blanco sobre eso). El resto de
// la app usa var(--text-primary), que sí se adapta (dashboard/page.tsx:393).
// Verificado con captura real + estilo computado antes de corregir.

function activity(overrides: Partial<PlanningActivity> = {}): PlanningActivity {
  return {
    activity_key: '1.09',
    name: 'Corte de troncos',
    category: 'ZONA DE PLAYA',
    priority: 'preferred',
    qty: 350,
    unit: 'UN',
    rendimiento: 20,
    frecuencia: 1,
    theoretical_journals_month: 17.5,
    theoretical_journals_week: 4.38,
    rules: [],
    ...overrides,
  };
}

describe('PlanningTable — contraste de texto adaptable al tema', () => {
  it('el nombre de la actividad usa var(--text-primary), no text-white hardcodeado', () => {
    render(<PlanningTable activities={[activity()]} weeklyAvailable={35} />);
    const name = screen.getByText('Corte de troncos');
    expect(name.className).toContain('var(--text-primary)');
    expect(name.className).not.toMatch(/\btext-white\b/);
  });

  it('el valor de JR/Sem usa var(--text-primary), no text-white hardcodeado', () => {
    render(<PlanningTable activities={[activity()]} weeklyAvailable={35} />);
    const jrSemana = screen.getByText('4.38');
    expect(jrSemana.className).toContain('var(--text-primary)');
    expect(jrSemana.className).not.toMatch(/\btext-white\b/);
  });

  it('la cantidad y el JR/mes también usan var(--text-primary)', () => {
    render(<PlanningTable activities={[activity()]} weeklyAvailable={35} />);
    expect(screen.getByText('350').className).toContain('var(--text-primary)');
    expect(screen.getByText('17.50').className).toContain('var(--text-primary)');
  });

  it('sigue mostrando el nombre completo de la actividad (no solo el badge de categoría)', () => {
    render(<PlanningTable activities={[activity({ name: 'Corte de troncos de madera en playa (long max de 8 m)' })]} weeklyAvailable={35} />);
    expect(screen.getByText('Corte de troncos de madera en playa (long max de 8 m)')).toBeInTheDocument();
    expect(screen.getByText('ZONA DE PLAYA')).toBeInTheDocument();
  });
});
