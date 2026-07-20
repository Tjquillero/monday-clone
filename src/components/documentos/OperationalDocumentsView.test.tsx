/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import OperationalDocumentsView from './OperationalDocumentsView';
import type { DocumentType, OperationalDocument } from '@/hooks/useOperationalDocuments';

const TYPES: DocumentType[] = [
  { code: 'POA', name: 'POA', display_order: 1 },
  { code: 'SALARIOS', name: 'Salarios', display_order: 3 },
];

function doc(overrides: Partial<OperationalDocument> = {}): OperationalDocument {
  return {
    id: 'doc-1',
    board_id: 'board-1',
    tipo_documento: 'POA',
    anio: 2026,
    version_label: 'V1',
    es_vigente: false,
    title: 'POA 2026 — primera version',
    tags: [],
    storage_path: 'board-1/POA/v1.xlsx',
    file_name: 'v1.xlsx',
    file_size: 102400,
    document_hash: null,
    observaciones: null,
    uploaded_by: 'user-1',
    created_at: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof OperationalDocumentsView>> = {}) {
  return {
    boardId: 'board-1',
    documentTypes: TYPES,
    documents: [doc()],
    isLoading: false,
    isError: false,
    error: null,
    onUpload: jest.fn(),
    isUploading: false,
    uploadError: null,
    onMarkVigente: jest.fn(),
    onDownload: jest.fn(),
    ...overrides,
  };
}

describe('OperationalDocumentsView', () => {
  it('agrupa los documentos por tipo, mostrando el nombre legible de document_types', () => {
    render(<OperationalDocumentsView {...baseProps()} />);
    expect(screen.getByText('POA')).toBeInTheDocument();
    expect(screen.getByText('Salarios')).toBeInTheDocument();
    expect(screen.getByText('Sin documentos subidos todavía.')).toBeInTheDocument(); // Salarios, sin docs
  });

  it('marca el documento vigente con el badge "Vigente" y los demás como "Histórico"', () => {
    render(<OperationalDocumentsView {...baseProps({
      documents: [doc({ id: 'a', es_vigente: true }), doc({ id: 'b', es_vigente: false, title: 'POA 2026 — otra version' })],
    })} />);
    expect(screen.getByText('Vigente')).toBeInTheDocument();
    expect(screen.getByText('Histórico')).toBeInTheDocument();
  });

  it('el botón "Marcar vigente" solo aparece en documentos no vigentes', () => {
    render(<OperationalDocumentsView {...baseProps({
      documents: [doc({ id: 'a', es_vigente: true }), doc({ id: 'b', es_vigente: false, title: 'Otra' })],
    })} />);
    expect(screen.getAllByText('Marcar vigente')).toHaveLength(1);
  });

  it('clic en "Marcar vigente" llama a onMarkVigente con el id correcto', () => {
    const onMarkVigente = jest.fn();
    render(<OperationalDocumentsView {...baseProps({ documents: [doc({ id: 'doc-42' })], onMarkVigente })} />);
    fireEvent.click(screen.getByText('Marcar vigente'));
    expect(onMarkVigente).toHaveBeenCalledWith('doc-42');
  });

  it('la búsqueda filtra por título', () => {
    render(<OperationalDocumentsView {...baseProps({
      documents: [doc({ id: 'a', title: 'POA 2026' }), doc({ id: 'b', title: 'Contrato marco' })],
    })} />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar por título/), { target: { value: 'contrato' } });
    expect(screen.queryByText('POA 2026')).not.toBeInTheDocument();
    expect(screen.getByText('Contrato marco')).toBeInTheDocument();
  });

  it('la búsqueda filtra por etiqueta', () => {
    render(<OperationalDocumentsView {...baseProps({
      documents: [doc({ id: 'a', title: 'POA 2026', tags: ['vigente-2026'] }), doc({ id: 'b', title: 'Otro doc', tags: [] })],
    })} />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar por título/), { target: { value: 'vigente-2026' } });
    expect(screen.getByText('POA 2026')).toBeInTheDocument();
    expect(screen.queryByText('Otro doc')).not.toBeInTheDocument();
  });

  it('clic en descargar llama a onDownload con el storage_path', () => {
    const onDownload = jest.fn();
    render(<OperationalDocumentsView {...baseProps({ documents: [doc({ storage_path: 'board-1/POA/x.xlsx' })], onDownload })} />);
    fireEvent.click(screen.getByTitle('Descargar'));
    expect(onDownload).toHaveBeenCalledWith('board-1/POA/x.xlsx');
  });

  it('muestra el estado de error explícitamente', () => {
    render(<OperationalDocumentsView {...baseProps({ isError: true, error: new Error('fallo de red') })} />);
    expect(screen.getByText('fallo de red')).toBeInTheDocument();
  });
});
