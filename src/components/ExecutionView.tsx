'use client';

import { Group, Item, ActivityTemplate, Column, Dependency } from '@/types/monday';
import { motion } from 'framer-motion';
import PersonnelPicker from '@/components/PersonnelPicker';
import Image from 'next/image';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { getSiteCapacity, planDailyActivities } from '@/lib/siteCapacity';
import ActivitySelector from '@/components/ActivitySelector';
import DateRangeModal from '@/components/DateRangeModal';
import { Search, ChevronDown, ChevronRight, LayoutDashboard, Calendar as CalendarIcon, TrendingUp, Plus, Calculator, X, Camera, Check, Wand2, User, Trash2, MoreHorizontal, Loader2, CheckCircle2, Users, AlertTriangle } from 'lucide-react';
import DailyAgendaPanel from './DailyAgendaPanel';

interface ExecutionViewProps {
  groups: Group[];
  onOpenItem?: (groupId: string, item: Item) => void;
  onAddItem?: (groupId: string, name: string, templateValues?: { unit?: string, rend?: number }) => void;
  onAddSubItem?: (groupId: string, parentId: number | string, name: string) => void;
  isAdmin?: boolean;
  onCreateTemplate?: (template: Omit<ActivityTemplate, 'id' | 'created_at'>) => Promise<ActivityTemplate | void>;
  onDeleteItem?: (itemId: number | string) => void;
  onDeleteItems?: (itemIds: (number | string)[]) => void;
  onUpdateItemValue?: (groupId: string, itemId: number | string, columnId: string, value: any) => void;
  onUpdateItem?: (groupId: string, itemId: number | string, field: string, value: any) => void;
  onUpdateItemValues: (groupId: string, itemId: number | string, updates: Record<string, any>) => void;
  activityTemplates: ActivityTemplate[];
  columns: Column[];
  dependencies?: Dependency[];
  userRole?: string;
}


function EditableItemName({ 
  name, 
  onSave, 
  templates, 
  onSelect,
  isAdmin,
  onCreateTemplate,
  disabled
}: { 
  name: string, 
  onSave: (newName: string) => void, 
  templates: ActivityTemplate[],
  onSelect: (template: ActivityTemplate) => void,
  isAdmin?: boolean,
  onCreateTemplate?: (template: Omit<ActivityTemplate, 'id' | 'created_at'>) => Promise<ActivityTemplate | void>,
  disabled?: boolean
}) {
  const [localName, setLocalName] = useState(name);
  
  const ignorePropUpdatesUntil = useRef(0);
  
  useEffect(() => {
    const now = Date.now();
    if (now > ignorePropUpdatesUntil.current) {
        setLocalName(name);
    }
  }, [name]);

  return (
    <ActivitySelector 
      value={localName}
      templates={templates}
      isAdmin={isAdmin}
      disabled={disabled}
      onCreateTemplate={onCreateTemplate}
      onChange={setLocalName}
      onBlur={() => {
        if (localName !== name) {
          ignorePropUpdatesUntil.current = Date.now() + 5000;
          onSave(localName);
        }
      }}
      onEnter={() => {
        if (localName !== name) {
          ignorePropUpdatesUntil.current = Date.now() + 5000;
          onSave(localName);
        }
      }}
      onSelect={(template) => {
        setLocalName(template.name);
        ignorePropUpdatesUntil.current = Date.now() + 5000;
        onSelect(template);
      }}
      className="bg-transparent border-none focus:ring-1 focus:ring-primary rounded w-full h-8 px-1 text-xs font-medium"
    />
  );
}

function EditableCell({ value, onSave, type = "text", className = "", disabled = false }: { value: any, onSave: (val: any) => void, type?: string, className?: string, disabled?: boolean }) {
  const [localValue, setLocalValue] = useState(value);
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    if (localValue !== value) {
      onSave(localValue);
    }
  };

  return (
    <input 
      type={type}
      value={localValue || ''}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={className}
      placeholder="0"
      disabled={disabled}
    />
  );
}

import { uploadEvidencePhoto } from '@/lib/storageUtils';

interface PhotoVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (photoUrl: string, gallery: string[]) => void;
  onDelete?: () => void; // New prop
  itemName: string;
  itemId: string | number;
  initialGallery?: string[];
}

