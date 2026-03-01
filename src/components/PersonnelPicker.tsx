'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { Personnel } from '@/types/monday';
import { UserPlus, Search, Check, X, User } from 'lucide-react';

interface PersonnelPickerProps {
  currentValue: string;
  onSelect: (personnelId: string, personnelName: string) => void;
  onClose: () => void;
  position?: { top: number, left: number };
}

export default function PersonnelPicker({ currentValue, onSelect, onClose, position }: PersonnelPickerProps) {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // New Personnel Form State
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newRate, setNewRate] = useState(0);

  const pickerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchPersonnel();
    
    // Click outside to close
    const handleClickOutside = (event: MouseEvent) => {
        if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
            onClose();
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchPersonnel = async () => {
    try {
      const { data, error } = await supabase.from('personnel').select('*').order('name');
      if (error) throw error;
      setPersonnel(data || []);
    } catch (error) {
      console.error('Error fetching personnel:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;

    try {
        const { data, error } = await supabase.from('personnel').insert([{
            name: newName,
            role: newRole,
            default_rate: newRate
        }]).select().single();

        if (error) throw error;
        
        if (data) {
            setPersonnel([...personnel, data]);
            onSelect(data.id, data.name);
            setIsCreating(false);
        }
    } catch (error) {
        console.error('Error creating personnel:', error);
    }
  };

  const filteredPersonnel = personnel.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const content = (
    <div 
        ref={pickerRef} 
        className={`${position ? 'fixed' : 'absolute'} z-[9999] mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden text-left animation-scale-in`}
        style={position ? { top: position.top, left: position.left } : {}}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
    >
        {isCreating ? (
            <div className="p-4 bg-slate-50">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-700">Nuevo Operario</h3>
                    <button onClick={() => setIsCreating(false)} className="p-1 hover:bg-white rounded-lg transition-all text-slate-400 hover:text-rose-500 shadow-sm border border-transparent hover:border-rose-100">
                        <X className="w-4 h-4"/>
                    </button>
                </div>
                
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Nombre</label>
                        <input 
                            autoFocus
                            className="w-full text-sm border-b-2 border-slate-200 focus:border-emerald-500 outline-none bg-transparent py-1 transition-all"
                            value={newName} 
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Ej. Juan Pérez"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Cargo / Rol</label>
                        <input 
                            className="w-full text-sm border-b-2 border-slate-200 focus:border-emerald-500 outline-none bg-transparent py-1 transition-all"
                            value={newRole} 
                            onChange={e => setNewRole(e.target.value)}
                            placeholder="Ej. Oficial"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Costo Día ($)</label>
                        <input 
                            type="number"
                            className="w-full text-sm border-b-2 border-slate-200 focus:border-emerald-500 outline-none bg-transparent py-1 transition-all"
                            value={newRate} 
                            onChange={e => setNewRate(parseFloat(e.target.value) || 0)}
                        />
                    </div>
                </div>

                <div className="mt-4 flex justify-end">
                    <button 
                        onClick={handleCreate}
                        disabled={!newName}
                        className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-900 shadow-lg shadow-slate-200 disabled:opacity-50 transition-all active:scale-95"
                    >
                        Crear y Asignar
                    </button>
                </div>
            </div>
        ) : (
            <>
                <div className="p-2 border-b border-slate-100 flex items-center bg-white sticky top-0 bg-slate-50/50 backdrop-blur-sm">
                    <Search className="w-4 h-4 text-slate-400 mr-2" />
                    <input 
                        className="w-full text-sm outline-none placeholder:text-slate-400 bg-transparent"
                        placeholder="Buscar operario..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="p-4 text-center text-xs text-slate-400 font-medium">Cargando...</div>
                    ) : filteredPersonnel.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 font-medium">
                            {searchQuery ? 'No encontrado.' : 'No hay personal registrado.'}
                        </div>
                    ) : (
                        filteredPersonnel.map(person => (
                            <button
                                key={person.id}
                                onClick={() => onSelect(person.id, person.name)}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between group transition-colors"
                            >
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold mr-3 border border-slate-200">
                                        {(person.name || '?').charAt(0)}
                                    </div>
                                    <div>
                                        <div className="text-sm text-slate-700 font-bold leading-tight">{person.name}</div>
                                        <div className="text-[10px] text-slate-400 font-medium leading-tight">{person.role || 'Sin cargo'}</div>
                                    </div>
                                </div>
                                {currentValue === person.id && <Check className="w-3 h-3 text-emerald-600" />}
                            </button>
                        ))
                    )}
                </div>

                <div className="p-2 border-t border-slate-100 bg-slate-50/50 md:sticky bottom-0">
                    <button 
                        onClick={() => setIsCreating(true)}
                        className="w-full flex items-center justify-center px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-200 text-emerald-600 text-xs font-bold transition-all shadow-sm"
                    >
                        <UserPlus className="w-3 h-3 mr-2" />
                        Crear Nuevo
                    </button>
                </div>
            </>
        )}
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
