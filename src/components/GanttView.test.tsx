/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render } from '@testing-library/react';
import GanttView from './GanttView';
import { Group } from '@/types/monday';
import { UIProvider } from '@/contexts/UIContext';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock @tanstack/react-virtual — JSDOM has no layout engine for virtualizers
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
  }),
}));

// Mock DateRangeModal to avoid importing heavy deps
jest.mock('./DateRangeModal', () => ({
  __esModule: true,
  default: () => null,
}));

// Mock useUI hook
jest.mock('@/contexts/UIContext', () => ({
  UIProvider: ({ children }: any) => children,
  useUI: () => ({
    sidebarOpen: true,
    setSidebarOpen: jest.fn(),
    itemModal: { isOpen: false, groupId: null, item: null },
    openItemModal: jest.fn(),
    closeItemModal: jest.fn(),
    automationsModalOpen: false,
    setAutomationsModalOpen: jest.fn(),
    confirmModal: { isOpen: false, title: '', message: '', onConfirm: jest.fn(), loading: false },
    openConfirmModal: jest.fn(),
    closeConfirmModal: jest.fn(),
  }),
}));

const mockGroups: Group[] = [
  {
    id: 'g1',
    title: 'Grupo de Prueba',
    color: '#ff0000',
    items: [
      {
        id: 'i1',
        name: 'Actividad de Prueba',
        values: {
          status: 'Working on it',
          timeline: { from: '2024-03-01', to: '2024-03-05' },
        },
      },
    ],
  },
];

describe('GanttView Component', () => {
  it('renders the header title correctly', () => {
    const { getByText } = render(<GanttView groups={mockGroups} />);
    expect(getByText(/Cronograma de Actividades/i)).toBeInTheDocument();
  });

  it('renders without crashing with no items', () => {
    const { getByText } = render(<GanttView groups={[]} />);
    expect(getByText(/Cronograma de Actividades/i)).toBeInTheDocument();
  });

  it('shows the "Vista en vivo" indicator', () => {
    const { getByText } = render(<GanttView groups={mockGroups} />);
    expect(getByText(/Vista en vivo/i)).toBeInTheDocument();
  });
});
