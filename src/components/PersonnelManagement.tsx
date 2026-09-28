'use client';

import { useState } from 'react';
import { Personnel } from '@/types/monday';
import { 
    User, Search, Plus, Trash2, Edit2, 
    Save, X, DollarSign, Briefcase, Users, Layers, ShieldCheck, Truck,
    ArrowRightLeft, AlertCircle, Info, UserPlus, ShieldAlert
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { usePersonnel, usePersonnelMutations } from '@/hooks/usePersonnel';
import { useCrews, usePersonnelAssignments, useCrewMutations, usePersonnelVersionForDate } from '@/hooks/useCrews';
import { useMachinery, useMachineryMutations, useMachineryAvailability } from '@/hooks/useMachinery';
import GovernedPersonnelReassignmentModal from '@/components/personnel/GovernedPersonnelReassignmentModal';

interface Props {
  boardId?: string;
}

export default function PersonnelManagement({ boardId }: Props) {
    const [activeTab, setActiveTab] = useState<'personnel' | 'assignments' | 'crews' | 'machinery'>('personnel');

    // Personnel query & mutations (Catálogo Global)
    const { data: personnel = [], isLoading: loadingPersonnel } = usePersonnel();
    const { createPersonnel, updatePersonnel, deletePersonnel } = usePersonnelMutations();

    // Crews & Assignments query & mutations (Scoped por boardId)
    const { data: crews = [], isLoading: loadingCrews } = useCrews(boardId);
    const { data: assignments = [], isLoading: loadingAssignments } = usePersonnelAssignments(boardId);
    const { data: activeVersion } = usePersonnelVersionForDate(boardId);
    const crewMutations = useCrewMutations(boardId);

    // Machinery & Qualifications (Scoped por boardId)
    const { data: machineryList = [], isLoading: loadingMachinery } = useMachinery(boardId);
    const { data: availabilityList = [] } = useMachineryAvailability(boardId);
    const machineryMutations = useMachineryMutations(boardId);

    const [searchQuery, setSearchQuery] = useState('');
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Personnel>>({});
    
    // New Person State
    const [isCreating, setIsCreating] = useState(false);
    const [isReassigningGoverned, setIsReassigningGoverned] = useState(false);
    const [newPerson, setNewPerson] = useState({ document_id: '', name: '', role: '', default_rate: 0 });

    // New Crew State
    const [isCreatingCrew, setIsCreatingCrew] = useState(false);
    const [newCrew, setNewCrew] = useState({ name: '', code: '', leader_id: '' });

    // Crew Edit State
    const [editingCrewId, setEditingCrewId] = useState<string | null>(null);
    const [editCrewForm, setEditCrewForm] = useState<{ name: string; code: string; leader_id: string }>({ name: '', code: '', leader_id: '' });

    // Crew Membership State
    const [addingMemberCrewId, setAddingMemberCrewId] = useState<string | null>(null);
    const [selectedAssignmentIdToAdd, setSelectedAssignmentIdToAdd] = useState<string>('');
    const [memberActionError, setMemberActionError] = useState<{ crewId: string; message: string } | null>(null);

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
      if (!newCrew.name.trim() || !boardId) return;
      crewMutations.createCrew.mutate({
        name: newCrew.name.trim(),
        code: newCrew.code.trim() || null,
        leader_id: newCrew.leader_id || null,
      }, {
        onSuccess: () => {
          setIsCreatingCrew(false);
          setNewCrew({ name: '', code: '', leader_id: '' });
        }
      });
    };

    const handleStartEditCrew = (crew: any) => {
      setEditingCrewId(crew.id);
      setEditCrewForm({
        name: crew.name,
        code: crew.code || '',
        leader_id: crew.leader_id || '',
      });
    };

    const handleSaveEditCrew = (crewId: string) => {
      if (!editCrewForm.name.trim()) return;
      crewMutations.updateCrew.mutate({
        crewId,
        updates: {
          name: editCrewForm.name.trim(),
          code: editCrewForm.code.trim() || null,
          leader_id: editCrewForm.leader_id || null,
        }
      }, {
        onSuccess: () => {
          setEditingCrewId(null);
        }
      });
    };

    const handleDeleteCrew = (crewId: string, crewName: string) => {
      if (!confirm(`¿Estás seguro de desactivar la cuadrilla "${crewName}"?`)) return;
      crewMutations.deleteCrew.mutate(crewId);
    };

    const handleAddMember = (crewId: string) => {
      setMemberActionError(null);
      if (!selectedAssignmentIdToAdd) return;
      crewMutations.addMember.mutate({
        crewId,
        personnelAssignmentId: selectedAssignmentIdToAdd,
      }, {
        onSuccess: () => {
          setAddingMemberCrewId(null);
          setSelectedAssignmentIdToAdd('');
        },
        onError: (err: any) => {
          setMemberActionError({
            crewId,
            message: err?.message || 'Error al agregar integrante a la cuadrilla',
          });
        }
      });
    };

    const handleRemoveMember = (crewId: string, memberId: string, memberName: string) => {
      setMemberActionError(null);
      if (!confirm(`¿Deseas retirar a "${memberName}" de esta cuadrilla?`)) return;
      crewMutations.removeMember.mutate(memberId, {
        onError: (err: any) => {
          setMemberActionError({
            crewId,
            message: err?.message || 'Error al retirar integrante',
          });
        }
      });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar a este personal del catálogo global?')) return;
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

    const renderLeaderOptions = () => {
      const assignedIds = new Set(assignments.map(a => a.personnel_id));
      const otherPersonnel = personnel.filter(p => !assignedIds.has(p.id));

      return (
        <>
          <option value="">-- Sin Líder --</option>
          {assignments.length > 0 && (
            <optgroup label="Personal Adscrito al Tablero (Dotación Activa)">
              {assignments.map(a => (
                <option key={a.personnel_id} value={a.personnel_id}>
                  {a.personnel_name} (Adscrito - {a.zone})
                </option>
              ))}
            </optgroup>
          )}
          {otherPersonnel.length > 0 && (
            <optgroup label="Otros en Catálogo General">
              {otherPersonnel.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role || 'Catálogo General'})
                </option>
              ))}
            </optgroup>
          )}
        </>
      );
    };

    return (
        <div className="bg-[var(--card-bg)] rounded-[var(--radius-surface)] shadow-xs border border-[var(--border-color)] overflow-hidden">
            {/* Header & Tabs */}
            <div className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/50">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div>
                        <h2 className="brand-title text-lg text-[var(--text-primary)] flex items-center gap-2">
                            <User className="text-[var(--color-primary)] dark:text-[var(--color-accent)]" />
                            Gestión de Personal y Cuadrillas Operativas
                        </h2>
                        <p className="text-[var(--text-secondary)] text-xs md:text-sm mt-0.5">Administra el catálogo de personas, adscripciones por sitio y cuadrillas de trabajo.</p>
                    </div>
                    {activeTab === 'personnel' && (
                        <Button onClick={() => setIsCreating(true)} className="font-bold gap-2">
                            <Plus size={16} /> Nuevo Personal
                        </Button>
                    )}
                    {activeTab === 'assignments' && boardId && activeVersion && (
                        <Button onClick={() => setIsReassigningGoverned(true)} className="font-bold gap-2">
                            <ArrowRightLeft size={16} /> Reasignar Personal (Gobernado)
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
                <div className="flex gap-2 border-b border-[var(--border-color)] -mb-6 pb-2">
                    <button
                        onClick={() => setActiveTab('personnel')}
                        className={`px-4 py-2 text-xs md:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'personnel'
                                ? 'border-[var(--color-primary)] text-[var(--color-primary)] dark:text-[var(--text-primary)] font-bold'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        <User size={16} /> Personas (Directorio)
                    </button>
                    <button
                        onClick={() => setActiveTab('assignments')}
                        className={`px-4 py-2 text-xs md:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'assignments'
                                ? 'border-[var(--color-primary)] text-[var(--color-primary)] dark:text-[var(--text-primary)] font-bold'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        <Layers size={16} /> Adscripción por Sitio
                    </button>
                    <button
                        onClick={() => setActiveTab('crews')}
                        className={`px-4 py-2 text-xs md:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'crews'
                                ? 'border-[var(--color-primary)] text-[var(--color-primary)] dark:text-[var(--text-primary)] font-bold'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        <Users size={16} /> Cuadrillas Operativas
                    </button>
                    <button
                        onClick={() => setActiveTab('machinery')}
                        className={`px-4 py-2 text-xs md:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'machinery'
                                ? 'border-[var(--color-primary)] text-[var(--color-primary)] dark:text-[var(--text-primary)] font-bold'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        <Truck size={16} /> Maquinaria y Operadores
                    </button>
                </div>
            </div>

            {/* Tab 1: Directorio de Personas (Catálogo Global) */}
            {activeTab === 'personnel' && (
                <>
                    {/* Creation Form */}
                    {isCreating && (
                        <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] uppercase">Cédula / Doc ID</label>
                                <input 
                                    value={newPerson.document_id}
                                    onChange={e => setNewPerson({...newPerson, document_id: e.target.value})}
                                    className="w-full mt-1 px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--card-bg)] text-[var(--text-primary)] outline-none"
                                    placeholder="Ej. 1044602966"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] uppercase">Nombre Completo</label>
                                <input 
                                    value={newPerson.name}
                                    onChange={e => setNewPerson({...newPerson, name: e.target.value})}
                                    className="w-full mt-1 px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--card-bg)] text-[var(--text-primary)] outline-none"
                                    placeholder="Ej. Juan Pérez"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] uppercase">Cargo / Rol Base</label>
                                <input 
                                    value={newPerson.role}
                                    onChange={e => setNewPerson({...newPerson, role: e.target.value})}
                                    className="w-full mt-1 px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--card-bg)] text-[var(--text-primary)] outline-none"
                                    placeholder="Ej. Operador ZV"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] uppercase">Tarifa Diario ($)</label>
                                <input 
                                    type="number"
                                    value={newPerson.default_rate}
                                    onChange={e => setNewPerson({...newPerson, default_rate: Number(e.target.value)})}
                                    className="w-full mt-1 px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--card-bg)] text-[var(--text-primary)] outline-none"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={handleCreatePersonnel} disabled={!newPerson.name || createPersonnel.isPending} className="flex-1 font-bold">
                                    {createPersonnel.isPending ? 'Guardando...' : 'Guardar'}
                                </Button>
                                <Button onClick={() => setIsCreating(false)} variant="outline" className="px-3">
                                    <X size={18} />
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Search Bar */}
                    <div className="p-4 border-b border-[var(--border-color)]">
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] w-4 h-4" />
                            <input 
                                type="text"
                                placeholder="Buscar por nombre o cargo..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--card-bg)] text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[var(--bg-secondary)]/50 text-[var(--text-muted)] text-xs uppercase tracking-wider">
                                    <th className="px-6 py-3 font-bold border-b border-[var(--border-color)]">Nombre</th>
                                    <th className="px-6 py-3 font-bold border-b border-[var(--border-color)]">Rol Nominal</th>
                                    <th className="px-6 py-3 font-bold border-b border-[var(--border-color)]">Costo Base / Día</th>
                                    <th className="px-6 py-3 font-bold border-b border-[var(--border-color)] text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)]">
                                {loadingPersonnel ? (
                                    <tr><td colSpan={4} className="p-8 text-center text-[var(--text-muted)]">Cargando personal...</td></tr>
                                ) : filteredPersonnel.length === 0 ? (
                                    <tr><td colSpan={4} className="p-8 text-center text-[var(--text-muted)]">No se encontraron registros.</td></tr>
                                ) : filteredPersonnel.map(person => (
                                    <tr key={person.id} className="hover:bg-[var(--color-surface-subtle)] transition-colors group">
                                        <td className="px-6 py-4">
                                            {isEditing === person.id ? (
                                                <input 
                                                    value={editForm.name} 
                                                    onChange={e => setEditForm({...editForm, name: e.target.value})}
                                                    className="w-full border-b border-[var(--color-primary)] outline-none bg-transparent"
                                                />
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center font-bold text-xs">
                                                        {person.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-[var(--text-primary)] block">{person.name}</span>
                                                        {person.document_id && <span className="text-[11px] text-[var(--text-muted)] font-mono">Doc: {person.document_id}</span>}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                                                <Briefcase className="w-3 h-3 mr-1" />
                                                {person.role || 'Sin Rol'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm text-[var(--text-primary)]">
                                            <DollarSign className="w-3 h-3 inline text-emerald-600 mr-1" />
                                            {person.default_rate?.toLocaleString() || 0}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {isEditing === person.id ? (
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="sm" onClick={saveEdit} className="text-emerald-600">
                                                        <Save size={16} />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(null)} className="text-[var(--text-muted)]">
                                                        <X size={16} />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="sm" onClick={() => startEdit(person)} className="text-[var(--text-muted)] hover:text-[var(--color-primary)]">
                                                        <Edit2 size={16} />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(person.id)} className="text-[var(--text-muted)] hover:text-red-500">
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
                        <div className="text-center py-8 text-[var(--text-muted)]">Selecciona un tablero para gestionar sus adscripciones.</div>
                    ) : loadingAssignments ? (
                        <div className="text-center py-8 text-[var(--text-muted)]">Cargando adscripciones...</div>
                    ) : !activeVersion ? (
                        /* Estado Explícito: Sin Versión de Dotación Publicada */
                        <div className="text-center py-12 px-4 bg-amber-500/10 border border-amber-500/20 rounded-[var(--radius-control)] my-2">
                            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                            <h4 className="font-bold text-base text-[var(--text-primary)]">Sin Versión de Dotación Publicada</h4>
                            <p className="text-xs text-[var(--text-secondary)] mt-1.5 max-w-lg mx-auto">
                                Este tablero no cuenta actualmente con una versión de dotación publicada en la fecha efectiva actual. Las adscripciones de personal y cuadrillas operativas requieren una versión base de dotación para operar.
                            </p>
                        </div>
                    ) : assignments.length === 0 ? (
                        /* Estado Explícito: Versión Publicada sin personal adscrito */
                        <div className="text-center py-12 px-4 bg-blue-500/10 border border-blue-500/20 rounded-[var(--radius-control)] my-2">
                            <Info className="w-10 h-10 text-blue-500 mx-auto mb-3" />
                            <h4 className="font-bold text-base text-[var(--text-primary)]">Versión Publicada Activa ({activeVersion.version_name})</h4>
                            <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                                La versión vigente para este tablero no contiene integrantes adscritos en la dotación.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Version Badge Header */}
                            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[var(--bg-secondary)]/60 border border-[var(--border-color)] rounded-[var(--radius-control)]">
                                <div className="flex items-center gap-2 text-xs">
                                    <ShieldCheck className="w-4 h-4 text-[var(--color-primary)]" />
                                    <span className="font-bold text-[var(--text-primary)]">Versión Vigente:</span>
                                    <span className="text-[var(--text-secondary)]">{activeVersion.version_name}</span>
                                    <span className="text-[11px] text-[var(--text-muted)] font-mono">(Efectiva desde: {activeVersion.effective_from})</span>
                                </div>
                                <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-full w-max">
                                    {assignments.length} personas adscritas
                                </span>
                            </div>

                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-[var(--bg-secondary)]/50 text-[var(--text-muted)] text-xs uppercase tracking-wider">
                                        <th className="px-6 py-3 font-bold border-b border-[var(--border-color)]">Persona</th>
                                        <th className="px-6 py-3 font-bold border-b border-[var(--border-color)]">Cargo en Sitio</th>
                                        <th className="px-6 py-3 font-bold border-b border-[var(--border-color)]">Zona</th>
                                        <th className="px-6 py-3 font-bold border-b border-[var(--border-color)]">% Dedicación</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)]">
                                    {assignments.map(a => (
                                        <tr key={a.id} className="hover:bg-[var(--color-surface-subtle)] transition-colors">
                                            <td className="px-6 py-3 font-medium text-[var(--text-primary)]">{a.personnel_name}</td>
                                            <td className="px-6 py-3 text-[var(--text-secondary)]">{a.role_in_site || 'General'}</td>
                                            <td className="px-6 py-3">
                                                <span className="px-2 py-0.5 bg-[var(--color-primary-subtle)] text-[var(--color-primary)] dark:text-[var(--text-primary)] text-xs rounded font-bold border border-[var(--border-color)]">
                                                    {a.zone}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 font-mono text-[var(--text-primary)]">{a.dedication_percentage}%</td>
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
                        <div className="text-center py-8 text-[var(--text-muted)]">Selecciona un tablero para gestionar sus cuadrillas.</div>
                    ) : (
                        <>
                            {/* Formulario de Creación de Cuadrilla */}
                            {isCreatingCrew && (
                                <div className="p-4 mb-6 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                    <div>
                                        <label className="text-xs font-bold text-[var(--text-muted)] uppercase">Nombre Cuadrilla *</label>
                                        <input
                                            value={newCrew.name}
                                            onChange={e => setNewCrew({...newCrew, name: e.target.value})}
                                            className="w-full mt-1 px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--card-bg)] text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
                                            placeholder="Ej. Cuadrilla Norte"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-[var(--text-muted)] uppercase">Código (Opcional)</label>
                                        <input
                                            value={newCrew.code}
                                            onChange={e => setNewCrew({...newCrew, code: e.target.value})}
                                            className="w-full mt-1 px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--card-bg)] text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
                                            placeholder="Ej. CUAD-01"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-[var(--text-muted)] uppercase">Líder Configurado</label>
                                        <select
                                            value={newCrew.leader_id}
                                            onChange={e => setNewCrew({...newCrew, leader_id: e.target.value})}
                                            className="w-full mt-1 px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--card-bg)] text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
                                            aria-label="Seleccionar líder de cuadrilla"
                                        >
                                            {renderLeaderOptions()}
                                        </select>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleCreateCrew} disabled={!newCrew.name.trim() || crewMutations.createCrew.isPending} className="flex-1 font-bold">
                                            {crewMutations.createCrew.isPending ? 'Guardando...' : 'Guardar'}
                                        </Button>
                                        <Button onClick={() => setIsCreatingCrew(false)} variant="outline" className="px-3">
                                            <X size={18} />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Grid de Cuadrillas */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {loadingCrews ? (
                                    <div className="col-span-2 text-center py-8 text-[var(--text-muted)]">Cargando cuadrillas...</div>
                                ) : crews.length === 0 ? (
                                    <div className="col-span-2 text-center py-8 text-[var(--text-muted)]">No hay cuadrillas configuradas para este tablero.</div>
                                ) : crews.map(crew => {
                                    const isEditingThisCrew = editingCrewId === crew.id;
                                    const isAddingMember = addingMemberCrewId === crew.id;
                                    const currentMemberAssignmentIds = new Set(
                                        (crew.members || []).map(m => m.personnel_assignment_id)
                                    );
                                    const candidateAssignments = assignments.filter(
                                        a => !currentMemberAssignmentIds.has(a.id)
                                    );

                                    return (
                                        <div key={crew.id} className="border border-[var(--border-color)] rounded-xl p-4 bg-[var(--card-bg)] hover:shadow-xs transition-all flex flex-col justify-between">
                                            <div>
                                                {/* Header de la tarjeta */}
                                                {isEditingThisCrew ? (
                                                    <div className="space-y-3 pb-3 border-b border-[var(--border-color)]">
                                                        <div>
                                                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Nombre</label>
                                                            <input
                                                                value={editCrewForm.name}
                                                                onChange={e => setEditCrewForm({...editCrewForm, name: e.target.value})}
                                                                className="w-full mt-1 px-2.5 py-1.5 border border-[var(--border-color)] rounded text-sm bg-[var(--card-bg)] text-[var(--text-primary)] outline-none"
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Código</label>
                                                                <input
                                                                    value={editCrewForm.code}
                                                                    onChange={e => setEditCrewForm({...editCrewForm, code: e.target.value})}
                                                                    className="w-full mt-1 px-2.5 py-1.5 border border-[var(--border-color)] rounded text-sm bg-[var(--card-bg)] text-[var(--text-primary)] outline-none"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Líder</label>
                                                                <select
                                                                    value={editCrewForm.leader_id}
                                                                    onChange={e => setEditCrewForm({...editCrewForm, leader_id: e.target.value})}
                                                                    className="w-full mt-1 px-2 py-1.5 border border-[var(--border-color)] rounded text-xs bg-[var(--card-bg)] text-[var(--text-primary)] outline-none"
                                                                >
                                                                    {renderLeaderOptions()}
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end gap-2 pt-1">
                                                            <Button size="sm" onClick={() => handleSaveEditCrew(crew.id)} disabled={!editCrewForm.name.trim() || crewMutations.updateCrew.isPending} className="text-xs font-bold gap-1">
                                                                <Save size={14} /> Guardar
                                                            </Button>
                                                            <Button size="sm" variant="outline" onClick={() => setEditingCrewId(null)} className="text-xs">
                                                                Cancelar
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <h3 className="font-bold text-[var(--text-primary)] text-base">{crew.name}</h3>
                                                            {crew.code && <span className="text-xs text-[var(--text-muted)] font-mono">[{crew.code}]</span>}
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`px-2 py-0.5 text-xs font-bold rounded-full flex items-center gap-1 ${
                                                                crew.is_active
                                                                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                                                    : 'bg-red-500/10 text-red-600 border border-red-500/20'
                                                            }`}>
                                                                {crew.is_active ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                                                                {crew.is_active ? 'Activa' : 'Inactiva'}
                                                            </span>
                                                            <button
                                                                onClick={() => handleStartEditCrew(crew)}
                                                                className="p-1 text-[var(--text-muted)] hover:text-[var(--color-primary)] rounded hover:bg-[var(--color-surface-subtle)] transition-all"
                                                                title="Editar Cuadrilla"
                                                                aria-label={`Editar cuadrilla ${crew.name}`}
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteCrew(crew.id, crew.name)}
                                                                className="p-1 text-[var(--text-muted)] hover:text-red-500 rounded hover:bg-[var(--color-surface-subtle)] transition-all"
                                                                title="Desactivar Cuadrilla"
                                                                aria-label={`Desactivar cuadrilla ${crew.name}`}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Información de líder y miembros */}
                                                {!isEditingThisCrew && (
                                                    <div className="text-xs text-[var(--text-secondary)] space-y-1 mb-3">
                                                        <div><strong>Líder Configurado:</strong> {crew.leader_name || 'Sin asignar'}</div>
                                                        <div><strong>Integrantes Activos:</strong> {crew.members_count || 0} personas</div>
                                                    </div>
                                                )}

                                                {/* Mensaje de error local en cuadrilla */}
                                                {memberActionError && memberActionError.crewId === crew.id && (
                                                    <div className="mb-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-[11px] text-red-600 flex items-center gap-1.5">
                                                        <AlertCircle size={14} className="shrink-0" />
                                                        <span>{memberActionError.message}</span>
                                                    </div>
                                                )}

                                                {/* Lista de Miembros */}
                                                <div className="mt-3 pt-2 border-t border-[var(--border-color)]">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[11px] font-bold uppercase text-[var(--text-muted)]">Miembros Asignados:</span>
                                                        {!isAddingMember && (
                                                            <button
                                                                onClick={() => {
                                                                    setAddingMemberCrewId(crew.id);
                                                                    setSelectedAssignmentIdToAdd(candidateAssignments[0]?.id || '');
                                                                }}
                                                                className="text-[11px] font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1"
                                                            >
                                                                <UserPlus size={12} /> Agregar Miembro
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Formulario inline para agregar miembro */}
                                                    {isAddingMember && (
                                                        <div className="p-2.5 mb-2 bg-[var(--bg-secondary)]/70 border border-[var(--border-color)] rounded-lg space-y-2 animate-in fade-in duration-150">
                                                            <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">
                                                                Seleccionar Persona Adscrita
                                                            </label>
                                                            {candidateAssignments.length === 0 ? (
                                                                <p className="text-[11px] text-[var(--text-muted)] italic">
                                                                    No hay más personal adscrito disponible en la dotación activa para agregar.
                                                                </p>
                                                            ) : (
                                                                <select
                                                                    value={selectedAssignmentIdToAdd}
                                                                    onChange={e => setSelectedAssignmentIdToAdd(e.target.value)}
                                                                    className="w-full px-2 py-1.5 border border-[var(--border-color)] rounded text-xs bg-[var(--card-bg)] text-[var(--text-primary)] outline-none"
                                                                    aria-label="Seleccionar persona adscrita para agregar"
                                                                >
                                                                    {candidateAssignments.map(a => (
                                                                        <option key={a.id} value={a.id}>
                                                                            {a.personnel_name} ({a.zone} - {a.role_in_site || 'General'})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                            <div className="flex justify-end gap-1.5 pt-1">
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleAddMember(crew.id)}
                                                                    disabled={!selectedAssignmentIdToAdd || candidateAssignments.length === 0 || crewMutations.addMember.isPending}
                                                                    className="text-xs font-bold px-3 py-1 h-7"
                                                                >
                                                                    {crewMutations.addMember.isPending ? 'Agregando...' : 'Confirmar'}
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => {
                                                                        setAddingMemberCrewId(null);
                                                                        setSelectedAssignmentIdToAdd('');
                                                                    }}
                                                                    className="text-xs px-2 py-1 h-7"
                                                                >
                                                                    <X size={14} />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Chips de miembros */}
                                                    {(!crew.members || crew.members.length === 0) ? (
                                                        <p className="text-xs text-[var(--text-muted)] italic py-1">Sin miembros asignados a esta cuadrilla.</p>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                                            {crew.members.map(m => (
                                                                <span
                                                                    key={m.id}
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs rounded-md shadow-2xs"
                                                                >
                                                                    <span className="font-medium">{m.full_name}</span>
                                                                    <span className="text-[10px] px-1 bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-bold rounded">
                                                                        {m.zone}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleRemoveMember(crew.id, m.id, m.full_name)}
                                                                        className="text-[var(--text-muted)] hover:text-red-500 ml-0.5 transition-colors"
                                                                        title="Retirar de la cuadrilla"
                                                                        aria-label={`Retirar a ${m.full_name} de la cuadrilla`}
                                                                    >
                                                                        <X size={13} />
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Active Tab: Machinery */}
            {activeTab === 'machinery' && (
                <div className="p-6">
                    {!boardId ? (
                        <div className="text-center py-8 text-[var(--text-muted)]">Selecciona un tablero para gestionar su maquinaria.</div>
                    ) : (
                        <>
                            {isCreatingMachinery && (
                                <div className="mb-6 p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 rounded-xl space-y-3">
                                    <h4 className="font-bold text-sm text-[var(--text-primary)]">Registrar Nueva Maquinaria</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <input
                                            type="text"
                                            placeholder="Código (ej. TR-001)"
                                            value={newMachinery.code}
                                            onChange={e => setNewMachinery({ ...newMachinery, code: e.target.value })}
                                            className="px-3 py-1.5 text-sm border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-primary)]"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Nombre (ej. Tractor Agrícola 1)"
                                            value={newMachinery.name}
                                            onChange={e => setNewMachinery({ ...newMachinery, name: e.target.value })}
                                            className="px-3 py-1.5 text-sm border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-primary)]"
                                        />
                                        <select
                                            value={newMachinery.category}
                                            onChange={e => setNewMachinery({ ...newMachinery, category: e.target.value as any })}
                                            className="px-3 py-1.5 text-sm border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-primary)]"
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
                                            className="px-3 py-1.5 text-sm border border-[var(--border-color)] rounded bg-[var(--card-bg)] text-[var(--text-primary)]"
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
                                    <div className="col-span-2 text-center py-8 text-[var(--text-muted)]">Cargando maquinaria...</div>
                                ) : machineryList.length === 0 ? (
                                    <div className="col-span-2 text-center py-8 text-[var(--text-muted)]">No hay maquinaria registrada para este tablero.</div>
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
                                        <div key={m.id} className="border border-[var(--border-color)] rounded-xl p-4 bg-[var(--card-bg)] hover:shadow-xs transition-all">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                                                        <Truck size={16} className="text-[var(--color-primary)]" /> {m.name}
                                                    </h3>
                                                    <span className="text-xs text-[var(--text-muted)] font-mono">[{m.code}]</span>
                                                </div>
                                                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                                                    !isAvailable
                                                        ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                                                        : avail?.effectiveStatus === 'FULLY_AVAILABLE'
                                                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                                        : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                                }`}>
                                                    {statusText}
                                                </span>
                                            </div>

                                            <div className="text-xs text-[var(--text-secondary)] space-y-1 mb-3">
                                                <div><strong>Categoría:</strong> {m.category}</div>
                                                <div><strong>Rol Operador Requerido:</strong> {m.operatorRequirement?.requiredRole || 'Ninguno (Libre)'}</div>
                                                {avail?.reason && <div className="text-[11px] text-[var(--text-muted)] italic mt-1">{avail.reason}</div>}
                                            </div>

                                            <div className="mt-3 pt-2 border-t border-[var(--border-color)] flex justify-between items-center">
                                                <span className="text-xs text-[var(--text-muted)]">Retiro Operacional (Soft-Retirement):</span>
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

            {/* Governed Reassignment Modal */}
            {isReassigningGoverned && boardId && activeVersion && (
                <GovernedPersonnelReassignmentModal
                    isOpen={isReassigningGoverned}
                    onClose={() => setIsReassigningGoverned(false)}
                    boardId={boardId}
                    sourceVersionId={activeVersion.id}
                    assignments={assignments}
                    personnelList={personnel}
                />
            )}
        </div>
    );
}
