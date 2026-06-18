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
        className={`${position ? 'fixed' : 'absolute'} z-[9999] mt-2 w-80 bg-[var(--bg-secondary)] rounded-[2rem] shadow-2xl border border-[var(--border-color)] overflow-hidden text-left animation-scale-in backdrop-blur-md`}
        style={position ? { top: position.top, left: position.left } : {}}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
    >
        {isCreating ? (
            <div className="p-8 bg-[var(--bg-secondary)]">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-[10px] font-black text-[#3B7EF8] uppercase tracking-[0.4em] italic leading-none">Registro_Operario</h3>
                    <button onClick={() => setIsCreating(false)} className="p-1.5 hover:bg-slate-500/5 rounded-lg transition-all text-slate-600 hover:text-rose-500 border border-transparent hover:border-rose-500/20">
                        <X className="w-5 h-5"/>
                    </button>
                </div>
                
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[9px] uppercase font-black text-slate-600 tracking-[0.3em] ml-1">Nombre_Operativo</label>
                        <input 
                            autoFocus
                            className="w-full text-sm border-b border-[var(--border-color)] focus:border-[#3B7EF8] outline-none bg-transparent py-2 text-white font-mono font-bold transition-all placeholder:text-slate-800"
                            value={newName} 
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Ej. Juan Pérez"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[9px] uppercase font-black text-slate-600 tracking-[0.3em] ml-1">Cargo / Rol</label>
                        <input 
                            className="w-full text-sm border-b border-[var(--border-color)] focus:border-[#3B7EF8] outline-none bg-transparent py-2 text-white font-mono font-bold transition-all placeholder:text-slate-800"
                            value={newRole} 
                            onChange={e => setNewRole(e.target.value)}
                            placeholder="Ej. Oficial_Lider"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[9px] uppercase font-black text-slate-600 tracking-[0.3em] ml-1">Costo_Operativo ($)</label>
                        <input 
                            type="number"
                            className="w-full text-sm border-b border-[var(--border-color)] focus:border-[#3B7EF8] outline-none bg-transparent py-2 text-white font-mono font-bold transition-all"
                            value={newRate} 
                            onChange={e => setNewRate(parseFloat(e.target.value) || 0)}
                        />
                    </div>
                </div>

                <div className="mt-10">
                    <button 
                        onClick={handleCreate}
                        disabled={!newName}
                        className="w-full bg-[#3B7EF8] text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#2563EB] shadow-xl shadow-[#3B7EF8]/20 disabled:opacity-50 transition-all active:scale-95 border border-[var(--border-color)]"
                    >
                        COMMIT & ASSIGN_UNIT
                    </button>
                </div>
            </div>
        ) : (
            <>
                <div className="p-4 border-b border-[var(--border-color)] flex items-center bg-[var(--bg-primary)]/50 sticky top-0 backdrop-blur-md z-10">
                    <Search className="w-4 h-4 text-[#3B7EF8] mr-3 opacity-50" />
                    <input 
                        className="w-full text-[10px] font-black uppercase tracking-[0.2em] outline-none placeholder:text-slate-700 bg-transparent text-white"
                        placeholder="Search_Database..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                
                <div className="max-h-[320px] overflow-y-auto custom-scrollbar bg-[var(--bg-secondary)]/50 p-2">
                    {loading ? (
                        <div className="p-8 text-center text-[10px] text-slate-700 font-black uppercase tracking-widest italic animate-pulse">Accessing_Database...</div>
                    ) : filteredPersonnel.length === 0 ? (
                        <div className="p-8 text-center text-[10px] text-slate-700 font-black uppercase tracking-widest italic">
                            {searchQuery ? 'Zero_Results_Found.' : 'Empty_Database.'}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredPersonnel.map((person, idx) => (
                                <button
                                    key={`personnel-${person.id || `idx-${idx}`}`}
                                    onClick={() => onSelect(person.id, person.name)}
                                    className={`w-full text-left p-4 rounded-2xl flex items-center justify-between group transition-all border border-transparent hover:bg-white/[0.03] hover:border-[var(--border-color)] ${currentValue === person.id ? 'bg-[#3B7EF8]/10 border-[#3B7EF8]/20' : ''}`}
                                >
                                    <div className="flex items-center">
                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#3B7EF8] to-[#1E2442] text-white flex items-center justify-center text-[10px] font-black mr-4 shadow-lg border border-[var(--border-color)] group-hover:scale-110 transition-transform">
                                            {(person.name || '?').charAt(0)}
                                        </div>
                                        <div>
                                            <div className="text-[11px] text-white font-black uppercase tracking-tighter leading-none">{person.name}</div>
                                            <div className="text-[9px] text-slate-600 font-black italic mt-1.5 uppercase tracking-widest">{person.role || 'NO_AUTH_ROLE'}</div>
                                        </div>
                                    </div>
                                    {currentValue === person.id && (
                                        <div className="w-6 h-6 rounded-full bg-[#10B981] flex items-center justify-center shadow-lg shadow-[#10B981]/20">
                                            <Check className="w-3.5 h-3.5 text-white" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-primary)]/50">
                    <button 
                        onClick={() => setIsCreating(true)}
                        className="w-full flex items-center justify-center py-4 rounded-2xl border border-[var(--border-color)] bg-slate-500/5 hover:bg-[#10B981]/10 hover:border-[#10B981]/30 text-[#10B981] text-[10px] font-black uppercase tracking-[0.3em] transition-all shadow-xl hover:shadow-[#10B981]/10"
                    >
                        <UserPlus className="w-4 h-4 mr-3" />
                        CREATE_NEW_UNIT
                    </button>
                </div>
            </>
        )}

        <style jsx>{`
            .custom-scrollbar::-webkit-scrollbar {
                width: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 10px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
                background: transparent;
            }
        `}</style>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
