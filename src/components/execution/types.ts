import { Group, Column, Item } from '@/types/monday';

export interface ExecutionViewProps {
  groups: Group[];
  columns: Column[];
  activityTemplates?: any[];
  isAdmin?: boolean;
  isRestricted?: boolean;
  onCreateTemplate?: (template: any) => Promise<any>;
  onAddItem?: (groupId: string, name: string) => void;
  onUpdateItem?: (groupId: string, itemId: string | number, field: string, value: any) => void;
  onUpdateItemValue?: (groupId: string, itemId: string | number, columnId: string, value: any) => void;
  onUpdateItemValues?: (groupId: string, itemId: string | number, updates: any) => void;
  onOpenItem?: (groupId: string, item: any, tab?: any) => void;
  onDeleteItem?: (itemId: string | number) => void;
  onDeleteItems?: (itemIds: (string | number)[]) => void;
  onAddSubItem?: (groupId: string, parentId: string | number) => void;
  dependencies?: any[];
  userRole?: string;
}

export interface ExecutionRowProps {
    curr: Item;
    level: number;
    indexStr: string;
    allExpanded: boolean;
    deferredIds: Set<string | number>;
    today: Date;
    group: Group;
    columns: Column[];
    showTodayOnly: boolean;
    isRestricted?: boolean;
    onUpdateItemValue?: (groupId: string, itemId: string | number, columnId: string, value: any) => void;
    onDeleteItem?: (itemId: string | number) => void;
    setPersonnelPicker: (v: any) => void;
    setActivePhotoItem: (v: any) => void;
    setIsPhotoModalOpen: (v: boolean) => void;
    calculateProgressWork: (item: Item) => number;
    calculateTotalJornales: (item: Item) => number;
    calculateVerifiedJornales: (item: Item) => number;
    handleDailyToggle: (groupId: string, item: Item, dateId: string) => void;
    getVal: (item: Item, colId: string) => any;
    getZoneValue: (item: Item) => string;
    days: any[];
    suggestedJornales?: number;
    projectedSchedule?: Record<string, Record<string, number>>;
}
