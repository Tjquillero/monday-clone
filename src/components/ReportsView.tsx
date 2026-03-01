'use client';

import { Group, Item, Incident, Column } from '@/types/monday';
import { motion } from 'framer-motion';
import { FileText, Download, Filter, Calendar, Loader2, Database, Trash2, CheckCircle2, Clock, MapPin, AlertTriangle } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { generateExecutivePDF, generateNewsPDF } from '@/lib/serverReports';
import { ExecutiveReportItem, ExecutiveLocation } from '@/components/reports/ExecutiveReportTemplate';
import { supabase } from '@/lib/supabaseClient';


interface ReportsViewProps {
  groups: Group[];
  columns: Column[];
  boardName: string;
  boardId?: string;
}

interface Evidence {
  id: string;
  itemName: string;
  siteName: string;
  date: string;
  jornales: number;
  rend: number;
  photo: string;
  unit: string;
  isGeneral?: boolean;
}

interface IncomingIncident {
  id: string;
  created_at: string;
  description: string;
  type: string;
  severity: string;
  photos: string[];
  group_id: string;
  solution?: string;
}

export default function ReportsView({ groups, columns, boardName, boardId }: ReportsViewProps) {
  const [filter, setFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'evidence' | 'incidents'>('evidence');
  const [isGenerating, setIsGenerating] = useState(false);
  const [siteIncidents, setSiteIncidents] = useState<IncomingIncident[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);
  const [solutionText, setSolutionText] = useState('');
  const [isSavingSolution, setIsSavingSolution] = useState(false);

  // Fetch Site Incidents (Novedades)
  useEffect(() => {
    if (boardId) {
       const fetchIncidents = async () => {
          const { data } = await supabase
            .from('site_incidents')
            .select('*')
            .eq('board_id', boardId)
            .order('created_at', { ascending: false });
          
          if (data) setSiteIncidents(data as IncomingIncident[]);
       };
       fetchIncidents();
    }
  }, [boardId, refreshTrigger]);

  // Data aggregation for the New Executive Report (Item -> Sites -> Photos)
  const reportItems: ExecutiveReportItem[] = useMemo(() => {
    const itemsMap = new Map<string, ExecutiveReportItem>();
    
    // Find the "Item" or "Code" column
    const itemColumn = columns.find(c => /^(item|no\.|c[oó]digo)$/i.test(c.title));

    groups.forEach(group => {
      group.items.forEach(item => {
        // We only care about items that have execution data (val > 0) or photos
        let hasExecution = false;
        const photos: string[] = [];
        let totalVal = 0;

        const dailyExecution = item.values['daily_execution'] || {};
        
        Object.entries(dailyExecution).forEach(([dateId, details]: [string, any]) => {
          if (details) {
            const isObject = typeof details === 'object';
            const val = isObject ? (details.val || 0) : (parseFloat(details) || 0);
            const photo = isObject ? details.photo : null;
            
            if (val > 0) {
              totalVal += val;
              hasExecution = true;
            }
            if (photo) {
              photos.push(photo);
              hasExecution = true;
            }
          }
        });

        // ALSO check for General Verification Photo
        const generalPhoto = item.values['verification_photo'];
        if (generalPhoto) {
          photos.push(generalPhoto);
          hasExecution = true;
        }

        if (hasExecution) {
          if (!itemsMap.has(String(item.id))) {
             // Determine Code: Priority 1: Column Value, Priority 2: Name Prefix, Priority 3: Fallback
             let itemCode = '';
             if (itemColumn) {
                itemCode = item.values[itemColumn.id] || '';
             }
             if (!itemCode) {
                const match = item.name.match(/^(\d+(\.\d+)*)/);
                itemCode = match ? match[0] : '';
             }
             if (!itemCode) {
                itemCode = String(item.id).slice(0, 4);
             }

             itemsMap.set(String(item.id), {
               id: String(item.id),
               code: itemCode,
               name: item.name.replace(/^(\d+(\.\d+)*)\.?\s*/, ''), // Remove code from name if present
               description: item.description || '',
               unit: item.values['unit'] || 'UND',
               locations: []
             });
          }

          const reportItem = itemsMap.get(String(item.id))!;
          
          // Add location data
          reportItem.locations.push({
            id: group.id,
            name: group.title,
            quantity: totalVal,
            photos: photos
          });
        }
      });
    });

    return Array.from(itemsMap.values());
  }, [groups, columns]);

  // Legacy flat aggregation for the UI Grid (Photos only)
  const { evidenceData, incidentsData } = useMemo(() => {
    const evidence: Evidence[] = [];
    const incidents: Incident[] = [];
    
    groups.forEach(group => {
      group.items.forEach(item => {
        const dailyExecution = item.values['daily_execution'] || {};
        Object.entries(dailyExecution).forEach(([dateId, details]: [string, any]) => {
          if (details) {
            const isObject = typeof details === 'object';
            const isDone = isObject ? details.done : true; 
            const photo = isObject ? details.photo : null;
            let val = isObject ? (details.val || 0) : (parseFloat(details) || 0);
            const cant = parseFloat(item.values['cant']) || 0;
            const rend = parseFloat(item.values['rend']) || 0;
            const dailyJor = rend > 0 ? (cant / rend) : 0;
            if (dailyJor > 0 && val > dailyJor * 1.5) val = 0;
            
            
            // Allow evidence if verification is done and there is a photo OR value
            // RELAXED RULE: If there is a photo, show it regardless of status
            if (photo) {
              evidence.push({
                id: `${item.id}-${dateId}`,
                itemName: item.name,
                siteName: group.title,
                date: dateId,
                jornales: val,
                rend: rend,
                photo: photo,
                unit: item.values['unit'] || 'M2'
              });
            }
          }
        });

        // NEW: Check for General Verification Photo (Column 'VERIF')
        const generalPhoto = item.values['verification_photo'];
        if (generalPhoto) {
             evidence.push({
                id: `${item.id}-general`,
                itemName: item.name,
                siteName: group.title,
                // Use today's date or a generic label since general verification doesn't have a dateId
                date: new Date().toISOString().split('T')[0], 
                jornales: parseFloat(item.values['cant']) || 0, // Assume full quantity for general verification?
                rend: parseFloat(item.values['rend']) || 0,
                photo: generalPhoto,
                unit: item.values['unit'] || 'M2',
                isGeneral: true // Marker for UI if needed
             });
        }

        const itemIncidents = item.values['incidents'] || [];
        itemIncidents.forEach((inc: Incident) => {
           incidents.push({
             ...inc,
             itemId: item.id,
             itemName: item.name,
             siteName: group.title,
             siteColor: group.color
           });
        });
      });
    });

    // Merge Site Incidents
    siteIncidents.forEach(si => {
        // Find group title
        const group = groups.find(g => g.id === si.group_id);
        const siteName = group ? group.title : 'Sitio General';
        const siteColor = group ? group.color : '#579bfc';

        // Flatten photos if any
        if (si.photos && si.photos.length > 0) {
           si.photos.forEach((photo, idx) => {
               incidents.push({
                   id: `${si.id}-${idx}`,
                   type: si.type || 'General',
                   description: si.description,
                   severity: (si.severity as any) || 'Low',
                   photo: photo,
                   date: si.created_at,
                   itemId: 'SITE-INCIDENT',
                   itemName: 'Novedad de Obra',
                   siteName,
                   siteColor,
                   solution: si.solution,
                   dbId: si.id
               });
           });
        } else {
             // Entry without photo
             incidents.push({
                   id: si.id,
                   type: si.type || 'General',
                   description: si.description,
                   severity: (si.severity as any) || 'Low',
                   date: si.created_at,
                   itemId: 'SITE-INCIDENT',
                   itemName: 'Novedad de Obra',
                   siteName,
                   siteColor,
                   solution: si.solution,
                   dbId: si.id
               });
        }
    });

    return {
      evidenceData: evidence.sort((a, b) => b.date.localeCompare(a.date)),
      incidentsData: incidents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    };
  }, [groups, siteIncidents]);



  const handleGenerateNewsPdf = async () => {
    if (!incidentsData || incidentsData.length === 0) {
      alert('No hay incidencias reportadas para generar el reporte.');
      return;
    }

    setIsGenerating(true);
    try {
      // Transform data to match NewsReportItem interface
      const newsItems = incidentsData.map((inc: any) => ({
        id: inc.id,
        date: inc.date,
        severity: inc.severity,
        type: inc.type,
        itemName: inc.itemName,
        siteName: inc.siteName,
        description: inc.description,
        photo: inc.photo,
        solution: inc.solution
      }));

      await generateNewsPDF(boardName, newsItems);
    } catch (error) {
       console.error('Error in handleGenerateNewsPdf', error);
       alert('Error al invocar la generación del reporte de novedades.');
    } finally {
       setIsGenerating(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!reportItems || reportItems.length === 0) {
      alert('No hay datos o evidencia para generar el reporte.');
      return;
    }
    
    // Debug: Check data before sending
    console.log('Generating PDF with items:', reportItems);
    // alert(`Generando reporte con ${reportItems.length} ítems y ${reportItems.reduce((acc, i) => acc + i.locations.length, 0)} ubicaciones.`);

    setIsGenerating(true);
    try {
      // Use the new structured data
      await generateExecutivePDF(boardName, reportItems);
    } catch (error) {
      console.error('Error in handleGeneratePdf', error);
      alert('Error al invocar la generación del PDF. Revise la consola.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveSolution = async (dbId: string) => {
    if (!dbId || !solutionText.trim()) return;

    setIsSavingSolution(true);
    try {
      const { error } = await supabase
        .from('site_incidents')
        .update({ solution: solutionText })
        .eq('id', dbId);

      if (error) throw error;

      setEditingIncidentId(null);
      setSolutionText('');
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error saving solution:', error);
      alert('Error al guardar la solución administrativa.');
    } finally {
      setIsSavingSolution(false);
    }
  };

  const totalJornales = evidenceData.reduce((sum, entry) => sum + entry.jornales, 0);
  const criticalIncidents = incidentsData.filter((i: any) => i.severity === 'Critical').length;

  if (evidenceData.length === 0 && incidentsData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] bg-white rounded-3xl border-2 border-dashed border-gray-100 p-12 text-center">
         <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center text-gray-300 mb-6">
            <FileText className="w-10 h-10" />
         </div>
         <h3 className="text-xl font-black text-gray-800 mb-2">Sin datos de reportes</h3>
         <p className="text-gray-400 max-w-md mx-auto">Comienza a verificar actividades o reportar incidencias en la vista de Ejecución para generar informes.</p>
      </div>
    );
  }


  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6 md:space-y-10 bg-[#f8fafc] min-h-full font-sans pb-20">
      <div className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] shadow-xl shadow-blue-900/5 border border-white">
        <div className="flex flex-col md:flex-row md:items-end justify-between space-y-6 md:space-y-0 mb-8">
           <div className="space-y-2">
              <div className="flex items-center space-x-3 mb-2">
                 <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-green-900/20">
                    <FileText className="w-6 h-6" />
                 </div>
                 <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Reporte Ejecutivo</h1>
                    <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">Evidencia de Campo e Incidencias</p>
                 </div>
              </div>
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                 <button 
                   onClick={() => setActiveTab('evidence')}
                   className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'evidence' ? 'bg-primary text-white shadow-lg shadow-green-900/20' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                 >
                   Evidencia ({evidenceData.length})
                 </button>
                 <button 
                   onClick={() => setActiveTab('incidents')}
                   className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'incidents' ? 'bg-[#e2445c] text-white shadow-lg shadow-red-900/20' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                 >
                   Incidencias ({incidentsData.length})
                 </button>
              </div>
           </div>

           <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-3">
              {activeTab === 'evidence' ? (
                <div className="hidden md:flex bg-green-50 border border-green-100 px-6 py-3 rounded-2xl flex-col items-center mr-4">
                   <span className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Jornales</span>
                   <span className="text-2xl font-black text-primary">{totalJornales.toFixed(2)}</span>
                </div>
              ) : (
                 <div className="hidden md:flex bg-red-50 border border-red-100 px-6 py-3 rounded-2xl flex-col items-center mr-4">
                   <span className="text-[10px] font-black text-[#e2445c] uppercase tracking-widest mb-1">Críticas</span>
                   <span className="text-2xl font-black text-[#e2445c]">{criticalIncidents}</span>
                </div>
              )}
              
              <div className="flex flex-col space-y-2">
                {activeTab === 'evidence' ? (
                   <button 
                       onClick={handleGeneratePdf} 
                       disabled={isGenerating}
                       className="flex items-center justify-center px-6 py-3 bg-gray-900 text-white rounded-2xl font-bold text-sm hover:bg-gray-800 transition-all shadow-lg active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed w-full md:w-auto"
                   >
                       {isGenerating ? (
                       <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                       ) : (
                       <Download className="w-4 h-4 mr-2" />
                       )}
                       {isGenerating ? 'Generando...' : 'Descargar Reporte Ejecutivo'}
                   </button>
                ) : (
                   <button 
                       onClick={handleGenerateNewsPdf} 
                       disabled={isGenerating}
                       className="flex items-center justify-center px-6 py-3 bg-[#e2445c] text-white rounded-2xl font-bold text-sm hover:bg-[#c93b51] transition-all shadow-lg active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed w-full md:w-auto"
                   >
                       {isGenerating ? (
                       <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                       ) : (
                       <Download className="w-4 h-4 mr-2" />
                       )}
                       {isGenerating ? 'Generando...' : 'Descargar Reporte de Novedades'}
                   </button>
                )}
              </div>
           </div>
        </div>
      </div>

      {/* Grid of Content */}
      {activeTab === 'evidence' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {evidenceData.map((entry, idx) => (
            <motion.div 
              key={entry.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="group bg-white rounded-[2rem] overflow-hidden shadow-xl shadow-gray-200/50 border border-gray-100 flex flex-col hover:shadow-2xl hover:shadow-green-900/10 transition-all duration-500"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                 <Image 
                   src={entry.photo} 
                   alt={entry.itemName} 
                   fill
                   className="object-cover transition-transform duration-700 group-hover:scale-110"
                   sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                 />
                 <div className="absolute top-4 right-4 bg-primary text-white px-3 py-1.5 rounded-xl font-black text-[10px] shadow-lg flex items-center">
                    <CheckCircle2 className="w-3 h-3 mr-1.5" /> VERIFICADO
                 </div>
                 <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                    <div className="flex items-center text-white/90 text-xs font-bold space-x-3">
                       <span className="flex items-center"><Calendar className="w-3 h-3 mr-1.5 text-green-400" /> {new Date(entry.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                       <span className="flex items-center"><Clock className="w-3 h-3 mr-1.5 text-green-400" /> Hoy</span>
                    </div>
                 </div>
              </div>
              <div className="p-7 space-y-4 flex-1 flex flex-col">
                 <div>
                    <h4 className="text-lg font-black text-gray-900 leading-tight group-hover:text-primary transition-colors">{entry.itemName}</h4>
                    <div className="flex items-center text-xs font-bold text-gray-400 mt-2 uppercase tracking-wider">
                       <MapPin className="w-3 h-3 mr-1.5 text-blue-400" /> {entry.siteName}
                    </div>
                 </div>
                 <div className="pt-4 border-t border-gray-50 mt-auto">
                    <div className="flex items-center justify-between">
                       <div className="flex flex-col">
                          <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Esfuerzo</span>
                          <span className="text-sm font-black text-gray-700">{entry.jornales.toFixed(2)} <span className="text-[10px] text-gray-400">JORNALES</span></span>
                          {entry.rend > 0 && (
                            <span className="text-[10px] font-bold text-gray-400">
                               ≈ {Math.round(entry.jornales * entry.rend).toLocaleString()} {entry.unit}
                            </span>
                          )}
                       </div>
                       <div className="flex flex-col items-end">
                          <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Unidad</span>
                          <span className="text-sm font-black text-primary">{entry.unit}</span>
                       </div>
                    </div>
                 </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {activeTab === 'incidents' && (
         <div className="space-y-4">
            {incidentsData.map((incident: any, idx: number) => (
               <motion.div 
                 key={incident.id}
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: idx * 0.05 }}
                 className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start space-x-6 hover:shadow-md transition-shadow"
               >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${incident.severity === 'Critical' ? 'bg-red-50 text-red-500' : 'bg-orange-50 text-orange-500'}`}>
                     <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="flex-1 space-y-2">
                     <div className="flex items-center justify-between">
                        <h4 className="text-lg font-bold text-gray-900">{incident.itemName}</h4>
                        <span className="text-xs font-bold text-gray-400">{new Date(incident.date).toLocaleDateString('es-ES')}</span>
                     </div>
                     <div className="flex items-center space-x-3 text-xs font-bold uppercase tracking-wider">
                        <span className={`px-2 py-1 rounded-lg ${incident.severity === 'Critical' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                           {incident.severity}
                        </span>
                        <span className="text-gray-400 flex items-center">
                           <MapPin className="w-3 h-3 mr-1" /> {incident.siteName}
                        </span>
                        <span className="text-blue-500 bg-blue-50 px-2 py-1 rounded-lg">
                           {incident.type}
                        </span>
                     </div>
                     <p className="text-gray-600 text-sm leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100">
                        {incident.description}
                     </p>

                     {/* Solution Box */}
                     <div className="mt-4 pt-2">
                        {editingIncidentId === incident.dbId ? (
                           <div className="space-y-3 bg-green-50 p-4 rounded-xl border border-green-100">
                              <h5 className="text-xs font-black text-green-700 uppercase tracking-widest">Respuesta Administrativa</h5>
                              <textarea
                                 value={solutionText}
                                 onChange={(e) => setSolutionText(e.target.value)}
                                 className="w-full p-3 rounded-lg border border-green-200 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                 placeholder="Escriba la solución o respuesta..."
                                 rows={3}
                              />
                              <div className="flex justify-end space-x-2">
                                 <button 
                                    onClick={() => setEditingIncidentId(null)}
                                    className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg"
                                    disabled={isSavingSolution}
                                 >
                                    Cancelar
                                 </button>
                                 <button 
                                    onClick={() => incident.dbId && handleSaveSolution(incident.dbId)}
                                    className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm flex items-center"
                                    disabled={isSavingSolution}
                                 >
                                    {isSavingSolution && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                                    Guardar
                                 </button>
                              </div>
                           </div>
                        ) : (
                           <>
                              {incident.solution ? (
                                 <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                                    <div className="flex justify-between items-start mb-2">
                                       <h5 className="text-xs font-black text-green-700 uppercase tracking-widest flex items-center">
                                          <CheckCircle2 className="w-3 h-3 mr-1.5" /> Solución / Respuesta
                                       </h5>
                                       <button 
                                          onClick={() => {
                                             if (incident.dbId) {
                                                setEditingIncidentId(incident.dbId);
                                                setSolutionText(incident.solution || '');
                                             }
                                          }}
                                          className="text-[10px] font-bold text-green-600 hover:text-green-800 underline uppercase"
                                       >
                                          Editar
                                       </button>
                                    </div>
                                    <p className="text-sm text-green-800 font-medium">
                                       {incident.solution}
                                    </p>
                                 </div>
                              ) : (
                                  incident.dbId && (
                                    <button 
                                       onClick={() => {
                                          setEditingIncidentId(incident.dbId);
                                          setSolutionText('');
                                       }}
                                       className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:border-green-300 hover:text-green-600 hover:bg-green-50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                                    >
                                       + Agregar Respuesta Administrativa
                                    </button>
                                  )
                              )}
                           </>
                        )}
                     </div>

                  </div>
                  {incident.photo && (
                     <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100 bg-gray-50">
                        <div className="relative w-full h-full">
                           <Image src={incident.photo} alt="Evidencia" fill className="object-cover cursor-zoom-in" sizes="96px" />
                        </div>
                     </div>
                  )}
               </motion.div>
            ))}
         </div>
      )}
    </div>
  );
}