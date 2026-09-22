'use client';

import { useState } from 'react';
import { Personnel } from '@/types/monday';
import { 
    User, Search, Plus, Trash2, Edit2, 
    Save, X, DollarSign, Briefcase, Users, Layers, ShieldCheck, Truck, Wrench 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { usePersonnel, usePersonnelMutations } from '@/hooks/usePersonnel';
import { useCrews, usePersonnelAssignments, useCrewMutations } from '@/hooks/useCrews';
import { useMachinery, useMachineryMutations, useMachineryAvailability } from '@/hooks/useMachinery';

interface Props {
  boardId?: string;
}

export default function PersonnelManagement({ boardId }: Props) {
    const [activeTab, setActiveTab] = useState<'personnel' | 'assignments' | 'crews' | 'machinery'>('personnel');

    // Personnel query & mutations
    const { data: personnel = [], isLoading: loadingPersonnel } = usePersonnel();
    const { createPersonnel, updatePersonnel, deletePersonnel } = usePersonnelMutations();

    // Crews & Assignments query & mutations (requires boardId)
    const { data: crews = [], isLoading: loadingCrews } = useCrews(boardId);
    const { data: assignments = [], isLoading: loadingAssignments } = usePersonnelAssignments(boardId);
    const crewMutations = useCrewMutations(boardId);

    // Machinery & Qualifications (requires boardId)
    const { data: machineryList = [], isLoading: loadingMachinery } = useMachinery(boardId);
    const { data: availabilityList = [] } = useMachineryAvailability(boardId);
    const machineryMutations = useMachineryMutations(boardId);

    const [searchQuery, setSearchQuery] = useState('');
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Personnel>>({});
    
    // New Person State
    const [isCreating, setIsCreating] = useState(false);
    const [newPerson, setNewPerson] = useState({ document_id: '', name: '', role: '', default_rate: 0 });

    // New Crew State
    const [isCreatingCrew, setIsCreatingCrew] = useState(false);
    const [newCrew, setNewCrew] = useState({ name: '', code: '', leader_id: '' });

    // New Assignment State
    const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
    const [newAssignment, setNewAssignment] = useState({
      personnel_id: '',
      role_in_site: '',
      zone: 'ZV',
      dedication_percentage: 100,
    });

    // New Machinery State
    const [isCreatingMachinery, setIsCreatingMachinery] = useState(false);
    const [newMachinery, setNewMachinery] = useState({
      code: '',
      name: '',
      category: 'EQUIPO_MENOR' as 'TRACTOR' | 'VOLQUETA' | 'MINICARGADOR' | 'GUADAÑA' | 'EQUIPO_MENOR',
      operator_required_role: 'TRACTORISTA',
      simultaneous_limit: 1,
    });

    const handleCreateMachinery = async () => {
      if (!newMachinery.code || !newMachinery.name || !boardId) return;
      machineryMutations.createMachinery.mutate({
        board_id: boardId,
        code: newMachinery.code,
        name: newMachinery.name,
        category: newMachinery.category,
        operator_required_role: newMachinery.operator_required_role || null,
        simultaneous_limit: newMachinery.simultaneous_limit || 1,
      }, {
        onSuccess: () => {
          setIsCreatingMachinery(false);
          setNewMachinery({ code: '', name: '', category: 'EQUIPO_MENOR', operator_required_role: 'TRACTORISTA', simultaneous_limit: 1 });
        }
      });
    };

    const handleCreatePersonnel = async () => {
        if (!newPerson.name) return;
        createPersonnel.mutate(newPerson, {
            onSuccess: () => {
                setIsCreating(false);
                setNewPerson({ document_id: '', name: '', role: '', default_rate: 0 });
            }
        });
    };

    const handleCreateCrew = async () => {
      if (!newCrew.name || !boardId) return;
      crewMutations.createCrew.mutate({
        name: newCrew.name,
        code: newCrew.code || null,
        leader_id: newCrew.leader_id || null,
      }, {
        onSuccess: () => {
          setIsCreatingCrew(false);
          setNewCrew({ name: '', code: '', leader_id: '' });
        }
      });
    };

    const handleCreateAssignment = async () => {
      if (!newAssignment.personnel_id || !boardId) return;
      crewMutations.createAssignment.mutate(newAssignment, {
        onSuccess: () => {
          setIsCreatingAssignment(false);
          setNewAssignment({ personnel_id: '', role_in_site: '', zone: 'ZV', dedication_percentage: 100 });
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
            {/* Header & Tabs */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <User className="text-primary" />
                            Gestión de Personal y Cuadrillas Operativas
                        </h2>
                        <p className="text-slate-500 text-sm">Administra el catálogo de personas, adscripciones por sitio y cuadrillas de trabajo.</p>
                    </div>
                    {activeTab === 'personnel' && (
                        <Button onClick={() => setIsCreating(true)} className="font-bold gap-2">
                            <Plus size={16} /> Nuevo Personal
                        </Button>
                    )}
                    {activeTab === 'assignments' && boardId && (
                        <Button onClick={() => setIsCreatingAssignment(true)} className="font-bold gap-2">
                            <Plus size={16} /> Adscribir Personal a Sitio
                        </Button>
                    )}
                    {activeTab === 'crews' && boardId && (
                        <Button onClick={() => setIsCreatingCrew(true)} className="font-bold gap-2">
                            <Plus size={16} /> Nueva Cuadrilla
                        </Button>
                    )}
                    {activeTab === 'machinery' && boardId && (
                        <Button onClick={() => setIsCreatingMachinery(true)} className="font-bold gap-2">
                            <Plus size={16} /> Nueva Maquinaria
                        </Button>
                    )}
                </div>

                {/* Sub-navigation Tabs */}
                <div className="flex gap-2 border-b border-slate-200 -mb-6 pb-2">
                    <button
                        onClick={() => setActiveTab('personnel')}
                        className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'personnel'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <User size={16} /> Personas (Identidad)
                    </button>
                    <button
                        onClick={() => setActiveTab('assignments')}
                        className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'assignments'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Layers size={16} /> Adscripción por Sitio
                    </button>
                    <button
                        onClick={() => setActiveTab('crews')}
                        className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'crews'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Users size={16} /> Cuadrillas Operativas
                    </button>
                    <button
                        onClick={() => setActiveTab('machinery')}
                        className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'machinery'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Truck size={16} /> Maquinaria y Operadores
                    </button>
                </div>
            </div>

            {/* Tab 1: Directorio de Personas */}
            {activeTab === 'personnel' && (
                <>
                    {/* Creation Form */}
                    {isCreating && (
                        <div className="p-4 bg-emerald-50/50 border-b border-emerald-100 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Cédula / Doc ID</label>
                                <input 
                                    value={newPerson.document_id}
                                    onChange={e => setNewPerson({...newPerson, document_id: e.target.value})}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                    placeholder="Ej. 1044602966"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Nombre Completo</label>
                                <input 
                                    value={newPerson.name}
                                    onChange={e => setNewPerson({...newPerson, name: e.target.value})}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                    placeholder="Ej. Juan Pérez"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Cargo / Rol Base</label>
                                <input 
                                    value={newPerson.role}
                                    onChange={e => setNewPerson({...newPerson, role: e.target.value})}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                    placeholder="Ej. Operador ZV"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Tarifa Diario ($)</label>
                                <input 
                                    type="number"
                                    value={newPerson.default_rate}
                                    onChange={e => setNewPerson({...newPerson, default_rate: Number(e.target.value)})}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleCreatePersonnel} disabled={!newPerson.name || createPersonnel.isPending} className="flex-1 font-bold">
                                    {createPersonnel.isPending ? 'Guardando...' : 'Guardar'}
                                </Button>
                                <Button onClick={() => setIsCreating(false)} variant="outline" className="px-3 text-slate-600">
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
                                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                    <th className="px-6 py-3 font-bold border-b border-slate-200">Nombre</th>
                                    <th className="px-6 py-3 font-bold border-b border-slate-200">Rol Nominal</th>
                                    <th className="px-6 py-3 font-bold border-b border-slate-200">Costo Base / Día</th>
                                    <th className="px-6 py-3 font-bold border-b border-slate-200 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loadingPersonnel ? (
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
                                                    className="w-full border-b border-blue-500 outline-none bg-transparent"
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
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                                <Briefcase className="w-3 h-3 mr-1" />
                                                {person.role || 'Sin Rol'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm">
                                            <DollarSign className="w-3 h-3 inline text-emerald-600 mr-1" />
                                            {person.default_rate?.toLocaleString() || 0}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {isEditing === person.id ? (
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="sm" onClick={saveEdit} className="text-emerald-600">
                                                        <Save size={16} />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(null)} className="text-slate-400">
                                                        <X size={16} />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="sm" onClick={() => startEdit(person)} className="text-slate-400 hover:text-indigo-600">
                                                        <Edit2 size={16} />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(person.id)} className="text-slate-400 hover:text-destructive">
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
                </>
            )}

            {/* Tab 2: Adscripción por Sitio */}
            {activeTab === 'assignments' && (
                <div className="p-6">
                    {!boardId ? (
                        <div className="text-center py-8 text-slate-500">Selecciona un sitio para gestionar sus adscripciones.</div>
                    ) : (
                        <>
                            {isCreatingAssignment && (
                                <div className="p-4 mb-4 bg-blue-50 border border-blue-100 rounded-xl grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Persona</label>
                                        <select
                                            value={newAssignment.personnel_id}
                                            onChange={e => setNewAssignment({...newAssignment, personnel_id: e.target.value})}
                                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                        >
                                            <option value="">-- Seleccionar --</option>
                                            {personnel.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Cargo en Sitio</label>
                                        <input
                                            value={newAssignment.role_in_site}
                                            onChange={e => setNewAssignment({...newAssignment, role_in_site: e.target.value})}
                                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                            placeholder="Ej. Operador ZV"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Zona</label>
                                        <select
                                            value={newAssignment.zone}
                                            onChange={e => setNewAssignment({...newAssignment, zone: e.target.value})}
                                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                        >
                                            <option value="ZV">ZV - Zonas Verdes</option>
                                            <option value="ZD">ZD - Zonas Duras</option>
                                            <option value="ZP">ZP - Zona Playa</option>
                                            <option value="GENERAL">GENERAL</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">% Dedicación</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={100}
                                            value={newAssignment.dedication_percentage}
                                            onChange={e => setNewAssignment({...newAssignment, dedication_percentage: Number(e.target.value)})}
                                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleCreateAssignment} disabled={!newAssignment.personnel_id} className="flex-1 font-bold">
                                            Guardar
                                        </Button>
                                        <Button onClick={() => setIsCreatingAssignment(false)} variant="outline" className="px-3">
                                            <X size={18} />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="px-6 py-3 font-bold border-b">Persona</th>
                                        <th className="px-6 py-3 font-bold border-b">Cargo en Sitio</th>
                                        <th className="px-6 py-3 font-bold border-b">Zona</th>
                                        <th className="px-6 py-3 font-bold border-b">% Dedicación</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loadingAssignments ? (
                                        <tr><td colSpan={4} className="p-6 text-center text-slate-400">Cargando adscripciones...</td></tr>
                                    ) : assignments.length === 0 ? (
                                        <tr><td colSpan={4} className="p-6 text-center text-slate-400">No hay personas adscritas a este sitio aún.</td></tr>
                                    ) : assignments.map(a => (
                                        <tr key={a.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-medium text-slate-800">{a.personnel_name}</td>
                                            <td className="px-6 py-3 text-slate-600">{a.role_in_site || 'General'}</td>
                                            <td className="px-6 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded font-bold">{a.zone}</span></td>
                                            <td className="px-6 py-3 font-mono">{a.dedication_percentage}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            )}

            {/* Tab 3: Cuadrillas Operativas */}
            {activeTab === 'crews' && (
                <div className="p-6">
                    {!boardId ? (
                        <div className="text-center py-8 text-slate-500">Selecciona un sitio para gestionar sus cuadrillas.</div>
                    ) : (
                        <>
                            {isCreatingCrew && (
                                <div className="p-4 mb-4 bg-emerald-50 border border-emerald-100 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Nombre Cuadrilla</label>
                                        <input
                                            value={newCrew.name}
                                            onChange={e => setNewCrew({...newCrew, name: e.target.value})}
                                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                            placeholder="Ej. Cuadrilla Norte"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Código (Opcional)</label>
                                        <input
                                            value={newCrew.code}
                                            onChange={e => setNewCrew({...newCrew, code: e.target.value})}
                                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                            placeholder="Ej. CUAD-01"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">Líder Configurado</label>
                                        <select
                                            value={newCrew.leader_id}
                                            onChange={e => setNewCrew({...newCrew, leader_id: e.target.value})}
                                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none"
                                        >
                                            <option value="">-- Sin Líder --</option>
                                            {personnel.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleCreateCrew} disabled={!newCrew.name} className="flex-1 font-bold">
                                            Guardar
                                        </Button>
                                        <Button onClick={() => setIsCreatingCrew(false)} variant="outline" className="px-3">
                                            <X size={18} />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {loadingCrews ? (
                                    <div className="col-span-2 text-center py-8 text-slate-400">Cargando cuadrillas...</div>
                                ) : crews.length === 0 ? (
                                    <div className="col-span-2 text-center py-8 text-slate-400">No hay cuadrillas configuradas para este sitio.</div>
                                ) : crews.map(crew => (
                                    <div key={crew.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:shadow-xs transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="font-bold text-slate-800 text-base">{crew.name}</h3>
                                                {crew.code && <span className="text-xs text-slate-400 font-mono">[{crew.code}]</span>}
                                            </div>
                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center gap-1">
                                                <ShieldCheck size={12} /> Activa
                                            </span>
                                        </div>

                                        <div className="text-xs text-slate-600 space-y-1 mb-3">
                                            <div><strong>Líder Configurado:</strong> {crew.leader_name || 'Sin asignar'}</div>
                                            <div><strong>Integrantes Activos:</strong> {crew.members_count || 0} personas</div>
                                        </div>

                                        {crew.members && crew.members.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-slate-200">
                                                <span className="text-[11px] font-bold uppercase text-slate-400">Miembros:</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {crew.members.map(m => (
                                                        <span key={m.id} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 text-xs rounded">
                                                            {m.full_name} ({m.zone})
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                     </div>
                                 ))}
                             </div>
                         </>
                     )}
                 </div>
             )}

            {/* Active Tab: Machinery */}
            {activeTab === 'machinery' && (
                <div className="p-6">
                    {!boardId ? (
                        <div className="text-center py-8 text-slate-500">Selecciona un sitio para gestionar su maquinaria.</div>
                    ) : (
                        <>
                            {isCreatingMachinery && (
                                <div className="mb-6 p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-3">
                                    <h4 className="font-bold text-sm text-blue-900">Registrar Nueva Maquinaria</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <input
                                            type="text"
                                            placeholder="Código (ej. TR-001)"
                                            value={newMachinery.code}
                                            onChange={e => setNewMachinery({ ...newMachinery, code: e.target.value })}
                                            className="px-3 py-1.5 text-sm border border-slate-300 rounded bg-white"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Nombre (ej. Tractor Agrícola 1)"
                                            value={newMachinery.name}
                                            onChange={e => setNewMachinery({ ...newMachinery, name: e.target.value })}
                                            className="px-3 py-1.5 text-sm border border-slate-300 rounded bg-white"
                                        />
                                        <select
                                            value={newMachinery.category}
                                            onChange={e => setNewMachinery({ ...newMachinery, category: e.target.value as any })}
                                            className="px-3 py-1.5 text-sm border border-slate-300 rounded bg-white"
                                        >
                                            <option value="TRACTOR">Tractor</option>
                                            <option value="VOLQUETA">Volqueta</option>
                                            <option value="MINICARGADOR">Minicargador</option>
                                            <option value="GUADAÑA">Guadaña</option>
                                            <option value="EQUIPO_MENOR">Equipo Menor</option>
                                        </select>
                                        <select
                                            value={newMachinery.operator_required_role}
                                            onChange={e => setNewMachinery({ ...newMachinery, operator_required_role: e.target.value })}
                                            className="px-3 py-1.5 text-sm border border-slate-300 rounded bg-white"
                                        >
                                            <option value="TRACTORISTA">Rol Operador: Tractorista</option>
                                            <option value="CONDUCTOR_VOLQUETA">Rol Operador: Conductor Volqueta</option>
                                            <option value="GUADAÑADOR">Rol Operador: Guadañador</option>
                                            <option value="">Sin requerimiento especializado</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleCreateMachinery} className="px-4 text-xs font-bold">
                                            Guardar Maquinaria
                                        </Button>
                                        <Button onClick={() => setIsCreatingMachinery(false)} variant="outline" className="px-3">
                                            <X size={18} />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {loadingMachinery ? (
                                    <div className="col-span-2 text-center py-8 text-slate-400">Cargando maquinaria...</div>
                                ) : machineryList.length === 0 ? (
                                    <div className="col-span-2 text-center py-8 text-slate-400">No hay maquinaria registrada para este sitio.</div>
                                ) : machineryList.map(m => {
                                    const avail = availabilityList.find(a => a.machineryId === m.id);
                                    const isAvailable = m.isAvailable;
                                    const statusText = !isAvailable
                                        ? 'FUERA DE SERVICIO'
                                        : avail?.effectiveStatus === 'FULLY_AVAILABLE'
                                        ? 'PLENAMENTE DISPONIBLE'
                                        : avail?.effectiveStatus === 'UNAVAILABLE_OPERATOR'
                                        ? 'FALTA OPERADOR HABILITADO'
                                        : 'DISPONIBLE';

                                    return (
                                        <div key={m.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:shadow-xs transition-all">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                                                        <Truck size={16} className="text-blue-600" /> {m.name}
                                                    </h3>
                                                    <span className="text-xs text-slate-400 font-mono">[{m.code}]</span>
                                                </div>
                                                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                                                    !isAvailable 
                                                        ? 'bg-red-100 text-red-800' 
                                                        : avail?.effectiveStatus === 'FULLY_AVAILABLE' 
                                                        ? 'bg-emerald-100 text-emerald-800' 
                                                        : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                    {statusText}
                                                </span>
                                            </div>

                                            <div className="text-xs text-slate-600 space-y-1 mb-3">
                                                <div><strong>Categoría:</strong> {m.category}</div>
                                                <div><strong>Rol Operador Requerido:</strong> {m.operatorRequirement?.requiredRole || 'Ninguno (Libre)'}</div>
                                                {avail?.reason && <div className="text-[11px] text-slate-500 italic mt-1">{avail.reason}</div>}
                                            </div>

                                            <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between items-center">
                                                <span className="text-xs text-slate-500">Retiro Operacional (Soft-Retirement):</span>
                                                <Button
                                                    size="sm"
                                                    variant={isAvailable ? "outline" : "default"}
                                                    className="text-xs"
                                                    onClick={() => machineryMutations.setAvailability.mutate({ machineryId: m.id, isAvailable: !isAvailable })}
                                                >
                                                    {isAvailable ? 'Retirar de Operación' : 'Reactivar'}
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
