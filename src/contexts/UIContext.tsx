import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Item } from '@/types/monday';

interface UIContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  // Modal States
  itemModal: {
    isOpen: boolean;
    selectedItem: { groupId: string; item: Item } | null;
  };
  automationsModalOpen: boolean;
  confirmModal: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: (() => void) | null;
  };
  // Modal Actions
  openItemModal: (groupId: string, item: Item) => void;
  closeItemModal: () => void;
  setAutomationsModalOpen: (open: boolean) => void;
  openConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  closeConfirmModal: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within UIProvider');
  }
  return context;
}

export function UIProvider({ children }: { children: ReactNode }) {
  // Load sidebar state from localStorage
  const [sidebarOpen, setSidebarOpenState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mantenix-sidebar-open');
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });

  const [searchQuery, setSearchQueryState] = useState('');

  // Modals
  const [itemModal, setItemModal] = useState<UIContextType['itemModal']>({
    isOpen: false,
    selectedItem: null
  });
  const [automationsModalOpen, setAutomationsModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<UIContextType['confirmModal']>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mantenix-sidebar-open', JSON.stringify(open));
    }
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
  }, []);

  const openItemModal = useCallback((groupId: string, item: Item) => {
    setItemModal({ isOpen: true, selectedItem: { groupId, item } });
  }, []);

  const closeItemModal = useCallback(() => {
    setItemModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openConfirmModal = useCallback((title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm });
  }, []);

  const closeConfirmModal = useCallback(() => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const value = useMemo(() => ({
    sidebarOpen,
    setSidebarOpen,
    searchQuery,
    setSearchQuery,
    itemModal,
    openItemModal,
    closeItemModal,
    automationsModalOpen,
    setAutomationsModalOpen,
    confirmModal,
    openConfirmModal,
    closeConfirmModal
  }), [
    sidebarOpen, setSidebarOpen, searchQuery, setSearchQuery,
    itemModal, openItemModal, closeItemModal,
    automationsModalOpen, confirmModal, openConfirmModal, closeConfirmModal
  ]);

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}
