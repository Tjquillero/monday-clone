'use client';

import { useState } from 'react';
import { Personnel } from '@/types/monday';
import { 
    User, Search, Plus, Trash2, Edit2, 
    Save, X, CheckCircle2, DollarSign, Briefcase 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { usePersonnel, usePersonnelMutations } from '@/hooks/usePersonnel';

export default function PersonnelManagement() {
    const { data: personnel = [], isLoading: loading } = usePersonnel();
    const { createPersonnel, updatePersonnel, deletePersonnel } = usePersonnelMutations();

    const [searchQuery, setSearchQuery] = useState('');
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Personnel>>({});
    
    // New Person State
    const [isCreating, setIsCreating] = useState(false);
    const [newPerson, setNewPerson] = useState({ name: '', role: '', default_rate: 0 });

    const handleCreate = async () => {
        if (!newPerson.name) return;
        createPersonnel.mutate(newPerson, {
            onSuccess: () => {
                setIsCreating(false);
                setNewPerson({ name: '', role: '', default_rate: 0 });
            }
        });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar a este personal?')) return;
        deletePersonnel.mutate(id);
    };

    const startEdit = (person: Personnel) => {
        setIsEditing(person.id);
        setEditForm(person);
    };

    const saveEdit = async () => {
        if (!isEditing || !editForm) return;
        updatePersonnel.mutate({ id: isEditing, updates: editForm }, {
            onSuccess: () => {
                setIsEditing(null);
            }
        });
    };

    const filteredPersonnel = personnel.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.role?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <User className="text-primary" />
                        Directorio de Personal
                    </h2>
                    <p className="text-slate-500 text-sm">Gestiona tu equipo de trabajo y sus costos.</p>
                </div>
                <Button 
                    onClick={() => setIsCreating(true)}
                    className="font-bold gap-2"
                >
                    <Plus size={16} /> Nuevo Personal
                </Button>
            </div>

            {/* Creation Form */}
            {isCreating && (
                <div className="p-4 bg-emerald-50/50 border-b border-emerald-100 grid grid-cols-1 md:grid-cols-4 gap-4 items-end animate-in fade-in slide-in-from-top-2">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Nombre Completo</label>
                        <input 
                            value={newPerson.name}
                            onChange={e => setNewPerson({...newPerson, name: e.target.value})}
                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="Ej. Juan Pérez"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Cargo / Rol</label>
                        <input 
                            value={newPerson.role}
                            onChange={e => setNewPerson({...newPerson, role: e.target.value})}
                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="Ej. Oficial"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Costo Día ($)</label>
                        <input 
                            type="number"
                            value={newPerson.default_rate}
                            onChange={e => setNewPerson({...newPerson, default_rate: Number(e.target.value)})}
                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button 
                            onClick={handleCreate}
                            disabled={!newPerson.name || createPersonnel.isPending}
                            className="flex-1 font-bold"
                        >
                            {createPersonnel.isPending ? 'Guardando...' : 'Guardar'}
                        </Button>
                        <Button 
                            onClick={() => setIsCreating(false)}
                            variant="outline"
                            className="px-3 text-slate-600"
                        >
                            <X size={18} />
                        </Button>
                    </div>
                </div>
            )}

            {/* Search Bar */}
            <div className="p-4 border-b border-slate-100">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                        type="text"
                        placeholder="Buscar por nombre o cargo..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                            <th className="px-6 py-3 font-bold border-b border-slate-200">Nombre</th>
                            <th className="px-6 py-3 font-bold border-b border-slate-200">Rol</th>
                            <th className="px-6 py-3 font-bold border-b border-slate-200">Costo / Día</th>
                            <th className="px-6 py-3 font-bold border-b border-slate-200 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && personnel.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-slate-400">Cargando personal...</td></tr>
                        ) : filteredPersonnel.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-slate-400">No se encontraron registros.</td></tr>
                        ) : filteredPersonnel.map(person => (
                            <tr key={person.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-6 py-4">
                                    {isEditing === person.id ? (
                                        <input 
                                            value={editForm.name} 
                                            onChange={e => setEditForm({...editForm, name: e.target.value})}
                                            className="w-full border-b border-emerald-500 outline-none bg-transparent"
                                        />
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                                {person.name.charAt(0)}
                                            </div>
                                            <span className="font-medium text-slate-700">{person.name}</span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {isEditing === person.id ? (
                                        <input 
                                            value={editForm.role} 
                                            onChange={e => setEditForm({...editForm, role: e.target.value})}
                                            className="w-full border-b border-emerald-500 outline-none bg-transparent"
                                        />
                                    ) : (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                            <Briefcase className="w-3 h-3 mr-1" />
                                            {person.role || 'Sin Rol'}
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {isEditing === person.id ? (
                                        <input 
                                            type="number"
                                            value={editForm.default_rate} 
                                            onChange={e => setEditForm({...editForm, default_rate: Number(e.target.value)})}
                                            className="w-24 border-b border-emerald-500 outline-none bg-transparent"
                                        />
                                    ) : (
                                        <div className="flex items-center text-slate-600 font-mono text-sm">
                                            <DollarSign className="w-3 h-3 text-emerald-600 mr-1" />
                                            {person.default_rate?.toLocaleString()}
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {isEditing === person.id ? (
                                        <div className="flex justify-end gap-2">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={saveEdit} 
                                                disabled={updatePersonnel.isPending}
                                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                            >
                                                {updatePersonnel.isPending ? <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => setIsEditing(null)} className="text-slate-400"><X size={16} /></Button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="sm" onClick={() => startEdit(person)} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Edit2 size={16} /></Button>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={() => handleDelete(person.id)} 
                                                className="text-slate-400 hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