function PhotoVerificationModal({ isOpen, onClose, onSave, onDelete, itemName, itemId, initialGallery = [] }: PhotoVerificationModalProps) {
  const [photos, setPhotos] = useState<{ url: string, file?: File }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mainIndex, setMainIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize state when opening
  useEffect(() => {
    if (isOpen) {
      if (initialGallery && initialGallery.length > 0) {
        setPhotos(initialGallery.map(url => ({ url })));
        setSelectedIndex(0);
        setMainIndex(0);
      } else {
        setPhotos([]);
        setSelectedIndex(0);
        setMainIndex(0);
      }
    }
  }, [isOpen, initialGallery]);

  if (!isOpen) return null;

  // ... (handlers remain same) ...
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newPhotos = Array.from(files).map(file => ({
        url: URL.createObjectURL(file), // Local preview blob
        file
      }));
      
      setPhotos(prev => {
        const updated = [...prev, ...newPhotos];
        if (prev.length === 0) {
           setMainIndex(0);
           setSelectedIndex(0);
        } else {
           setSelectedIndex(prev.length);
        }
        return updated;
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const safeRemovePhoto = (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setPhotos(prev => {
        const updated = prev.filter((_, i) => i !== index);
        if (index === mainIndex) setMainIndex(0);
        else if (index < mainIndex) setMainIndex(mainIndex - 1);
        if (index === selectedIndex) setSelectedIndex(Math.max(0, updated.length - 1));
        else if (index < selectedIndex) setSelectedIndex(selectedIndex - 1);
        return updated;
      });
  };

  const handleConfirm = async () => {
    if (photos.length === 0) return;

    try {
      setIsUploading(true);
      const uploadedUrls = await Promise.all(photos.map(async (p) => {
        if (p.file) {
          return await uploadEvidencePhoto(p.file, itemId);
        } else {
          return p.url;
        }
      }));
      const mainUrl = uploadedUrls[mainIndex] || uploadedUrls[0];
      onSave(mainUrl, uploadedUrls);
    } catch (error) {
      console.error("Error uploading evidence:", error);
      alert("Error al subir evidencias: " + (error as any).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = () => {
      if (confirm('¿Estás seguro de que quieres eliminar estas evidencias?')) {
          onDelete?.();
      }
  };

  const currentPhoto = photos[selectedIndex];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center shadow-inner border border-slate-100">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Galería de Evidencia</h3>
              <p className="text-sm text-slate-400 font-medium truncate max-w-[250px]">{itemName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-all text-slate-300">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {/* Main Preview */}
            <div className="flex-1 bg-slate-50 p-6 flex items-center justify-center relative min-h-[300px] md:min-h-0">
               {currentPhoto ? (
                 <div className="relative w-full h-full max-h-[500px] rounded-2xl overflow-hidden shadow-lg border-4 border-white group/preview">
                    <Image src={currentPhoto.url} alt="Preview" fill className="object-contain bg-slate-900/5" unoptimized />
                    {selectedIndex === mainIndex && (
                        <div className="absolute top-4 left-4 bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center z-10">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> FOTO PRINCIPAL
                        </div>
                    )}
                 </div>
               ) : (
                  <div className="text-center text-slate-400">
                      <div className="w-20 h-20 bg-white rounded-3xl mx-auto mb-4 flex items-center justify-center shadow-sm">
                          <Plus className="w-10 h-10 text-slate-200" />
                      </div>
                      <p className="font-medium">No hay fotos seleccionadas</p>
                  </div>
               )}
            </div>

            {/* Sidebar */}
            <div className="w-full md:w-80 bg-white border-l border-slate-100 flex flex-col max-h-[300px] md:max-h-full">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{photos.length} FOTOS</span>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors flex items-center"
                    >
                        <Plus className="w-3 h-3 mr-1" /> AÑADIR
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {photos.map((photo, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => setSelectedIndex(idx)}
                            className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all flex h-20 bg-slate-50 group shrink-0 ${selectedIndex === idx ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-100 hover:border-slate-300'}`}
                        >
                            <div className="w-20 h-full relative shrink-0">
                                <Image src={photo.url} alt="Thumb" fill className="object-cover" unoptimized />
                            </div>
                            <div className="flex-1 p-2 flex flex-col justify-between">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-bold text-slate-500 truncate">Foto #{idx + 1}</span>
                                    <button 
                                        onClick={(e) => safeRemovePhoto(idx, e)}
                                        className="text-slate-300 hover:text-rose-500 transition-colors p-0.5"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                                {mainIndex === idx ? (
                                    <span className="text-[9px] font-bold text-emerald-600 flex items-center">
                                       <CheckCircle2 className="w-3 h-3 mr-1" /> Principal
                                    </span>
                                ) : (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setMainIndex(idx); }}
                                        className="text-[9px] font-bold text-slate-400 hover:text-emerald-600 text-left opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        Hacer Principal
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {photos.length === 0 && (
                         <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-xl">
                            <p className="text-xs text-slate-400">Sube fotos para crear la galería.</p>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0 flex gap-2">
                    {onDelete && initialGallery.length > 0 && (
                        <button
                            onClick={handleDelete}
                            disabled={isUploading}
                            className="bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 p-3 rounded-xl transition-colors"
                            title="Eliminar todas las evidencias"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    <button 
                        disabled={photos.length === 0 || isUploading}
                        onClick={handleConfirm}
                        className={`flex-1 py-3 rounded-xl text-sm font-black shadow-lg transition-all active:scale-95 flex items-center justify-center ${photos.length > 0 && !isUploading ? 'bg-slate-800 text-white shadow-slate-200 hover:bg-slate-900' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                    >
                        {isUploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {isUploading ? 'Subiendo...' : `Guardar (${photos.length})`}
                    </button>
                </div>
            </div>
        </div>

        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            multiple 
            className="hidden" 
            disabled={isUploading}
        />
      </motion.div>
    </div>
  );
}

export default function ExecutionView({ 
  groups, 
  columns,
  onOpenItem, 
  onAddItem, 
  onDeleteItem, 
  onDeleteItems,
  onUpdateItemValue, 
  onUpdateItem,
  onUpdateItemValues,
  activityTemplates,
  isAdmin,
  onCreateTemplate,
  onAddSubItem,
  dependencies = [],
  // Role-based access control
  userRole
}: ExecutionViewProps) {
   // --- DATE NAVIGATION ---
  const [viewStartDate, setViewStartDate] = useState(new Date());
  const [isAgendaOpen, setIsAgendaOpen] = useState(false);
  
  const today = useMemo(() => {
    // Current real today for highlight logic, but viewStartDate for rendering
    return new Date();
  }, []);
  
  const isRestricted = false;

  // --- FILTER: Solo Hoy ---
  const [showTodayOnly, setShowTodayOnly] = useState(false);

  const getWorkingDayOfMonth = useCallback((date: Date) => {
    let count = 0;
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    while (d.getDate() <= date.getDate() || d.getMonth() < date.getMonth()) {
      if (d.getMonth() > date.getMonth()) break;
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      if (d.getDate() === date.getDate() && d.getMonth() === date.getMonth()) break;
      d.setDate(d.getDate() + 1);
    }
    return Math.max(1, count);
  }, []);

  const workingDayOfMonth = useMemo(() => getWorkingDayOfMonth(viewStartDate), [viewStartDate, getWorkingDayOfMonth]);

  const isActivityDueOnDay = useCallback((frec: number, workingDay: number, date: Date): boolean => {
    if (!frec || frec <= 0) return true;
    
    // High numbers represent days-interval (e.g. 75 days -> approx every 3 months)
    if (frec > 25) {
        const monthCycle = Math.round(frec / 25);
        return workingDay === 1 && (date.getMonth() % monthCycle === 0);
    }
    
    // Low frequency (e.g. 0.5 = every 2 months)
    if (frec < 1) {
        const monthInterval = Math.round(1 / frec);
        return workingDay === 1 && (date.getMonth() % monthInterval === 0);
    }

    const interval = Math.max(1, Math.round(25 / frec));
    return (workingDay - 1) % interval === 0;
  }, []);

  const isActivityDueToday = useCallback((frec: number): boolean => {
    return isActivityDueOnDay(frec, workingDayOfMonth, viewStartDate);
  }, [workingDayOfMonth, viewStartDate, isActivityDueOnDay]);

  const getZoneValue = useCallback((item: Item) => {
    if ((item.values as any)['zone']) return (item.values as any)['zone'];
    for (const key in item.values) {
      const value = (item.values as any)[key];
      if (value === 'Zonas Verdes' || value === 'Zonas Duras' || value === 'Zona de Playa') return value;
    }
    return null;
  }, []);

  // Helper to find value by normalized key OR column title (Consistent with BoardView)
  const getVal = useCallback((item: Item, key: string) => {
    // 1. Literal ID fallback or exact key
    let val = item.values[key];
    if (val !== undefined && val !== null && val !== '') return val;
    
    // 2. Normalized keys fallback (rend, unit, cant)
    const normalizedKeyMap: Record<string, string[]> = {
      'rend': ['rendimiento', 'rend'],
      'unit': ['unidad', 'unit'],
      'cant': ['cantidad', 'cant'],
      'frec': ['frecuencia', 'frec'],
    };

    const targetKeys = normalizedKeyMap[key] || [key];
    
    // Check columns by title
    const col = columns.find(c => {
      const lowTitle = c.title.toLowerCase();
      return targetKeys.some(tk => lowTitle.includes(tk));
    });

    if (col && item.values[col.id] !== undefined && item.values[col.id] !== null && item.values[col.id] !== '') {
      return item.values[col.id];
    }

    // Direct check of item.values for normalized keys
    for (const tk of targetKeys) {
        if (item.values[tk] !== undefined && item.values[tk] !== null && item.values[tk] !== '') {
            return item.values[tk];
        }
    }

    return undefined;
  }, [columns]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);


  const [activePrompt, setActivePrompt] = useState<{ groupId: string, item: Item } | null>(null);
  const [activePhotoItem, setActivePhotoItem] = useState<{ groupId: string, item: Item, dateId?: string } | null>(null);

  const [personnelPicker, setPersonnelPicker] = useState<{ groupId: string, itemId: string | number, currentId: string, top: number, left: number } | null>(null);
  
  const getDayOfYear = (date: Date) => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  };

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(viewStartDate);
    d.setDate(viewStartDate.getDate() + i);
    const id = d.toISOString().split('T')[0];
    const dayNum = getDayOfYear(d);
    const label = `Día ${dayNum}`;
    const sub = d.toLocaleDateString('es-ES', { weekday: 'long' }).toUpperCase();
    const dateStr = d.toLocaleDateString('es-ES');
    return { id, label, sub, date: dateStr };
  }), [viewStartDate]);

  const calculateProgressWork = useCallback((item: Item): number => {
    const itemDays = item.values['daily_execution'] || {};
    const rend = parseFloat(getVal(item, 'rend')) || 0;
    return days.reduce((sum: number, day) => {
      const entry = itemDays[day.id];
      if (!entry) return sum;
      const isObject = typeof entry === 'object';
      const isDone = isObject ? entry.done : true;
      let jornalesVal = isObject ? (entry.val || 0) : (parseFloat(entry) || 0);
      return sum + (isDone ? (jornalesVal * rend) : 0);
    }, 0);
  }, [days, getVal]);

  const calculateTotalJornales = useCallback((item: Item): number => {
    const itemDays = item.values['daily_execution'] || {};
    return days.reduce((sum: number, day) => {
      const entry = itemDays[day.id];
      if (!entry) return sum;
      const isObject = typeof entry === 'object';
      const isDone = isObject ? entry.done : false;
      const val = isObject ? (entry.val || 0) : 0;
      return sum + (isDone ? val : 0);
    }, 0);
  }, [days]);

  const calculateTargetJornales = useCallback((item: Item): number => {
    const itemDays = item.values['daily_execution'] || {};
    return days.reduce((sum: number, day) => {
      const entry = itemDays[day.id];
      if (!entry) return sum;
      const isObject = typeof entry === 'object';
      const val = isObject ? (entry.val || 0) : (parseFloat(entry) || 0);
      return sum + val;
    }, 0);
  }, [days]);

  const calculateTargetWork = useCallback((item: Item): number => {
    const itemDays = item.values['daily_execution'] || {};
    const rend = parseFloat(getVal(item, 'rend')) || 0;
    return days.reduce((sum: number, day) => {
      const entry = itemDays[day.id];
      if (!entry) return sum;
      const isObject = typeof entry === 'object';
      const val = isObject ? (entry.val || 0) : (parseFloat(entry) || 0);
      return sum + (val * rend);
    }, 0);
  }, [days, getVal]);

  const globalCompliance = useMemo(() => {
    if (!groups || groups.length === 0) return 0;
    
    let totalJornalesTargetForPeriod = 0;
    let totalJornalesExecuted = 0;

    groups.forEach(group => {
      group.items.forEach(item => {
        const rend = parseFloat(item.values['rend']) || 0;
        if (rend > 0) {
          totalJornalesTargetForPeriod += calculateTargetJornales(item);
          totalJornalesExecuted += calculateTotalJornales(item);
        }
      });
    });

    return totalJornalesTargetForPeriod > 0 
      ? Math.min(Math.round((totalJornalesExecuted / totalJornalesTargetForPeriod) * 100), 100) 
      : 0;
  }, [groups, calculateTargetJornales, calculateTotalJornales]);

  if (!groups || groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 font-medium italic bg-white border border-gray-100 rounded-xl">
        Cargando datos de ejecución...
      </div>
    );
  }


  const handleValueChange = (groupId: string, itemId: number | string, columnId: string, value: any) => {
    if (onUpdateItemValue) {
      onUpdateItemValue(groupId, itemId, columnId, value);
    }
  };

  const handleSaveDates = (startDate: string, endDate: string) => {
    if (!activePrompt) return;
    
    const { groupId, item: promptItem } = activePrompt;
    
    // ALWAYS find the latest item data from groups state to avoid stale props
    const currentGroup = groups.find(g => g.id === groupId);
    const currentItem = currentGroup?.items.find(i => i.id === promptItem.id);
    const itemData = currentItem || promptItem;

    const cantTotal = parseFloat(itemData.values['cant']) || 0;
    const rend = parseFloat(itemData.values['rend']) || 0;
    const frecVal = itemData.values['frec'];
    const frec = (frecVal !== undefined && frecVal !== '') ? parseFloat(frecVal) : 25;
    
    if (rend > 0 && onUpdateItemValue) {
      const jornalesFormula = cantTotal / rend;
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T00:00:00');
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      // If daily (Frec >= 25), each day needs the FULL jornales.
      // If periodic (Frec < 25), the total jornales is split over the days.
      const jornalesPerDay = frec >= 25 ? jornalesFormula : (jornalesFormula / durationDays);
      
      const newDailyExecution: Record<string, { val: number, done: boolean }> = {};
      let current = new Date(start);
      for (let i = 0; i < durationDays; i++) {
        const dateId = current.toISOString().split('T')[0];
        newDailyExecution[dateId] = { 
          val: parseFloat(jornalesPerDay.toFixed(2)), 
          done: false 
        };
        current.setDate(current.getDate() + 1);
      }
      
      onUpdateItemValue(groupId, itemData.id, 'daily_execution', newDailyExecution);
      // Synchronize timeline for other views (Gantt, Calendar)
      onUpdateItemValue(groupId, itemData.id, 'timeline', { from: startDate, to: endDate });
    }
    
    setIsModalOpen(false);
    setActivePrompt(null);
  };

  const handleSavePhoto = (photoUrl: string, gallery: string[]) => {
    if (!activePhotoItem) return;
    
    const { groupId, item, dateId } = activePhotoItem;
    if (onUpdateItemValue) {
      if (dateId) {
        // Daily verification
        const currentDaily = item.values['daily_execution'] || {};
        let entry = typeof currentDaily[dateId] === 'object' ? { ...currentDaily[dateId] } : { val: parseFloat(currentDaily[dateId]) || 0 };
        
        const cant = parseFloat(item.values['cant']) || 0;
        const rend = parseFloat(item.values['rend']) || 0;
        const dailyJor = rend > 0 ? (cant / rend) : 0;
        
        if (dailyJor > 0 && entry.val > dailyJor * 1.5) {
          entry.val = 0;
        }

        const updatedDaily = { 
          ...currentDaily, 
          [dateId]: { 
            ...entry, 
            done: true, 
            photo: photoUrl,
            gallery: gallery 
          } 
        };
        
        onUpdateItemValue(groupId, item.id, 'daily_execution', updatedDaily);
        
        // Auto-complete item if requirement is met
        const frec = parseFloat(item.values['frec']) || 25;
        const targetChecks = frec >= 25 ? 7 : 1;
        const verifiedCount = Object.values(updatedDaily).filter((d: any) => d.done).length;
        
        if (verifiedCount >= targetChecks) {
          onUpdateItemValue(groupId, item.id, 'status', 'Done');
        }
      } else {
        // General verification
        onUpdateItemValue(groupId, item.id, 'verified', true);
        onUpdateItemValue(groupId, item.id, 'verification_photo', photoUrl);
        onUpdateItemValue(groupId, item.id, 'verification_gallery', gallery);
      }
    }
    
    setIsPhotoModalOpen(false);
    setActivePhotoItem(null);
  };

  const handleDailyToggle = (groupId: string, item: Item, dateId: string) => {
    if (!onUpdateItemValue) return;
    const currentDaily = item.values['daily_execution'] || {};
    const entry = typeof currentDaily[dateId] === 'object' 
      ? { ...currentDaily[dateId] } 
      : { val: parseFloat(currentDaily[dateId]) || 0 };
    
    const updatedDaily = {
      ...currentDaily,
      [dateId]: { 
        ...entry, 
        done: !entry.done 
      }
    };
    onUpdateItemValue(groupId, item.id, 'daily_execution', updatedDaily);
  };

  const handleDeleteEvidence = () => {
      if (!activePhotoItem) return;
      const { groupId, item, dateId } = activePhotoItem;

      if (onUpdateItemValue) {
          if (dateId) {
              // Clear daily verification
              const currentDaily = item.values['daily_execution'] || {};
              const entry = typeof currentDaily[dateId] === 'object' ? { ...currentDaily[dateId] } : { val: 0 };
              
              const updatedDaily = {
                  ...currentDaily,
                  [dateId]: {
                      ...entry,
                      done: false,
                      photo: null,
                      gallery: []
                  }
              };
              onUpdateItemValue(groupId, item.id, 'daily_execution', updatedDaily);
          } else {
              // Clear general verification
              onUpdateItemValue(groupId, item.id, 'verified', false);
              onUpdateItemValue(groupId, item.id, 'verification_photo', null);
              onUpdateItemValue(groupId, item.id, 'verification_gallery', null);
          }
      }
      setIsPhotoModalOpen(false);
      setActivePhotoItem(null);
  };





  const handleAssignPersonnel = (personnelId: string, personnelName: string) => {
    if (!personnelPicker) return;
    const { groupId, itemId } = personnelPicker;
    
    // Optimistic update handled by onUpdateItem (if supported) or manually here
    // Optimistic update handled by onUpdateItem (if supported) or manually here
    
    if (onUpdateItem) {
        onUpdateItem(groupId, itemId, 'personnel_id', personnelId);
    }
    setPersonnelPicker(null);
  };

  const currentMonthYear = today.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-xl shadow-sm font-sans">
      <div className="p-6 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
         <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-slate-200">
               <Calculator className="w-6 h-6" />
            </div>
             <div>
                <h2 className="text-xl font-bold text-slate-800">Seguimiento de Rendimiento</h2>
                <p className="text-sm text-slate-500">Control de ejecución diaria 2026</p>
             </div>
         </div>
          <div className="flex items-center space-x-3">
            {!isRestricted && (
                <button 
                  onClick={() => {
                      if (confirm('¿Generar Proyección 2026 NIVELADA por capacidad de jornales y DEPENDENCIAS?')) {
                          groups.forEach(group => {
                              const capacity = getSiteCapacity(group.title)?.daily_capacity || 10;
                              const groupItems = group.items.map(it => {
                                  const cant = parseFloat(getVal(it, 'cant')) || 0;
                                  const rend = parseFloat(getVal(it, 'rend')) || 0;
                                  const frec = parseFloat(getVal(it, 'frec')) || 25;
                                  const jor = rend > 0 ? (cant / rend) : 0;
                                  const workload = frec >= 25 ? (jor / 25) : jor; 
                                  return { ...it, workload, frec };
                              });

                              const startOfYear = new Date(2026, 0, 1);
                              const endOfYear = new Date(2026, 11, 31);
                              let curr = new Date(startOfYear);
                              
                              const itemExecutions: Record<string, Record<string, { val: number, done: boolean }>> = {};
                              const itemDates: Record<string, { start: string | null, end: string | null }> = {};
                              groupItems.forEach(it => {
                                 itemExecutions[it.id] = {};
                                 itemDates[it.id] = { start: null, end: null };
                              });

                              let pendingWork: { itemId: string | number; remainingVal: number; isDaily: boolean }[] = [];

                              while (curr <= endOfYear) {
                                  const dateId = curr.toISOString().split('T')[0];
                                  const isWeekend = curr.getDay() === 0 || curr.getDay() === 6;
                                  
                                  if (!isWeekend) {
                                      const monthWorkDay = getWorkingDayOfMonth(curr);
                                      let capacityLeft = capacity;

                                      // 1. Add new triggers
                                      groupItems.forEach(it => {
                                          if (isActivityDueOnDay(it.frec, monthWorkDay, curr)) {
                                              pendingWork.push({ 
                                                  itemId: it.id, 
                                                  remainingVal: it.workload, 
                                                  isDaily: it.frec >= 25 
                                              });
                                          }
                                      });

                                      // 2. Sort: Daily first, then by priority/order
                                      pendingWork.sort((a, b) => (a.isDaily === b.isDaily) ? 0 : a.isDaily ? -1 : 1);

                                      // 3. Leveling with Dependency Check
                                      const finishedToday = new Set<string | number>();
                                      const nextPending: typeof pendingWork = [];

                                      for (const task of pendingWork) {
                                          const itemDeps = dependencies.filter(d => d.target_item_id === task.itemId);
                                          const isBlocked = itemDeps.some(d => {
                                              // Blocked if source item still has pending work in the queue
                                              return pendingWork.some(p => p.itemId === d.source_item_id && p !== task);
                                          });

                                          if (!isBlocked && capacityLeft > 0 && task.remainingVal > 0) {
                                              const amountToTake = Math.min(task.remainingVal, capacityLeft);
                                              const existing = itemExecutions[task.itemId][dateId]?.val || 0;
                                              
                                              itemExecutions[task.itemId][dateId] = { 
                                                  val: parseFloat((existing + amountToTake).toFixed(2)), 
                                                  done: false 
                                              };

                                              // Update min/max dates for timeline
                                              if (!itemDates[task.itemId].start) itemDates[task.itemId].start = dateId;
                                              itemDates[task.itemId].end = dateId;
                                              
                                              task.remainingVal -= amountToTake;
                                              capacityLeft -= amountToTake;
                                          }
                                          
                                          if (task.remainingVal > 0.01) {
                                              nextPending.push(task);
                                          } else {
                                              finishedToday.add(task.itemId);
                                          }
                                      }
                                      pendingWork = nextPending;
                                  }
                                  curr.setDate(curr.getDate() + 1);
                              }

                              // 4. Batch Updates
                              groupItems.forEach(it => {
                                  if (onUpdateItemValue) {
                                      onUpdateItemValue(group.id, it.id, 'daily_execution', itemExecutions[it.id]);
                                      if (itemDates[it.id].start && itemDates[it.id].end) {
                                          onUpdateItemValue(group.id, it.id, 'timeline', { 
                                              from: itemDates[it.id].start, 
                                              to: itemDates[it.id].end 
                                          });
                                      }
                                  }
                              });
                          });
                          alert('Proyección 2026 organizada y conectada con éxito.');
                      }
                  }}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center shadow-lg shadow-emerald-700/20 hover:bg-emerald-700 transition-all"
                >
                    <Wand2 className="w-4 h-4 mr-2" /> GENERAR PROYECCIÓN 2026
                </button>
            )}
            <div className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-400 flex items-center shadow-sm">
               <CalendarIcon className="w-4 h-4 mr-2" />
               {currentMonthYear}
            </div>
            <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center border border-emerald-100 shadow-sm">
               <TrendingUp className="w-4 h-4 mr-2" />
               {globalCompliance}% CUMPLIMIENTO
            </div>
          </div>
      </div>

      <div className="px-6 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vista:</span>
          <button
            onClick={() => setShowTodayOnly(false)}
            className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${
              !showTodayOnly ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-100'
            }`}
          >
            TODAS LAS ACTIVIDADES
          </button>
          <button
            onClick={() => setShowTodayOnly(true)}
            className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1.5 ${
              showTodayOnly ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            SOLO HOY (Día Hábil {workingDayOfMonth})
          </button>
        </div>

        <div className="flex items-center gap-4 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
           <button 
             onClick={() => {
                const prev = new Date(viewStartDate);
                prev.setDate(prev.getDate() - 7);
                setViewStartDate(prev);
             }}
             className="p-1 px-2 hover:bg-slate-100 rounded text-slate-400 font-bold"
           >
             &larr;
           </button>
           <input 
              type="date"
              value={viewStartDate.toISOString().split('T')[0]}
              onChange={(e) => setViewStartDate(new Date(e.target.value + 'T00:00:00'))}
              className="text-[10px] font-black text-slate-600 border-none focus:ring-0 p-0 cursor-pointer"
           />
           <button 
             onClick={() => {
                const next = new Date(viewStartDate);
                next.setDate(next.getDate() + 7);
                setViewStartDate(next);
             }}
             className="p-1 px-2 hover:bg-slate-100 rounded text-slate-400 font-bold"
           >
             &rarr;
           </button>
           <button 
             onClick={() => setViewStartDate(new Date())}
             className="text-[9px] font-bold text-slate-400 hover:text-emerald-600 px-2"
           >
              HOY
           </button>
        </div>

        <button 
          onClick={() => setIsAgendaOpen(true)}
          className="flex items-center space-x-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all border border-slate-700"
        >
          <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
          <span>VER AGENDA DIARIA</span>
        </button>
      </div>

      <DailyAgendaPanel 
        key="execute-agenda-panel"
        isOpen={isAgendaOpen}
        onClose={() => setIsAgendaOpen(false)}
        date={viewStartDate}
        groups={groups}
        onVerify={(groupId, item, dateId) => handleDailyToggle(groupId, item, dateId)}
      />

      {/* Grid Container */}
      <div className="overflow-x-auto flex-1 custom-scrollbar">
        <div className="min-w-[1500px]">
          {/* Grid Header */}
          <div className="grid grid-cols-[60px_350px_150px_80px_60px_80px_80px_80px_80px_repeat(7,110px)_110px_100px_60px] bg-white sticky top-0 z-30 shadow-sm border-b border-slate-200">
             <HeaderCell label="ITE" />
             <HeaderCell label="ACTIVIDADES" />
             <HeaderCell label="ENCARGADO" />
             <HeaderCell label="VERIF" />
             <HeaderCell label="U" />
             <HeaderCell label="CANT" />
             <HeaderCell label="REND" />
             <HeaderCell label="JOR. REQ." color="#059669" />
             <HeaderCell label="FREC" />
             {days.map((day, dIdx) => (
             <div key={`header-day-${day.id || dIdx}`} className="border-r border-slate-100 p-2 flex flex-col items-center justify-center bg-slate-50/30">
                  <span className="text-[10px] font-black text-slate-800">{day.label} <span className="text-[8px] text-slate-400 font-bold">(J)</span></span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{day.sub}</span>
                  <span className="text-[8px] text-slate-400 mt-0.5 font-medium">{day.date}</span>
               </div>
             ))}
             <HeaderCell label="META M2" color="#059669" />
             <HeaderCell label="% CUMP." />
             <HeaderCell label="ACC." />
          </div>

          {/* Grid Body */}
          <div className="bg-white">
            {groups.map((group, idx) => {
               const cap = getSiteCapacity(group.title);
               const todayItems = group.items.filter(it =>
                 isActivityDueToday(parseFloat(getVal(it, 'frec')) || 25)
               );
               const plan = cap ? planDailyActivities(todayItems, cap, workingDayOfMonth) : null;
               const deferredIds = new Set(plan?.deferred.map(i => i.id) ?? []);
               const loadPct = cap ? Math.min(100, Math.round(((plan?.totalJornalesRequired ?? 0) / cap.daily_capacity) * 100)) : 0;
               const loadColor = loadPct > 100 ? 'bg-rose-500' : loadPct > 80 ? 'bg-amber-400' : 'bg-emerald-500';
               const loadTextColor = loadPct > 100 ? 'text-rose-600' : loadPct > 80 ? 'text-amber-600' : 'text-emerald-600';

               return (
                <div key={`group-wrapper-${group.id || `idx-${idx}`}`}>
                 {/* Group Header Row */}
                 <div 
                    key={`group-header-${group.id || `idx-${idx}`}`}
                    className="bg-slate-50/50 border-b border-slate-100 flex items-center px-4 py-2 justify-between"
                  >
                    <div className="flex items-center space-x-2">
                       <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: group.color }}></div>
                       <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{group.title}</span>
                       {cap && (
                         <div className="flex items-center gap-2 ml-3">
                           <div className="flex items-center gap-1 text-[10px] text-slate-400">
                             <Users className="w-3 h-3" />
                             <span className={`font-bold ${loadTextColor}`}>
                               {(plan?.totalJornalesRequired ?? 0).toFixed(1)} / {cap.daily_capacity} jor.
                             </span>
                           </div>
                           <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                             <div
                               className={`h-full rounded-full transition-all ${loadColor}`}
                               style={{ width: `${Math.min(100, loadPct)}%` }}
                             />
                           </div>
                           {plan?.overloaded && (
                             <div className="flex items-center gap-1 text-[10px] text-rose-500 font-bold">
                               <AlertTriangle className="w-3 h-3" />
                               {plan.deferred.length} diferidas
                             </div>
                           )}
                         </div>
                       )}
                    </div>
                    {!isRestricted && (
                      <div className="flex items-center space-x-2">
                         {showTodayOnly && plan && plan.scheduledToday.length > 0 && (
                            <button
                                onClick={() => {
                                    if (confirm(`¿Auto-asignar jornales planificados para hoy en ${group.title}?`)) {
                                        plan.scheduledToday.forEach(item => {
                                            const todayId = today.toISOString().split('T')[0];
                                            const currentDaily = item.values['daily_execution'] || {};
                                            // Only assign if it doesn't have a value or it's 0, to avoid overwriting manual edits
                                            if (!currentDaily[todayId] || (typeof currentDaily[todayId] === 'object' && !currentDaily[todayId].val)) {
                                                const jor = (item as any).jornalesPerOccurrence || 0;
                                                const entry = typeof currentDaily[todayId] === 'object' ? { ...currentDaily[todayId], val: jor } : { val: jor, done: false };
                                                if (onUpdateItemValue) {
                                                    onUpdateItemValue(group.id, item.id, 'daily_execution', {
                                                        ...currentDaily,
                                                        [todayId]: entry
                                                    });
                                                }
                                            }
                                        });
                                    }
                                }}
                                className="flex items-center text-[10px] font-black text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-all shadow-sm shadow-emerald-700/20"
                            >
                                <Wand2 className="w-3 h-3 mr-1.5" /> ASIGNAR JORNALES PLAN
                            </button>
                         )}
                         <button 
                           onClick={() => onAddItem && onAddItem(group.id, 'Nueva Actividad')}
                           className="flex items-center text-[10px] font-bold text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 px-2 py-1.5 rounded-lg transition-all border border-transparent hover:border-emerald-100"
                         >
                           <Plus className="w-3 h-3 mr-1" /> Añadir Actividad
                         </button>
                      </div>
                    )}
                 </div>

                 {group.items
                     .filter(item => {
                        if (!showTodayOnly) return true;
                        const todayId = today.toISOString().split('T')[0];
                        const isPrimaryDue = isActivityDueToday(parseFloat(getVal(item, 'frec')) || 25);
                        const hasTodayValue = !!(item.values['daily_execution']?.[todayId]);
                        
                        // Show if it's planned for today and not deferred, OR if it has a manual value/photo for today
                        if (hasTodayValue) return true;
                        if (!isPrimaryDue || deferredIds.has(item.id)) return false;
                        
                        return true;
                     })
                    .map((item: Item, idx: number) => {
                    const renderRow = (currentItem: Item, level: number = 0, indexStr: string) => {
                        const isSubItem = level > 0;
                        const isDeferred = deferredIds.has(currentItem.id);
                        const todayId = today.toISOString().split('T')[0];
                        const cantTotal = parseFloat(getVal(currentItem, 'cant')) || 0;
                        const rend = parseFloat(getVal(currentItem, 'rend')) || 0;
                        const frec = parseFloat(getVal(currentItem, 'frec')) || 25; 
                        const unit = getVal(currentItem, 'unit') || 'M2';
                        const executedWork = calculateProgressWork(currentItem);
                        const executedJornales = calculateTotalJornales(currentItem);
                        
                        const targetJornalesForPeriod = calculateTargetJornales(currentItem);
                        const targetWorkForPeriod = calculateTargetWork(currentItem);
                        
                        const progress = targetJornalesForPeriod > 0 ? (executedJornales / targetJornalesForPeriod) * 100 : 0;
                        
                        const incidents = currentItem.values['incidents'] || [];
                        const hasIncidents = incidents.length > 0;
                        const criticalIncidents = incidents.filter((inc: any) => inc.severity === 'Critical').length;
                      
                      return (
                        <div key={`row-${currentItem.id}-${indexStr}`}>
                            <div 
                              key={`item-content-${currentItem.id || indexStr}`}
                              className={`grid grid-cols-[60px_350px_150px_80px_60px_80px_80px_80px_80px_repeat(7,110px)_110px_100px_60px] border-b border-slate-50 hover:bg-slate-50/50 transition-colors h-[48px] items-center ${isSubItem ? 'bg-slate-50/20' : ''} ${hasIncidents ? 'bg-rose-50/10' : ''} ${isDeferred ? 'opacity-50 bg-amber-50/40' : ''}`}
                            >
                               <Cell text={indexStr} gray={isSubItem} />
                               <div className="px-4 text-xs font-medium text-slate-700 h-full flex items-center relative">
                                  {isSubItem && (
                                     <div className="absolute left-0 top-0 bottom-0 w-4 border-l-2 border-slate-200 ml-2"></div>
                                  )}
                                  {hasIncidents && (
                                       <div className={`absolute left-0 top-0 bottom-0 w-1 ${criticalIncidents > 0 ? 'bg-rose-500' : 'bg-rose-300'} rounded-r-lg ${criticalIncidents > 0 ? 'animate-pulse' : ''}`} title={`${incidents.length} Incidencias reportadas`}></div>
                                  )}
                                  {isDeferred && (
                                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400 rounded-r-lg" title="Actividad diferida: sin capacidad hoy"></div>
                                   )}
                                   <div className={`w-full ${isSubItem ? 'pl-4' : ''}`}>
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        {isDeferred && (
                                          <span className="inline-flex items-center gap-1 text-[8px] font-black text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded shadow-sm border border-amber-200/50">
                                            ↷ DIFERIDA
                                          </span>
                                        )}
                                        {(() => {
                                          const zone = getZoneValue(currentItem);
                                          if (!zone) return null;
                                          return (
                                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${
                                              zone === 'Zonas Verdes' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                              zone === 'Zonas Duras' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                                              'bg-amber-50 text-amber-700 border-amber-100'
                                            }`}>
                                              {zone === 'Zonas Verdes' ? '🌿' : zone === 'Zonas Duras' ? '🏗️' : '🏖️'} {zone.toUpperCase()}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                      <EditableItemName 
                                        name={currentItem.name} 
                                        templates={activityTemplates}
                                        isAdmin={isAdmin}
                                        disabled={isRestricted}
                                        onCreateTemplate={onCreateTemplate}
                                        onSave={(newName) => onUpdateItem && onUpdateItem(group.id, currentItem.id, 'name', newName)} 
                                        onSelect={(template) => {
                                           if (onUpdateItem) onUpdateItem(group.id, currentItem.id, 'name', template.name);
                                           onUpdateItemValues(group.id, currentItem.id, {
                                             unit: template.unit || '',
                                             rend: template.rend || 0,
                                             category: template.category || ''
                                           });
                                         }} 
                                      />
                                  </div>
                               </div>

                                {/* Personnel Column */}
                               <div className="h-full border-r border-slate-50 flex items-center justify-center px-2">
                                  <button 
                                    disabled={isRestricted}
                                    onClick={(e) => {
                                        if (isRestricted) return;
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setPersonnelPicker({
                                            groupId: group.id,
                                            itemId: currentItem.id,
                                            currentId: currentItem.personnel_id || '',
                                            top: rect.bottom + window.scrollY,
                                            left: rect.left + window.scrollX
                                        });
                                    }}
                                    className={`w-full h-8 rounded-lg flex items-center px-2 transition-all border border-transparent ${currentItem.personnel_id ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border-slate-100'}`}
                                  >
                                     {currentItem.personnel ? (
                                        <>
                                            <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[8px] font-bold mr-2 border border-slate-300">
                                                {(currentItem.personnel.name || '?').charAt(0)}
                                            </div>
                                            <span className="text-[10px] font-bold truncate">{currentItem.personnel.name}</span>
                                        </>
                                     ) : (
                                        <>
                                            <User className="w-3 h-3 mr-2" />
                                            <span className="text-[10px] font-bold">Asignar</span>
                                        </>
                                     )}
                                  </button>
                               </div>

                               {/* Verification Column */}
                               <div className="h-full border-r border-slate-50 flex items-center justify-center">
                                  {currentItem.values['verified'] ? (
                                    <div className="relative group/thumb">
                                       <Image src={currentItem.values['verification_photo']} alt="Thumb" width={32} height={32} className="rounded border border-emerald-200 object-cover cursor-pointer hover:scale-150 transition-transform z-10" />
                                       <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center border border-white">
                                          <Check className="w-2 h-2 text-white" />
                                       </div>
                                    </div>
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        setActivePhotoItem({ groupId: group.id, item: currentItem });
                                        setIsPhotoModalOpen(true);
                                      }}
                                      className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all shadow-sm"
                                      title="Verificar actividad"
                                    >
                                       <Camera className="w-4 h-4" />
                                    </button>
                                  )}
                               </div>
                               
                               <div className="h-full border-r border-slate-50 flex items-center justify-center">
                                  <EditableCell 
                                    value={unit}
                                    disabled={isRestricted}
                                    onSave={(val) => handleValueChange(group.id, currentItem.id, 'unit', val)}
                                    className="w-full h-8 text-center text-xs text-slate-400 bg-transparent focus:ring-1 focus:ring-emerald-500/20 rounded border-none font-medium"
                                  />
                               </div>

                               <div className="h-full border-r border-slate-50 flex items-center justify-center">
                                  <EditableCell 
                                    type="number"
                                    value={getVal(currentItem, 'cant')}
                                    disabled={isRestricted}
                                    onSave={(val) => handleValueChange(group.id, currentItem.id, 'cant', val)}
                                    className="w-full h-8 text-center text-xs font-black text-slate-700 bg-transparent focus:ring-1 focus:ring-emerald-500/20 rounded border-none"
                                  />
                               </div>

                               <div className="h-full border-r border-slate-50 flex items-center justify-center">
                                  <EditableCell 
                                    type="number"
                                    value={getVal(currentItem, 'rend')}
                                    disabled={isRestricted}
                                    onSave={(val) => handleValueChange(group.id, currentItem.id, 'rend', val)}
                                    className="w-full h-8 text-center text-xs text-slate-500 bg-transparent focus:ring-1 focus:ring-emerald-500/20 rounded border-none font-medium"
                                  />
                               </div>

                                <div className="flex items-center justify-center h-full border-r border-slate-50 bg-emerald-50/30 group/total">
                                   <span className="text-xs font-black text-emerald-700">
                                     {(rend > 0 && cantTotal > 0) ? (cantTotal / rend).toFixed(2) : ''}
                                   </span>
                                   {!isRestricted && (
                                    <button 
                                      onClick={() => {
                                        setActivePrompt({ groupId: group.id, item: currentItem });
                                        setIsModalOpen(true);
                                      }}
                                      className="ml-1 p-1 text-emerald-600 hover:bg-emerald-100 rounded transition-all opacity-0 group-hover/total:opacity-100"
                                      title="Programar Distribución Automatizada"
                                    >
                                      <Wand2 className="w-3.5 h-3.5" />
                                    </button>
                                   )}
                                </div>

                                <div className="h-full border-r border-slate-50 flex items-center justify-center">
                                   <EditableCell 
                                     type="number"
                                     value={getVal(currentItem, 'frec') || '25'}
                                     disabled={isRestricted}
                                     onSave={(val) => handleValueChange(group.id, currentItem.id, 'frec', val)}
                                     className="w-full h-8 text-center text-xs text-slate-400 bg-transparent focus:ring-1 focus:ring-emerald-500/20 rounded border-none font-bold"
                                   />
                                </div>
                               
                               {days.map((day, dIdx) => {
                               const dailyEntry = (currentItem.values['daily_execution'] || {})[day.id];
                               const isDone = typeof dailyEntry === 'object' ? dailyEntry.done : false;
                               const dailyVal = typeof dailyEntry === 'object' ? dailyEntry.val : dailyEntry;
                               const dailyPhoto = typeof dailyEntry === 'object' ? dailyEntry.photo : null;

                               return (
                                <div key={`cell-day-${day.id || dIdx}-${currentItem.id || indexStr}`} className={`h-full border-r border-slate-50 flex items-center px-1 transition-colors ${isDone ? 'bg-emerald-50/50' : ''}`}>
                                      <div className="flex flex-col items-center w-full space-y-1 relative group/cell">
                                        <input 
                                          type="checkbox"
                                          checked={isDone}
                                          onChange={(e) => {
                                            if (e.target.checked && !dailyPhoto) {
                                              setActivePhotoItem({ groupId: group.id, item: currentItem, dateId: day.id });
                                              setIsPhotoModalOpen(true);
                                            } else {
                                              const currentDaily = currentItem.values['daily_execution'] || {};
                                              const entry = typeof dailyEntry === 'object' ? { ...dailyEntry } : { val: parseFloat(dailyEntry) || 0 };
                                              handleValueChange(group.id, currentItem.id, 'daily_execution', { 
                                                ...currentDaily, 
                                                [day.id]: { ...entry, done: e.target.checked } 
                                              });
                                            }
                                          }}
                                          className="w-3 h-3 rounded text-emerald-600 focus:ring-emerald-500/20 border-slate-300 cursor-pointer"
                                        />
                                        
                                        {dailyPhoto ? (
                                          <div className="relative group/daythumb">
                                            {/* Debug: {console.log('Rendering daily photo:', dailyPhoto)} */}
                                            <Image 
                                                src={dailyPhoto} 
                                                alt="Day" 
                                                width={20} 
                                                height={20} 
                                                className="rounded object-cover border border-emerald-200 cursor-zoom-in hover:scale-[3] transition-transform z-20 bg-white" 
                                                unoptimized
                                            />
                                          </div>
                                        ) : (
                                          <div className="flex flex-col items-center">
                                            <span className={`text-[10px] font-black ${isDone ? 'text-emerald-700' : (dailyVal ? 'text-slate-400' : 'text-slate-200')}`}>
                                              {dailyVal ? Number(dailyVal).toFixed(2) : ''}
                                            </span>
                                            {dailyVal && rend > 0 && (
                                              <span className="text-[8px] text-slate-300 font-bold">
                                                 ≈ {Math.round(Number(dailyVal) * rend).toLocaleString()} {unit}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                   </div>
                                 );
                               })}

                                <div className="flex flex-col items-center justify-center h-full px-2 bg-slate-50/50">
                                  <span className="text-xs font-black text-slate-800 mb-1">
                                    {Math.round(executedWork).toLocaleString()} / {Math.round(targetWorkForPeriod).toLocaleString()}
                                  </span>
                                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden relative">
                                     <div className="absolute inset-0 bg-slate-200" />
                                     <motion.div 
                                       initial={{ width: 0 }}
                                       animate={{ width: `${Math.min(progress, 100)}%` }}
                                       className={`h-full absolute left-0 top-0 ${progress >= 100 ? 'bg-emerald-500' : 'bg-slate-800'}`}
                                     />
                                  </div>
                                  <span className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Meta del Periodo</span>
                                </div>

                                <div className="flex flex-col items-center justify-center h-full border-l border-slate-50 space-y-0.5 bg-slate-50/30">
                                   <span className="text-[10px] font-black text-slate-800">
                                      {executedJornales.toFixed(2)} / {targetJornalesForPeriod.toFixed(2)} J
                                   </span>
                                   <span className={`text-[10px] font-bold ${progress >= 100 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                      {Math.min(Math.round(progress), 100)}%
                                   </span>
                                </div>

                               <div className="flex items-center justify-center border-l border-slate-50 space-x-1 px-2 group/actions">

                                  {!isRestricted && (
                                   <>
                                      <button 
                                        onClick={() => onAddSubItem && onAddSubItem(group.id, currentItem.id, 'Nueva Subactividad')}
                                        className="p-1.5 hover:bg-slate-50 text-slate-300 hover:text-slate-600 rounded-lg transition-all opacity-0 group-hover/actions:opacity-100"
                                        title="Añadir Subactividad"
                                      >
                                         <Plus className="w-4 h-4" />
                                      </button>
                                      {isAdmin && (<button 
                                        onClick={() => {
                                          if (confirm(`¿Eliminar actividad "${currentItem.name}"?`)) {
                                            if (onDeleteItems) {
                                              onDeleteItems([currentItem.id]);
                                            } else {
                                              onDeleteItem?.(currentItem.id);
                                            }
                                          }
                                        }}
                                        className="p-1.5 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-lg transition-all cursor-pointer z-[60] shadow-sm border border-rose-100"
                                        title="Eliminar actividad"
                                      >
                                         <Trash2 className="w-4 h-4" />
                                      </button>)}
                                   </>
                                  )}
                                  <button 
                                    onClick={() => onOpenItem && onOpenItem(group.id, currentItem)}
                                    className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-300 hover:text-slate-600 transition-all opacity-0 group-hover/actions:opacity-100"
                                    title="Detalles"
                                  >
                                     <MoreHorizontal className="w-4 h-4" />
                                  </button>
                               </div>
                            </div>
                            
                            {/* Recursive Render */}
                            {currentItem.subItems && currentItem.subItems
                                .filter(sub => {
                                    if (!showTodayOnly) return true;
                                    const todayId = today.toISOString().split('T')[0];
                                    const isDue = isActivityDueToday(parseFloat(sub.values['frec']) || 25);
                                    const hasVal = !!(sub.values['daily_execution']?.[todayId]);
                                    return isDue || hasVal;
                                })
                                .map((sub, sIdx) => renderRow(sub, level + 1, `${indexStr}.${sIdx + 1}`))}
                        </div>
                      );
                  };

                   return renderRow(item, 0, (idx + 1).toString());
                 })}
               </div>
               );
             })}
           </div>
        </div>
      </div>

      {personnelPicker && (
        <PersonnelPicker 
            key="execute-personnel-picker"
            currentValue={personnelPicker.currentId}
            onSelect={handleAssignPersonnel}
            onClose={() => setPersonnelPicker(null)}
            position={{ top: personnelPicker.top, left: personnelPicker.left }}
        />
      )}


      <DateRangeModal 
        key="execute-date-modal"
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveDates}
        itemName={activePrompt?.item.name || ''}
        expectedDays={activePrompt ? (parseFloat(activePrompt.item.values['cant']) / (parseFloat(activePrompt.item.values['rend']) || 1)) : 0}
      />

      <PhotoVerificationModal 
        key="execute-photo-modal"
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        onSave={handleSavePhoto}
        onDelete={handleDeleteEvidence}
        itemName={activePhotoItem?.item.name || ''}
        itemId={activePhotoItem?.item.id || ''}
        initialGallery={(() => {
          if (!activePhotoItem) return [];
          const { item, dateId } = activePhotoItem;
          if (dateId) {
             const entry = (item.values['daily_execution'] || {})[dateId];
             if (entry && typeof entry === 'object') {
                return entry.gallery || (entry.photo ? [entry.photo] : []);
             }
             return [];
          } else {
             return item.values['verification_gallery'] || (item.values['verification_photo'] ? [item.values['verification_photo']] : []);
          }
        })()}
      />



      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 8px;
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e2e2;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}

function HeaderCell({ label, color = "#9ca3af" }: { label: string, color?: string }) {
  return (
    <div className="border-r border-gray-100 p-3 h-full flex items-center justify-center">
       <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</span>
    </div>
  );
}

function Cell({ text, weight = "normal", color = "#4b5563", gray = false, bg = "transparent" }: { text: string, weight?: string, color?: string, gray?: boolean, bg?: string }) {
  return (
    <div className="h-full border-r border-gray-50 p-1 flex items-center justify-center" style={{ backgroundColor: bg }}>
       <span className={`text-xs truncate px-2 ${gray ? 'text-gray-400' : ''}`} style={{ fontWeight: weight, color }}>
         {text}
       </span>
    </div>
  );
}
