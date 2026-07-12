'use client';

import { 
  X, MessageSquare, Info, History, User, Calendar, 
  Camera, Image as ImageIcon, Trash2, CheckCircle2, 
  Link as LinkIcon, Search, Plus, FileText, MapPin, Activity, Globe, Loader2, GitGraph, FileCode, ArrowRight
} from 'lucide-react';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Item } from '@/types/monday';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useAttachments } from '@/hooks/useAttachments';

import { generateServerItemPDF } from '@/lib/serverReports';
import { useBoardColumns } from '@/hooks/useBoardData';
import { LocationPicker } from '@/components/LocationPicker';

interface ItemModalProps {
  item: Item | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateValue: (columnId: string, value: any) => void;
  onUpdateValues: (updates: Record<string, any>) => void;
  onUpdateGeneric: (fieldOrUpdates: string | Record<string, any>, value?: any) => void;
  onDeleteItem: (itemId: number | string) => void;
  boardId?: string;
  initialTab?: TabType;
}

type TabType = 'updates' | 'details' | 'execution' | 'evidence' | 'attachments' | 'dependencies' | 'location';

export default function ItemModal({ item, isOpen, onClose, onUpdateValue, onUpdateValues, onUpdateGeneric, onDeleteItem, boardId, initialTab }: ItemModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'updates');
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { user } = useAuth();
  const { attachments, uploadAttachment, deleteAttachment } = useAttachments(item?.id);
  const { data: columns = [] } = useBoardColumns(boardId);

  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  const fetchComments = useCallback(async () => {
    if (!item) return;
    setLoadingComments(true);
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false });
    if (!error && data) setComments(data);
    setLoadingComments(false);
  }, [item]);

  const fetchDependencies = useCallback(async () => {
    if (!item) return;
    const { data } = await supabase
      .from('task_dependencies')
      .select(`
          id,
          source_item_id,
          target_item_id,
          source_item:items!source_item_id(id, name, values),
          target_item:items!target_item_id(id, name, values)
      `)
      .or(`target_item_id.eq.${item.id},source_item_id.eq.${item.id}`);
    if (data) setDependencies(data);
  }, [item]);

  useEffect(() => {
    if (isOpen && item) {
      if (activeTab === 'updates') fetchComments();
      if (activeTab === 'dependencies') fetchDependencies();
    }
  }, [isOpen, item, activeTab, fetchComments, fetchDependencies]);

  const handlePostComment = async () => {
    if (!item || !newComment.trim() || !user) return;
    setIsSubmitting(true);
    const { error } = await supabase.from('comments').insert({
      item_id: item.id,
      user_id: user.id,
      content: newComment
    });
    if (!error) {
      setNewComment('');
      fetchComments();
    }
    setIsSubmitting(false);
  };

  const handleUpdateDaily = (dayId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    const currentExecution = item?.values['daily_execution'] || {};
    const newDaily = { ...currentExecution, [dayId]: numValue };
    onUpdateValue('daily_execution', newDaily);
  };

  const searchTasks = async (term: string) => {
      setSearchTerm(term);
      if (term.length < 2 || !boardId) {
          setSearchResults([]);
          return;
      }
      const { data } = await supabase
          .from('items')
          .select('id, name')
          .ilike('name', `%${term}%`)
          .eq('board_id', boardId)
          .neq('id', item?.id)
          .limit(5);
      if (data) setSearchResults(data);
  };

  const addDependency = async (sourceId: string) => {
      if (!item || !boardId) return;
      const { error } = await supabase.from('task_dependencies').insert({
          board_id: boardId,
          source_item_id: sourceId,
          target_item_id: item.id,
          type: 'finish_to_start'
      });
      if (!error) {
          setSearchTerm('');
          setSearchResults([]);
          fetchDependencies();
      }
  };

  const removeDependency = async (id: string) => {
      await supabase.from('task_dependencies').delete().eq('id', id);
      fetchDependencies();
  };

  const handlePhotoUpload = async () => {
    if (!selectedFile) return;
    try {
      await uploadAttachment.mutateAsync({ file: selectedFile, isEvidence: true });
      setNewPhoto(null);
      setSelectedFile(null);
    } catch (error) {
      alert('Error uploading photo');
    }
  };

  const status = item?.values['status'] || 'Not Started';
  const person = item?.values['person'] || 'Desconocido';
  const evidence = item?.values['evidence'] || [];
  const dailyExecution = item?.values['daily_execution'] || {};

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'updates', label: 'Updates', icon: MessageSquare },
    { id: 'details', label: 'Ficha', icon: Info },
    { id: 'execution', label: 'Ejecución', icon: Activity },
    { id: 'evidence', label: 'Campo', icon: Camera },
    { id: 'attachments', label: 'Archivos', icon: LinkIcon },
    { id: 'location', label: 'Geo-ref', icon: Globe },
    { id: 'dependencies', label: 'Vínculos', icon: GitGraph },
  ];

  return (
    <AnimatePresence>
      {isOpen && item && (
        <div className="fixed inset-0 z-[100] flex justify-end font-sans">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full max-w-[650px] h-full bg-[var(--bg-primary)] shadow-[0_0_100px_rgba(0,0,0,0.8)] border-l border-[var(--border-color)] flex flex-col overflow-hidden"
          >
            {/* Top Navigation Progress */}
            <div className="absolute top-0 left-0 right-0 h-1 z-50 bg-slate-500/5">
               <motion.div 
                 initial={{ width: 0 }} 
                 animate={{ width: activeTab === 'details' ? '30%' : activeTab === 'execution' ? '60%' : activeTab === 'updates' ? '10%' : '100%' }}
                 className="h-full bg-gradient-to-r from-[#3B7EF8] to-emerald-400 shadow-[0_0_15px_rgba(59,126,248,0.5)]" 
               />
            </div>

            {/* Header */}
            <header className="p-8 pb-4 border-b border-[var(--border-color)] bg-gradient-to-b from-[#161B30] to-transparent">
               <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4 flex-1 mr-4">
                     <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3B7EF8] to-[#1E2442] flex items-center justify-center text-white shadow-xl border border-[var(--border-color)] flex-shrink-0">
                        <Activity size={20} className="animate-pulse" />
                     </div>
                     <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#3B7EF8]">Operational Detail</span>
                        <input 
                          type="text" 
                          className="bg-transparent border-none p-0 text-xl font-black text-white focus:ring-0 w-full placeholder-slate-700 truncate"
                          value={item.name}
                          onChange={(e) => onUpdateGeneric('name', e.target.value)}
                        />
                     </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <button 
                       onClick={async () => {
                         setIsGeneratingPDF(true);
                         await generateServerItemPDF(item, columns, evidence);
                         setIsGeneratingPDF(false); 
                       }}
                       disabled={isGeneratingPDF}
                       className="p-2.5 rounded-xl bg-slate-500/5 hover:bg-[#3B7EF8]/20 text-slate-400 hover:text-[#3B7EF8] transition-all border border-[var(--border-color)] group disabled:opacity-50"
                     >
                        {isGeneratingPDF ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                     </button>
                     <button onClick={onClose} className="p-2.5 rounded-xl bg-slate-500/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-all border border-[var(--border-color)]">
                        <X size={20} />
                     </button>
                  </div>
               </div>

               {/* Navigation Tabs */}
               <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                      <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all relative group flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500 hover:text-[var(--text-primary)]'}`}
                      >
                         <Icon size={14} className={`mr-2 ${isActive ? 'text-[#3B7EF8]' : 'text-slate-600'}`} />
                         {tab.label}
                         {isActive && <motion.div layoutId="tabLine" className="absolute bottom-0 left-4 right-4 h-0.5 bg-[#3B7EF8] shadow-[0_0_10px_#3B7EF8]" />}
                      </button>
                    );
                  })}
               </nav>
            </header>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--bg-primary)]">
               <div className="p-8">
                  {activeTab === 'updates' && (
                    <div className="space-y-8 max-w-2xl mx-auto">
                       <div className="industrial-card rounded-2xl p-4 border-[var(--border-color)] relative group-focus-within:border-[#3B7EF8]/30 transition-all">
                          <textarea 
                            placeholder="Reportar avance o anomalía..."
                            className="w-full bg-transparent border-none text-[var(--text-primary)] placeholder-slate-600 text-sm font-medium resize-none min-h-[120px] focus:ring-0"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                          />
                          <div className="flex justify-between items-center mt-4">
                             <div className="flex gap-2 text-slate-500">
                                <button className="p-2 hover:bg-slate-500/5 rounded-lg transition-colors"><ImageIcon size={16} /></button>
                                <button className="p-2 hover:bg-slate-500/5 rounded-lg transition-colors"><MapPin size={16} /></button>
                             </div>
                             <button 
                               onClick={handlePostComment}
                               disabled={isSubmitting || !newComment.trim()}
                               className="px-6 py-2 bg-[#3B7EF8] hover:bg-[#3B7EF8]/80 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-[#3B7EF8]/20 disabled:opacity-50"
                             >
                                {isSubmitting ? 'Publicando...' : 'Publicar'}
                             </button>
                          </div>
                       </div>

                       <div className="space-y-6">
                          {loadingComments ? (
                             <div className="text-center py-10 text-slate-600 animate-pulse uppercase tracking-widest text-[10px] font-black">Reading Logs...</div>
                          ) : comments.map((comment, idx) => (
                             <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={comment.id} className="relative pl-8 border-l border-[var(--border-color)]">
                                <div className="absolute left-[-5px] top-0 w-2 h-2 rounded-full bg-[#3B7EF8] shadow-[0_0_8px_#3B7EF8]" />
                                <div className="industrial-card p-5 rounded-2xl">
                                   <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center gap-3">
                                         <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 font-mono text-[10px] font-black">OP</div>
                                         <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Update Log</span>
                                      </div>
                                      <span className="text-[10px] font-mono text-slate-500">{new Date(comment.created_at).toLocaleTimeString()}</span>
                                   </div>
                                   <p className="text-sm text-slate-400 font-medium leading-relaxed">{comment.content}</p>
                                </div>
                             </motion.div>
                          ))}
                          {comments.length === 0 && !loadingComments && (
                             <div className="text-center py-20 opacity-20"><MessageSquare size={48} className="mx-auto mb-4" /><p className="text-xs font-black uppercase tracking-widest">No activity reported</p></div>
                          )}
                       </div>
                    </div>
                  )}

                  {activeTab === 'details' && (
                    <div className="grid grid-cols-2 gap-6">
                        <section className="col-span-2 industrial-card p-6 rounded-3xl mb-4">
                           <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-8 border-b border-[var(--border-color)] pb-4">Especificaciones Industriales</h4>
                           <div className="grid grid-cols-2 gap-y-10">
                              <div className="space-y-2">
                                 <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 flex items-center gap-2"><User size={12} /> Responsable</label>
                                 <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-black text-xs border border-indigo-500/20">{String(person).charAt(0)}</div>
                                    <span className="text-sm font-black text-[var(--text-primary)] uppercase tracking-tight">{person}</span>
                                 </div>
                              </div>
                              <div className="space-y-2">
                                 <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 flex items-center gap-2"><Activity size={12} /> Estado</label>
                                 <span className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-xl border w-fit block ${
                                   status === 'Done' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                   status === 'Stuck' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                   'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                 }`}>
                                    {status}
                                 </span>
                              </div>
                              <div className="space-y-2">
                                 <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 flex items-center gap-2"><Calendar size={12} /> Fecha Límite</label>
                                 <input 
                                   type="date" 
                                   className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-4 py-2 text-xs font-black text-[#3B7EF8] outline-none"
                                   value={item.values['date'] || ''}
                                   onChange={(e) => onUpdateValue('date', e.target.value)}
                                 />
                              </div>
                              <div className="space-y-2">
                                 <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 flex items-center gap-2"><MapPin size={12} /> Zona</label>
                                 <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest">{item.values['zone'] || 'Industrial Base'}</span>
                              </div>
                           </div>
                        </section>

                        <section className="col-span-2 industrial-card p-6 rounded-3xl mb-4">
                           <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6">Campos de Datos Establecidos</h4>
                           <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                              {columns
                                .filter(c => !['status', 'people', 'date', 'dependency', 'subitems', 'timeline'].includes(c.type))
                                .map(col => (
                                   <div key={col.id} className="space-y-1.5 group/field">
                                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 pl-1 group-focus-within/field:text-[#3B7EF8] transition-colors">{col.title}</label>
                                      <input 
                                        type="text"
                                        placeholder={`Dato de ${col.title.toLowerCase()}...`}
                                        className="w-full bg-[var(--bg-secondary)]/30 border border-[var(--border-color)] rounded-2xl px-5 py-3 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[#3B7EF8]/30 transition-all placeholder-slate-900 shadow-inner"
                                        value={item.values[col.id] || ''}
                                        onChange={(e) => onUpdateValue(col.id, e.target.value)}
                                      />
                                   </div>
                                ))}
                           </div>
                        </section>

                        <section className="col-span-2 industrial-card p-6 rounded-3xl">
                           <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6">Descriptor Operativo</h4>
                           <textarea 
                             className="w-full bg-[var(--bg-secondary)]/30 border border-[var(--border-color)] rounded-2xl p-6 text-sm text-slate-400 font-medium min-h-[180px] focus:ring-1 focus:ring-[#3B7EF8]/50 transition-all outline-none"
                             value={item.description || ''}
                             onChange={(e) => onUpdateGeneric('description', e.target.value)}
                             placeholder="Documentar protocolos para esta actividad..."
                           />
                        </section>
                    </div>
                  )}

                  {activeTab === 'execution' && (
                    <div className="space-y-8">
                       <section className="industrial-card p-8 rounded-[40px] relative overflow-hidden">
                          <div className="relative z-10">
                             <h4 className="text-xl font-black text-white italic tracking-tighter uppercase mb-2">Registro de Ciclos</h4>
                             <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-10">Cronograma de ejecución diaria (7 dias)</p>
                             
                             <div className="grid grid-cols-2 gap-x-12 gap-y-10">
                                {Array.from({ length: 7 }, (_, i) => {
                                  const d = new Date();
                                  d.setDate(d.getDate() + i);
                                  const id = d.toISOString().split('T')[0];
                                  const label = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
                                  return (
                                    <div key={id} className="group/exec">
                                       <div className="flex justify-between items-center mb-3">
                                          <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{label}</label>
                                          <div className="h-1 w-1 rounded-full bg-[#3B7EF8]/30 group-focus-within/exec:bg-[#3B7EF8]" />
                                       </div>
                                       <div className="relative">
                                          <input 
                                            type="number"
                                            value={dailyExecution[id] || ''}
                                            onChange={(e) => handleUpdateDaily(id, e.target.value)}
                                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] group-focus-within/exec:border-[#3B7EF8]/30 rounded-2xl px-6 py-4 font-mono font-black text-[var(--text-primary)] outline-none transition-all placeholder-slate-800"
                                            placeholder="0.00"
                                          />
                                          <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-700">UNIT</span>
                                       </div>
                                    </div>
                                  );
                                })}
                             </div>
                          </div>
                          <div className="absolute top-0 right-0 w-64 h-64 bg-[#3B7EF8]/5 blur-[100px] pointer-events-none" />
                       </section>
                    </div>
                  )}

                  {activeTab === 'location' && (
                    <div className="space-y-6">
                       <div className="industrial-card p-4 rounded-[40px] overflow-hidden relative border-[#3B7EF8]/20">
                          <header className="px-6 py-8 flex items-center justify-between">
                             <div>
                                <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Geo-Posicionamiento</h3>
                                <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mt-1">Satellite Precision Tracking</p>
                             </div>
                             <div className={`px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest backdrop-blur-md ${isSavingLocation ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                                {isSavingLocation ? 'Syncing...' : 'Live GPS'}
                             </div>
                          </header>
                          
                          <div className="mx-6 rounded-[2.5rem] overflow-hidden border border-[var(--border-color)] shadow-2xl relative h-[350px]">
                             <LocationPicker 
                               initialPos={{ 
                                 lat: (item as any).lat || (item.values['lat'] ? parseFloat(String(item.values['lat'])) : null) || 10.9685, 
                                 lng: (item as any).lng || (item.values['lng'] ? parseFloat(String(item.values['lng'])) : null) || -74.7813 
                               }}
                               onSelect={(coords) => {
                                 setSaveSuccess(false);
                                 setIsSavingLocation(true);
                                 onUpdateValues({ lat: coords.lat, lng: coords.lng });
                                 onUpdateGeneric({ lat: coords.lat, lng: coords.lng });
                                 setTimeout(() => { setIsSavingLocation(false); setSaveSuccess(true); }, 400);
                               }}
                             />
                          </div>

                          <div className="grid grid-cols-2 gap-4 p-6 mt-4">
                             <div className="industrial-card p-5 rounded-2xl border-[var(--border-color)] bg-[var(--bg-secondary)]/30 shadow-inner">
                                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3">Latitude Coords</p>
                                <p className="text-xl font-mono font-black text-[#3B7EF8] leading-none tracking-tighter italic">{(item.values['lat']) || '---'}</p>
                             </div>
                             <div className="industrial-card p-5 rounded-2xl border-[var(--border-color)] bg-[var(--bg-secondary)]/30 shadow-inner">
                                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3">Longitude Coords</p>
                                <p className="text-xl font-mono font-black text-[#3B7EF8] leading-none tracking-tighter italic">{(item.values['lng']) || '---'}</p>
                             </div>
                          </div>
                       </div>
                    </div>
                  )}

                  {activeTab === 'evidence' && (
                    <div className="space-y-8">
                       <label className="industrial-card p-12 rounded-[50px] border-dashed border-[var(--border-color)] text-center flex flex-col items-center group hover:border-[#3B7EF8]/30 transition-all cursor-pointer relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-b from-[#3B7EF8]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="w-20 h-20 rounded-3xl bg-[#3B7EF8]/10 flex items-center justify-center text-[#3B7EF8] mb-8 shadow-2xl border border-[#3B7EF8]/20 group-hover:scale-110 transition-transform relative z-10">
                             <Camera size={36} />
                          </div>
                          <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2 relative z-10">Capturar Evidencia</h3>
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] max-w-[280px] relative z-10">Satellite Image Validation Required</p>
                          <input type="file" accept="image/*" className="hidden" 
                            onChange={(e) => {
                               const file = e.target.files?.[0];
                               if (file) {
                                 setSelectedFile(file);
                                 const reader = new FileReader();
                                 reader.onloadend = () => setNewPhoto(reader.result as string);
                                 reader.readAsDataURL(file);
                               }
                            }}
                          />
                       </label>

                       {newPhoto && (
                          <div className="industrial-card p-6 rounded-3xl border-[#3B7EF8]/30 animate-in fade-in zoom-in duration-300">
                             <div className="relative aspect-video rounded-2xl overflow-hidden mb-6 border border-[var(--border-color)] shadow-2xl">
                                <Image src={newPhoto} alt="Review" fill className="object-cover" />
                             </div>
                             <div className="flex gap-4">
                                <button onClick={handlePhotoUpload} disabled={uploadAttachment.isPending} className="flex-1 py-4 bg-[#3B7EF8] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3">
                                   {uploadAttachment.isPending ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={16} /> Confirmar Reporte</>}
                                </button>
                                <button onClick={() => setNewPhoto(null)} className="px-6 py-4 bg-slate-500/5 hover:bg-rose-500/10 text-slate-500 hover:text-rose-500 rounded-2xl transition-all border border-[var(--border-color)]"><Trash2 size={18} /></button>
                             </div>
                          </div>
                       )}

                       <div className="grid grid-cols-3 gap-4">
                          {evidence.map((ev: any, i: number) => (
                             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} key={i} className="group relative aspect-square rounded-2xl overflow-hidden border border-[var(--border-color)] shadow-xl hover:shadow-[#3B7EF8]/10 transition-all">
                                <Image src={ev.url} alt="Evidence" fill className="object-cover transition-transform group-hover:scale-110" />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0C0F1A] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                                   <span className="text-[9px] font-mono font-bold text-[#3B7EF8] uppercase">{new Date(ev.timestamp).toLocaleDateString()}</span>
                                </div>
                                <button 
                                  onClick={() => onUpdateValue('evidence', evidence.filter((_: any, idx: number) => idx !== i))}
                                  className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-2xl"
                                >
                                   <Trash2 size={12} />
                                </button>
                             </motion.div>
                          ))}
                       </div>
                    </div>
                  )}

                  {activeTab === 'attachments' && (
                    <div className="space-y-10">
                       <label className="industrial-card p-10 rounded-[40px] border-dashed border-[var(--border-color)] text-center flex flex-col items-center group hover:bg-slate-500/5 transition-all cursor-pointer">
                          <div className="w-16 h-16 rounded-2xl bg-slate-500/5 flex items-center justify-center text-slate-500 mb-6 group-hover:text-[#3B7EF8] transition-colors">
                             <Plus size={32} />
                          </div>
                          <h4 className="text-xl font-black text-white italic tracking-tighter uppercase mb-1">Cargar Documentación</h4>
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Planos, Reportes y Auditorías</p>
                          <input type="file" className="hidden" onChange={async (e) => {
                             const file = e.target.files?.[0];
                             if (file) await uploadAttachment.mutateAsync({ file });
                          }}/>
                       </label>

                       <div className="space-y-4">
                          <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] px-2 mb-6">File Archive</h4>
                          {attachments?.map((file) => (
                             <div key={file.id} className="industrial-card p-5 rounded-3xl flex items-center justify-between group hover:border-white/20 transition-all">
                                <div className="flex items-center gap-6 min-w-0">
                                   <div className="w-14 h-14 rounded-2xl bg-[var(--bg-secondary)] flex items-center justify-center border border-[var(--border-color)] text-slate-600 group-hover:text-[#3B7EF8] transition-colors relative overflow-hidden">
                                       <div className="absolute top-0 right-0 p-1"><Activity size={8} className="text-slate-800" /></div>
                                       {file.file_type.includes('pdf') ? <FileText size={24} /> : <FileCode size={24} />}
                                   </div>
                                   <div className="truncate">
                                      <p className="text-sm font-black text-[var(--text-primary)] uppercase tracking-tight truncate max-w-[200px] italic">{file.file_name}</p>
                                      <p className="text-[9px] font-mono font-bold text-slate-600">{(file.file_size / 1024 / 1024).toFixed(2)} MB • {new Date(file.created_at).toLocaleDateString()}</p>
                                   </div>
                                </div>
                                <div className="flex gap-2">
                                   <a href={file.file_url} target="_blank" rel="noreferrer" className="p-3 bg-slate-500/5 hover:bg-[#3B7EF8]/20 text-slate-600 hover:text-[#3B7EF8] rounded-xl border border-[var(--border-color)] transition-all"><LinkIcon size={16} /></a>
                                   <button onClick={() => deleteAttachment.mutate(file)} className="p-3 bg-slate-500/5 hover:bg-rose-500/10 text-slate-600 hover:text-rose-500 rounded-xl border border-[var(--border-color)] transition-all"><Trash2 size={16} /></button>
                                </div>
                             </div>
                          ))}
                       </div>
                    </div>
                  )}

                  {activeTab === 'dependencies' && (
                    <div className="space-y-10">
                       <section className="industrial-card p-10 rounded-[40px] border-[#3B7EF8]/20">
                          <h4 className="text-xl font-black text-white italic tracking-tighter uppercase mb-6 flex items-center gap-3"><GitGraph size={24} /> Vínculos de Precedencia</h4>
                          <div className="relative group">
                              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-[#3B7EF8] transition-colors" size={20} />
                              <input 
                                type="text"
                                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[2rem] pl-16 pr-8 py-5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[#3B7EF8]/30 transition-all placeholder-slate-800"
                                placeholder="Buscar tarea predecesora..."
                                value={searchTerm}
                                onChange={(e) => searchTasks(e.target.value)}
                              />
                              <AnimatePresence>
                                 {searchResults.length > 0 && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute top-full left-0 right-0 mt-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[2rem] shadow-2xl overflow-hidden z-20">
                                       {searchResults.map(res => (
                                          <button key={res.id} onClick={() => addDependency(res.id)} className="w-full text-left px-8 py-4 hover:bg-slate-500/5 text-sm font-black text-slate-400 hover:text-white uppercase tracking-tighter flex items-center justify-between group/res border-b border-[var(--border-color)] last:border-0">
                                             {res.name}
                                             <Plus size={16} className="opacity-0 group-hover/res:opacity-100 text-[#3B7EF8]" />
                                          </button>
                                       ))}
                                    </motion.div>
                                 )}
                              </AnimatePresence>
                          </div>
                       </section>

                       <div className="space-y-4">
                          <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] px-4 mb-6">Active Dependencies</h4>
                          {dependencies.map(dep => {
                             const isPredecessor = dep.target_item_id === item?.id;
                             const other = isPredecessor ? dep.source_item : dep.target_item;
                             return (
                                <div key={dep.id} className="industrial-card p-6 rounded-3xl flex items-center justify-between group">
                                   <div className="flex items-center gap-6">
                                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${isPredecessor ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-500'}`}>
                                         {isPredecessor ? <History size={20} /> : <ArrowRight size={20} />}
                                      </div>
                                      <div>
                                         <p className="text-sm font-black text-[var(--text-primary)] uppercase italic tracking-tighter">{other?.name || 'External_Reference'}</p>
                                         <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{isPredecessor ? 'Bloquea esta tarea' : 'Bloqueada por esta tarea'}</p>
                                      </div>
                                   </div>
                                   <button onClick={() => removeDependency(dep.id)} className="p-3 text-slate-800 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"><Trash2 size={16} /></button>
                                </div>
                             );
                          })}
                       </div>
                    </div>
                  )}
               </div>
            </div>

            {/* Actions Footer */}
            <footer className="p-8 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] flex items-center justify-between h-[100px] flex-shrink-0">
                <div className="flex flex-col">
                   <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-600 mb-1">Status Report</span>
                   <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${status === 'Done' ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 'bg-amber-500 animate-pulse shadow-[0_0_12px_#f59e0b]'}`} />
                      <span className="text-sm font-black text-[var(--text-primary)] uppercase tracking-widest italic">{status}</span>
                   </div>
                </div>
                <div className="flex gap-4">
                   <button onClick={() => onDeleteItem(item.id)} className="px-8 py-3 rounded-2xl border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 text-[11px] font-black uppercase tracking-[0.3em] transition-all">
                      Eliminar
                   </button>
                   <button onClick={onClose} className="px-12 py-3 bg-[#3B7EF8] hover:bg-[#3B7EF8]/90 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] transition-all shadow-2xl shadow-[#3B7EF8]/30 active:scale-95">
                      Sincronizar
                   </button>
                </div>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
