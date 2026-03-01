import { X, MessageSquare, Info, History, User, Calendar, Tag, MoreHorizontal, Camera, Image as ImageIcon, Trash2, CheckCircle2, Calculator, Link as LinkIcon, Search, Plus, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useState, useCallback } from 'react';
import Image from 'next/image';
import { Item } from '@/types/monday';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { useAttachments } from '@/hooks/useAttachments';
import { FileIcon, FileText as FileTextIcon, FileCode, Music, Video, Archive } from 'lucide-react';
import MentionSelector from '@/components/board/MentionSelector';
import { generateServerItemPDF } from '@/lib/serverReports';
import { useBoardColumns } from '@/hooks/useBoardData';

interface ItemModalProps {
  item: Item | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateValue: (columnId: string, value: any) => void;
  onUpdateGeneric: (field: string, value: any) => void;
  onDeleteItem: (itemId: number | string) => void;
  boardId?: string; // Need boardId to search other items
}

export default function ItemModal({ item, isOpen, onClose, onUpdateValue, onUpdateGeneric, onDeleteItem, boardId }: ItemModalProps) {
  const [activeTab, setActiveTab] = useState<'updates' | 'details' | 'evidence' | 'attachments' | 'execution' | 'dependencies'>('updates');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mention State
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);

  const status = item?.values['status'] || 'Not Started';
  const person = item?.values['person'] || 'Desconocido';
  const date = item?.values['date'] || 'Sin fecha';
  
  const evidence = item?.values['evidence'] || [];
  const dailyExecution = item?.values['daily_execution'] || {};
  
  // Comments State
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const { user } = useAuth();
  const { attachments, uploadAttachment, deleteAttachment } = useAttachments(item?.id);
  const { data: columns = [] } = useBoardColumns(boardId);
  
  // Dependencies State
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!item) return;
    setLoadingComments(true);
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setComments(data);
    }
    setLoadingComments(false);
  }, [item]);

  const fetchDependencies = useCallback(async () => {
      if (!item) return;
      const { data } = await supabase
        .from('task_dependencies')
        .select(`
            id,
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
          .eq('board_id', boardId) // Make sure we pass boardId
          .neq('id', item?.id) // Can't depend on self
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

      if (error) {
          alert('Error al crear dependencia: ' + error.message);
      } else {
          setSearchTerm('');
          setSearchResults([]);
          fetchDependencies();
      }
  };

  const removeDependency = async (id: string) => {
      await supabase.from('task_dependencies').delete().eq('id', id);
      fetchDependencies();
  };

  const handlePostComment = async () => {
    if (!item || !newComment.trim() || !user) return;
    
    setIsSubmitting(true);
    const { error, data: commentData } = await supabase
      .from('comments')
      .insert({
        item_id: item.id,
        user_id: user.id,
        content: newComment
      })
      .select()
      .single();
      
    if (!error) {
      // Create notifications for mentioned users
      if (mentionedUserIds.length > 0) {
        const notifications = mentionedUserIds.map(uid => ({
            user_id: uid,
            title: 'Fuiste mencionado',
            message: `${user.user_metadata?.full_name || user.email} te mencionó en "${item.name}"`,
            type: 'mention',
            link: `/dashboard?item=${item.id}`
        }));
        await supabase.from('notifications').insert(notifications);
      }

      setNewComment('');
      setMentionedUserIds([]);
      fetchComments(); // Refresh list
    } else {
        alert('Error al publicar comentario');
        console.error(error);
    }
    setIsSubmitting(false);
  };

  const handleTextChange = (text: string) => {
    setNewComment(text);
    
    // Detect @ trigger
    const lastAtIdx = text.lastIndexOf('@');
    if (lastAtIdx !== -1) {
        const textAfterAt = text.slice(lastAtIdx + 1);
        // Ensure no space between @ and cursor
        if (!textAfterAt.includes(' ')) {
            setMentionSearch(textAfterAt);
            return;
        }
    }
    setMentionSearch(null);
  };

  const handleSelectMention = (profile: { id: string, full_name: string }) => {
    const lastAtIdx = newComment.lastIndexOf('@');
    const newText = newComment.slice(0, lastAtIdx) + `@${profile.full_name} ` + newComment.slice(newComment.length);
    setNewComment(newText);
    setMentionedUserIds([...mentionedUserIds, profile.id]);
    setMentionSearch(null);
  };

  const handlePhotoUpload = async () => {
    if (!selectedFile) return;
    
    try {
      await uploadAttachment.mutateAsync({ file: selectedFile, isEvidence: true });
      setNewPhoto(null);
      setSelectedFile(null);
      // Success feedback could go here
    } catch (error) {
      alert('Error al subir evidencia');
      console.error(error);
    }
  };

  const handleUpdateDaily = (dayId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    const newDaily = { ...dailyExecution, [dayId]: numValue };
    onUpdateValue('daily_execution', newDaily);
  };

  return (
    <AnimatePresence>
      {isOpen && item && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20"
            onClick={onClose}
          />
          
          {/* Slide-over Panel */}
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-[600px] bg-white shadow-2xl flex flex-col h-full"
          >
            {/* Header */}
            <div className="flex flex-col border-b border-gray-200">
              <div className="flex items-center justify-between p-4">
                 <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-gray-500" />
                 </button>
                 <div className="flex items-center space-x-2">
                    <button 
                      disabled={isGeneratingPDF}
                      onClick={async () => {
                        setIsGeneratingPDF(true);
                        await generateServerItemPDF(item, columns, evidence);
                        setIsGeneratingPDF(false);
                      }}
                      className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                        isGeneratingPDF 
                        ? 'bg-slate-100 text-slate-400 border-slate-100 cursor-not-allowed' 
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                      title="Exportar PDF Profesional"
                    >
                        {isGeneratingPDF ? (
                          <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                        <span>{isGeneratingPDF ? 'Generando...' : 'Exportar PDF'}</span>
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded text-gray-400">
                        <History className="w-5 h-5" />
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded text-gray-400">
                        <MoreHorizontal className="w-5 h-5" />
                    </button>
                 </div>
              </div>
              
              <div className="px-8 pb-6">
                 <input 
                   type="text" 
                   className="text-2xl font-bold text-[#323338] w-full border-none focus:ring-2 focus:ring-primary p-2 -ml-2 rounded"
                   value={item.name}
                   onChange={(e) => onUpdateGeneric('name', e.target.value)}
                 />
              </div>

              {/* Tabs */}
              <div className="flex px-8 space-x-8">
                 <button 
                   onClick={() => setActiveTab('updates')}
                   className={`flex items-center pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'updates' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                 >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Actualizaciones
                 </button>
                 <button 
                   onClick={() => setActiveTab('details')}
                   className={`flex items-center pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                 >
                    <Info className="w-4 h-4 mr-2" />
                    Detalles
                 </button>
                 <button 
                   onClick={() => setActiveTab('execution')}
                   className={`flex items-center pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'execution' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                 >
                    <Calculator className="w-4 h-4 mr-2" />
                    Ejecución
                 </button>
                 <button 
                   onClick={() => setActiveTab('evidence')}
                   className={`flex items-center pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'evidence' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                 >
                    <Camera className="w-4 h-4 mr-2" />
                    Evidencia
                 </button>
                 <button 
                   onClick={() => setActiveTab('attachments')}
                   className={`flex items-center pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'attachments' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                 >
                    <LinkIcon className="w-4 h-4 mr-2" />
                    Archivos
                 </button>
                 <button 
                   onClick={() => setActiveTab('dependencies')}
                   className={`flex items-center pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'dependencies' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                 >
                    <LinkIcon className="w-4 h-4 mr-2" />
                    Dependencias
                 </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 bg-[#f5f6f8]">
                {activeTab === 'updates' ? (
                 <div className="space-y-6">
                     {/* Update Input Box */}
                     <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm focus-within:ring-2 focus-within:ring-primary transition-all relative">
                        <textarea 
                          placeholder="Escribe una actualización (@mencionar equipo)..."
                          className="w-full resize-none border-none focus:ring-0 text-sm min-h-[100px]"
                          value={newComment}
                          onChange={(e) => handleTextChange(e.target.value)}
                        />
                        
                        {mentionSearch !== null && (
                            <MentionSelector 
                                searchQuery={mentionSearch}
                                onSelect={handleSelectMention}
                                onClose={() => setMentionSearch(null)}
                            />
                        )}

                        <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
                           <button 
                             onClick={handlePostComment}
                             disabled={isSubmitting || !newComment.trim()}
                             className={`bg-primary text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${isSubmitting || !newComment.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#24614b]'}`}
                           >
                              {isSubmitting ? 'Publicando...' : 'Publicar'}
                           </button>
                        </div>
                     </div>

                     {/* Comments List */}
                     <div className="space-y-4 pt-4">
                        {loadingComments ? (
                            <div className="text-center py-4 text-gray-400">Cargando actualizaciones...</div>
                        ) : comments.length > 0 ? (
                            comments.map((comment) => (
                                <div key={comment.id} className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm flex space-x-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                        {/* Mock Initials - in real app fetch user profile */}
                                        U
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-bold text-gray-800">Usuario</span>
                                            <span className="text-xs text-gray-400">
                                                {new Date(comment.created_at).toLocaleString('es-ES', { 
                                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                                                })}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-10">
                                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                                   <MessageSquare className="w-8 h-8 text-gray-400" />
                                </div>
                                <h4 className="text-gray-600 font-medium">No hay actualizaciones todavía</h4>
                                <p className="text-gray-400 text-sm mt-1">Sé el primero en publicar una actualización.</p>
                            </div>
                        )}
                     </div>
                  </div>
                ) : activeTab === 'execution' ? (
                  <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h4 className="text-sm font-bold text-[#323338] mb-4">Registro de Cantidades Diarias</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {Array.from({ length: 7 }, (_, i) => {
                          const d = new Date();
                          d.setDate(d.getDate() + i);
                          const id = d.toISOString().split('T')[0];
                          const label = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
                          return (
                            <div key={id} className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase">{label}</label>
                              <input 
                                type="number"
                                value={dailyExecution[id] || ''}
                                onChange={(e) => handleUpdateDaily(id, e.target.value)}
                                className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                placeholder="0.00"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : activeTab === 'evidence' ? (
                  <div className="space-y-6">
                    {/* Upload Section */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-center">
                      <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 text-primary">
                        <Camera className="w-8 h-8" />
                      </div>
                      <h4 className="text-gray-700 font-bold mb-2">Añadir Evidencia Fotográfica</h4>
                      <p className="text-sm text-gray-500 mb-6">Sube fotos para registrar el avance de la actividad.</p>
                      
                      <div className="flex flex-col items-center space-y-4">
                        <label className="cursor-pointer bg-primary text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-[#24614b] transition-all flex items-center shadow-lg shadow-green-900/10">
                          <ImageIcon className="w-4 h-4 mr-2" />
                          Seleccionar Foto
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
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
                          <div className="mt-4 p-4 border border-dashed border-gray-300 rounded-lg w-full">
                            <div className="relative w-full h-48 mb-4">
                              <Image src={newPhoto} alt="Preview" fill className="object-cover rounded-lg" unoptimized />
                            </div>
                            <div className="flex space-x-2">
                              <button 
                                onClick={handlePhotoUpload}
                                disabled={uploadAttachment.isPending}
                                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center disabled:opacity-50"
                              >
                                {uploadAttachment.isPending ? (
                                  <span className="animate-pulse">Subiendo...</span>
                                ) : (
                                  <><CheckCircle2 className="w-4 h-4 mr-2" /> Confirmar</>
                                )}
                              </button>
                              <button 
                                onClick={() => setNewPhoto(null)}
                                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Gallery Section */}
                    <div className="grid grid-cols-2 gap-4">
                      {evidence.map((ev: any, i: number) => (
                        <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm group relative">
                           <div className="relative w-full h-32">
                             <Image src={ev.url} alt={`Evidence ${i}`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw"/>
                           </div>
                           <div className="p-2 bg-white/90 absolute bottom-0 left-0 right-0 border-t border-gray-100">
                             <p className="text-[10px] text-gray-500 font-medium">
                               {new Date(ev.timestamp).toLocaleString()}
                             </p>
                           </div>
                           <button 
                             onClick={() => {
                               const filtered = evidence.filter((_: any, idx: number) => idx !== i);
                               onUpdateValue('evidence', filtered);
                             }}
                             className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                           >
                             <Trash2 className="w-3 h-3" />
                           </button>
                        </div>
                      ))}
                    </div>

                    {evidence.length === 0 && !newPhoto && (
                      <div className="text-center py-10 opacity-40">
                        <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm font-medium">No hay fotos de evidencia</p>
                      </div>
                    )}
                  </div>
                ) : activeTab === 'attachments' ? (
                   <div className="space-y-6">
                      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-center">
                         <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                           <LinkIcon className="w-8 h-8" />
                         </div>
                         <h4 className="text-gray-700 font-bold mb-2">Adjuntar Archivos</h4>
                         <p className="text-sm text-gray-500 mb-6 px-4">Sube planos, informes o documentos relevantes para esta actividad.</p>
                         
                         <label className="cursor-pointer bg-blue-600 text-white px-8 py-2.5 rounded-full text-sm font-bold hover:bg-blue-700 transition-all flex items-center justify-center mx-auto w-max shadow-lg shadow-blue-900/10">
                           <Plus className="w-4 h-4 mr-2" />
                           Seleccionar Archivo
                           <input 
                             type="file" 
                             className="hidden" 
                             onChange={async (e) => {
                               const file = e.target.files?.[0];
                               if (file) {
                                 try {
                                   await uploadAttachment.mutateAsync({ file });
                                 } catch (err) {
                                   alert('Error al subir archivo');
                                 }
                               }
                             }}
                           />
                         </label>
                         {uploadAttachment.isPending && !newPhoto && (
                             <p className="mt-4 text-[10px] font-black text-blue-600 animate-pulse uppercase tracking-widest">Subiendo adjunto...</p>
                         )}
                      </div>

                      <div className="space-y-3">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Archivos del Item ({attachments?.length || 0})</h4>
                         <div className="grid grid-cols-1 gap-2">
                           {attachments?.map((file) => (
                             <div key={file.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm group hover:border-blue-200 transition-all">
                                <div className="flex items-center gap-4">
                                   <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                      {file.file_type.includes('pdf') ? <FileTextIcon size={20} /> :
                                       file.file_type.includes('image') ? <ImageIcon size={20} /> :
                                       file.file_type.includes('zip') ? <Archive size={20} /> : <FileIcon size={20} />}
                                   </div>
                                   <div className="min-w-0">
                                      <p className="text-sm font-bold text-slate-700 truncate max-w-[200px]">{file.file_name}</p>
                                      <p className="text-[10px] text-slate-400 font-medium italic">
                                         {(file.file_size / 1024 / 1024).toFixed(2)} MB • {new Date(file.created_at).toLocaleDateString()}
                                      </p>
                                   </div>
                                </div>
                                <div className="flex items-center gap-1">
                                   <a 
                                     href={file.file_url} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                   >
                                      <LinkIcon size={16} />
                                   </a>
                                   <button 
                                     onClick={() => deleteAttachment.mutate(file)}
                                     className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                   >
                                      <Trash2 size={16} />
                                   </button>
                                </div>
                             </div>
                           ))}
                           {attachments?.length === 0 && (
                             <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                               <p className="text-sm text-slate-400 font-medium italic">No hay archivos adjuntos</p>
                             </div>
                           )}
                         </div>
                      </div>
                   </div>
                ) : activeTab === 'dependencies' ? (
                   <div className="space-y-6">
                      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                          <h4 className="text-sm font-bold text-[#323338] mb-4">Añadir Predecesor</h4>
                          <div className="relative">
                              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent">
                                  <Search className="w-4 h-4 text-gray-400 ml-3" />
                                  <input 
                                    type="text" 
                                    className="w-full p-2 text-sm outline-none"
                                    placeholder="Buscar tarea para vincular..."
                                    value={searchTerm}
                                    onChange={(e) => searchTasks(e.target.value)}
                                  />
                              </div>
                              {/* Search Results Dropdown */}
                              {searchResults.length > 0 && (
                                  <div className="absolute top-10 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                                      {searchResults.map(res => (
                                          <button 
                                            key={res.id}
                                            onClick={() => addDependency(res.id)}
                                            className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center justify-between group"
                                          >
                                              <span>{res.name}</span>
                                              <Plus className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                                          </button>
                                      ))}
                                  </div>
                              )}
                          </div>
                      </div>

                      <div className="space-y-3">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Dependencias Actuales</h4>
                          {dependencies.length === 0 ? (
                              <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                  <LinkIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                  <p className="text-sm text-gray-500">Esta tarea no tiene dependencias.</p>
                              </div>
                          ) : (
                              dependencies.map(dep => {
                                  const isPredecessor = dep.target_item_id === item?.id;
                                  const otherItem = isPredecessor ? dep.source_item : dep.target_item;
                                  
                                  return (
                                      <div key={dep.id} className="bg-white p-3 rounded-lg border border-gray-200 flex items-center justify-between shadow-sm">
                                          <div className="flex items-center">
                                              <div className={`p-1.5 rounded-md mr-3 ${isPredecessor ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                                  {isPredecessor ? <History className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                                              </div>
                                              <div>
                                                  <div className="text-sm font-bold text-gray-700">{otherItem?.name || 'Tarea desconocida'}</div>
                                                  <div className="text-xs text-gray-400">
                                                      {isPredecessor ? 'Bloquea a esta tarea' : 'Es bloqueada por esta tarea'}
                                                  </div>
                                              </div>
                                          </div>
                                          <button 
                                            onClick={() => removeDependency(dep.id)}
                                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                          >
                                              <Trash2 className="w-4 h-4" />
                                          </button>
                                      </div>
                                  );
                              })
                          )}
                      </div>
                   </div> 
                ) : (
                 <div className="space-y-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="grid grid-cols-[120px_1fr] gap-4 items-center">
                       <div className="flex items-center text-sm text-gray-500">
                          <User className="w-4 h-4 mr-2" /> Persona
                       </div>
                       <div className="flex items-center">
                          <div className="w-6 h-6 rounded-full bg-[#a25ddc] flex items-center justify-center text-white text-[10px] mr-2">
                            {String(person).charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-gray-700">{person}</span>
                       </div>
                       
                       <div className="flex items-center text-sm text-gray-500">
                          <Tag className="w-4 h-4 mr-2" /> Estado
                       </div>
                       <div>
                          <span className="text-xs px-3 py-1 rounded-full text-white font-medium" style={{ backgroundColor: status === 'Done' ? '#00c875' : status === 'Stuck' ? '#e2445c' : status === 'Not Started' ? '#c4c4c4' : '#fdab3d' }}>
                             {status}
                          </span>
                       </div>

                       <div className="flex items-center text-sm text-gray-500">
                          <Calendar className="w-4 h-4 mr-2" /> Fecha
                       </div>
                       <div>
                          <input 
                            type="date"
                            value={date && !date.includes('/') ? date : ''}
                            onChange={(e) => onUpdateValue('date', e.target.value)}
                            className="text-sm text-gray-700 bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 -ml-1"
                          />
                          {(date && date.includes('/')) && <span className="text-xs text-gray-400 ml-2 italic">{date}</span>}
                       </div>
                    </div>

                    <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                       <h4 className="text-sm font-bold text-[#323338]">Acciones</h4>
                       <button 
                         onClick={() => {
                             onClose();
                             onDeleteItem(item.id);
                         }}
                         className="flex items-center text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded transition-all border border-red-100"
                       >
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar Actividad
                       </button>
                    </div>

                    <div className="pt-6 border-t border-gray-100">
                       <h4 className="text-sm font-bold text-[#323338] mb-3">Descripción</h4>
                       <textarea 
                         className="w-full min-h-[120px] bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:bg-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                         placeholder="Añade una descripción más detallada sobre esta tarea..."
                         value={item.description || ''}
                         onChange={(e) => onUpdateGeneric('description', e.target.value)}
                       />
                    </div>
                 </div>
               )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
