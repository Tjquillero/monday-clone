/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CatalogoTecnicoView, { CatalogoTecnicoViewProps } from './CatalogoTecnicoView';
import type { ActivityStandard, MissingActivityStandard } from '@/types/scheduler';

function baseProps(overrides: Partial<CatalogoTecnicoViewProps> = {}): CatalogoTecnicoViewProps {
  return {
    boardId: 'board-1',
    pendientes: [],
    catalogo: [],
    isLoading: false,
    isError: false,
    error: null,
    onSave: jest.fn().mockResolvedValue(true),
    isSaving: false,
    saveError: null,
    ...overrides,
  };
}

const PENDIENTE: MissingActivityStandard = {
  activity_key: '2.04',
  description: 'Herbicida grama',
  unit: 'M2-MES',
};

const CONFIGURADO: ActivityStandard = {
  id: 'std-1',
  board_id: 'board-1',
  group_id: null,
  activity_key: '1.01',
  name: 'Limpieza manual',
  category: 'ZONA DE PLAYA',
  unit: 'M2',
  rendimiento: 3000,
  requiere_rendimiento: true,
  priority: 'preferred',
  version: 1,
  effective_from: '2026-07-18',
  effective_to: null,
  source: 'e2e-full-flow-seed',
  created_at: '2026-07-18T00:00:00Z',
};

describe('CatalogoTecnicoView', () => {
  it('muestra la sección Pendientes solo cuando hay actividades sin catálogo técnico', () => {
    const { rerender } = render(<CatalogoTecnicoView {...baseProps()} />);
    expect(screen.queryByText(/Pendientes/)).not.toBeInTheDocument();

    rerender(<CatalogoTecnicoView {...baseProps({ pendientes: [PENDIENTE] })} />);
    expect(screen.getByText('Pendientes (1)')).toBeInTheDocument();
    expect(screen.getByText('2.04')).toBeInTheDocument();
    expect(screen.getByText('Herbicida grama')).toBeInTheDocument();
  });

  it('al configurar una pendiente, sugiere la categoría por rango de código (2.xx -> ZONA VERDE)', () => {
    render(<CatalogoTecnicoView {...baseProps({ pendientes: [PENDIENTE] })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configurar' }));

    expect(screen.getByText('Configurar actividad')).toBeInTheDocument();
    const categorySelect = screen.getByDisplayValue('ZONA VERDE') as HTMLSelectElement;
    expect(categorySelect).toBeInTheDocument();
  });

  it('el botón Guardar queda deshabilitado hasta que el rendimiento sea > 0, y llama a onSave con el payload correcto', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    render(<CatalogoTecnicoView {...baseProps({ pendientes: [PENDIENTE], onSave })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configurar' }));

    const saveButton = screen.getByRole('button', { name: 'Guardar' });
    expect(saveButton).toBeDisabled();

    const rendimientoInput = screen.getByPlaceholderText('Ej. 500');
    fireEvent.change(rendimientoInput, { target: { value: '1200' } });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        activityKey: '2.04',
        description: 'Herbicida grama',
        unit: 'M2-MES',
        category: 'ZONA VERDE',
        rendimiento: 1200,
        requiereRendimiento: true,
      }),
    );

    // El panel se cierra tras un guardado exitoso.
    await waitFor(() => expect(screen.queryByText('Configurar actividad')).not.toBeInTheDocument());
  });

  it('marcar "No aplica rendimiento" oculta el campo numérico y habilita Guardar sin valor (Decisión 4)', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    render(<CatalogoTecnicoView {...baseProps({ pendientes: [PENDIENTE], onSave })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configurar' }));

    const saveButton = screen.getByRole('button', { name: 'Guardar' });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByPlaceholderText('Ej. 500')).not.toBeInTheDocument();
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        activityKey: '2.04',
        description: 'Herbicida grama',
        unit: 'M2-MES',
        category: 'ZONA VERDE',
        rendimiento: null,
        requiereRendimiento: false,
      }),
    );
  });

  it('el catálogo completo muestra "No aplica" en vez de un número cuando requiere_rendimiento es false', () => {
    const noAplica: ActivityStandard = {
      ...CONFIGURADO, id: 'std-3', activity_key: '4.01', name: 'Atención de incidencia',
      requiere_rendimiento: false, rendimiento: null,
    };
    render(<CatalogoTecnicoView {...baseProps({ catalogo: [noAplica] })} />);

    expect(screen.getAllByText('No aplica')).toHaveLength(2); // rendimiento + badge de estado
  });

  it('si onSave falla, el panel permanece abierto y muestra saveError', async () => {
    const onSave = jest.fn().mockResolvedValue(false);
    const { rerender } = render(
      <CatalogoTecnicoView {...baseProps({ pendientes: [PENDIENTE], onSave, saveError: null })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Configurar' }));
    fireEvent.change(screen.getByPlaceholderText('Ej. 500'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    rerender(
      <CatalogoTecnicoView
        {...baseProps({ pendientes: [PENDIENTE], onSave, saveError: 'no se pudo guardar' })}
      />,
    );
    expect(screen.getByText('Configurar actividad')).toBeInTheDocument();
    expect(screen.getByText('no se pudo guardar')).toBeInTheDocument();
  });

  it('el catálogo completo se filtra por texto y por categoría', () => {
    const otraCategoria: ActivityStandard = { ...CONFIGURADO, id: 'std-2', activity_key: '2.01', name: 'Poda arbustos', category: 'ZONA VERDE' };
    render(<CatalogoTecnicoView {...baseProps({ catalogo: [CONFIGURADO, otraCategoria] })} />);

    expect(screen.getByText('Catálogo completo (2)')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Buscar código o nombre...'), { target: { value: '1.01' } });
    expect(screen.getByText('Catálogo completo (1)')).toBeInTheDocument();
    expect(screen.getByText('Limpieza manual')).toBeInTheDocument();
    expect(screen.queryByText('Poda arbustos')).not.toBeInTheDocument();
  });

  it('editar una actividad ya configurada prellena sus valores actuales, no una sugerencia vacía', () => {
    render(<CatalogoTecnicoView {...baseProps({ catalogo: [CONFIGURADO] })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByDisplayValue('ZONA DE PLAYA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3000')).toBeInTheDocument();
  });

  it('muestra el estado de error cuando isError es true', () => {
    render(<CatalogoTecnicoView {...baseProps({ isError: true, error: new Error('fallo de red') })} />);
    expect(screen.getByText('fallo de red')).toBeInTheDocument();
  });
});
