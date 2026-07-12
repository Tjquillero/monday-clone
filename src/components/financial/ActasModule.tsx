'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Group, Item, Acta } from '@/types/monday';
import { useActas, useActaDetails, useActaMutations, useActaDetailsByBoard } from '@/hooks/useActas';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Calendar, FileText, ChevronRight, Check, Maximize2, Minimize2, Eraser } from 'lucide-react';
import { useBoardMutations } from '@/hooks/useBoardMutations';
import { useUI } from '@/contexts/UIContext';
import dynamic from 'next/dynamic';

const ActasHotTable = dynamic(() => import('./ActasHotTable'), { ssr: false });

import { motion } from 'framer-motion';

import { MatrixQtyInput } from './ActasModuleComponents';

interface ActasModuleProps {
    groups: Group[];
    boardId?: string;
    onAddSite?: () => void;
}



export default function ActasModule({ groups, boardId, onAddSite }: ActasModuleProps) {
    const queryClient = useQueryClient();
    const { data: actas, isLoading: actasLoading } = useActas(boardId);
    const { createActa, updateActa, deleteActa, upsertActaDetail } = useActaMutations(boardId);
    const { addItem, updateItem, deleteItem } = useBoardMutations(boardId);
    
    const [selectedActaId, setSelectedActaId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newActaName, setNewActaName] = useState('');
    
    // Derived state for the selected acta
    const selectedActa = actas?.find(a => a.id === selectedActaId);

    const handleCreateActa = async () => {
        if (!newActaName.trim() || !boardId) return;
        try {
            await createActa.mutateAsync({
                board_id: boardId,
                name: newActaName,
                date: new Date().toISOString().split('T')[0],
                status: 'draft'
            });
            setIsCreating(false);
            setNewActaName('');
        } catch (error) {
            console.error('Error creating acta:', error);
            alert('Error al crear el acta.');
        }
    };

    const handleOpenCreate = () => {
        let nextName = `ACTA 1 - ${new Date().getFullYear()}`;
        if (actas && actas.length > 0) {
            // Actas are ordered by date desc, so the first one is likely the latest number
            const lastActa = actas[0];
            const match = lastActa.name.match(/ACTA\s+(\d+)/i);
            if (match && match[1]) {
                const nextNum = parseInt(match[1]) + 1;
                nextName = `ACTA ${nextNum} - ${new Date().getFullYear()}`;
            } else {
                 // Fallback if regex fails but we have actas
                 nextName = `ACTA ${actas.length + 1} - ${new Date().getFullYear()}`;
            }
        }
        setNewActaName(nextName);
        setIsCreating(true);
    };

    if (selectedActaId && selectedActa) {
        return (
            <ActaDetailView 
                acta={selectedActa} 
                groups={groups} 
                onBack={() => setSelectedActaId(null)}
                handleUpdateItemValue={async (groupId, itemId, columnId, value) => {
                    updateItem.mutate({ itemId, updates: { [columnId]: value }, isValuesUpdate: true });
                }}
                onAddResource={() => {
                    addItem.mutate({
                        groupId: groups[0]?.id,
                        name: 'Nueva Actividad',
                        initialValues: { item_type: 'financial', unit: 'UND', unit_price: 0, cant: 0 }
                    });
                }}
                onDeleteResource={(itemId) => {
                    if (window.confirm('¿Eliminar actividad? This will remove it from all sites.')) {
                        deleteItem.mutate(itemId);
                    }
                }}
                onAddSite={onAddSite}
            />
        );
    }

    return (
        <div className="p-6 bg-white rounded-[2rem] shadow-sm min-h-[600px]">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">Actas de Obra</h2>
                    <p className="text-slate-500 font-medium">Gestión de cortes de obra y facturación</p>
                </div>
                <div className="flex gap-4">
                    <button 
                        onClick={onAddSite}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <Plus size={18} /> Agregar Sitio
                    </button>
                    <button 
                        onClick={handleOpenCreate}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
                    >
                        <Plus size={18} /> Nueva Acta
                    </button>
                </div>
            </div>

            {isCreating && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-4">
                        <input 
                            type="text" 
                            placeholder="Nombre del Acta (Ej: Acta 31 - Diciembre 2025)" 
                            value={newActaName}
                            onChange={(e) => setNewActaName(e.target.value)}
                            className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            autoFocus
                        />
                        <button onClick={handleCreateActa} className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-colors">Crear</button>
                        <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button>
                    </div>
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {actasLoading ? (
                    <div className="col-span-full py-12 text-center text-slate-400">Cargando actas...</div>
                ) : actas?.length === 0 ? (
                     <div className="col-span-full py-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
                        <FileText size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No hay actas registradas.</p>
                     </div>
                ) : (
                    actas?.map(acta => (
                        <motion.div 
                            key={acta.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.02 }}
                            onClick={() => setSelectedActaId(acta.id)}
                            className="group relative bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all cursor-pointer overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronRight className="text-blue-500" />
                            </div>
                            
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                                    <FileText size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg leading-tight">{acta.name}</h3>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        acta.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                                        acta.status === 'paid' ? 'bg-purple-100 text-purple-800' :
                                        'bg-slate-100 text-slate-600'
                                    }`}>
                                        {acta.status === 'draft' ? 'Borrador' : acta.status === 'approved' ? 'Facturada' : 'Pagada'}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <Calendar size={14} />
                                    <span>{new Date(acta.date).toLocaleDateString()}</span>
                                </div>
                                {/* Future: Show total amount here */}
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}


function ActaDetailView({ 
    acta, 
    groups, 
    onBack, 
    handleUpdateItemValue, 
    onAddResource,
    onDeleteResource,
    onAddSite
}: { 
    acta: Acta, 
    groups: Group[], 
    onBack: () => void,
    handleUpdateItemValue: (groupId: string, itemId: string | number, columnId: string, value: any) => void,
    onAddResource: () => void,
    onDeleteResource: (itemId: string | number) => void,
    onAddSite?: () => void
}) {
    const { data: details, isLoading: detailsLoading } = useActaDetails(acta.id);
    const { data: allActas } = useActas(acta.board_id.toString());
    const { data: allBoardDetails } = useActaDetailsByBoard(acta.board_id.toString());
    const { upsertActaDetail, updateActa, deleteActaDetail } = useActaMutations(acta.board_id.toString());
    const { deleteItem, updateItem } = useBoardMutations(acta.board_id.toString());
    
    const { sidebarOpen, setSidebarOpen } = useUI();
    const [viewMode, setViewMode] = useState<'matrix' | 'detailed'>('detailed'); 
    const [selectedSiteId, setSelectedSiteId] = useState<string>('all');
    const [isCanvasMode, setIsCanvasMode] = useState(false);
    const [headerCollapsed, setHeaderCollapsed] = useState(false);

    // Auto-collapse sidebar when viewing an Acta
    useEffect(() => {
        setSidebarOpen(false);
    }, [setSidebarOpen]);

    const filteredGroups = useMemo(() => {
        if (!groups) return [];
        return groups.filter(g => !g.title.toUpperCase().includes('PRESUPUESTO GENERAL'));
    }, [groups]);

    // selectedSiteId is allowed to remain 'all' to support global operations

    // Filter Previous Actas: Date < Current Acta Date AND Status = Approved (or Paid)
    // If current acta is draft, we take everything before. 
    // If current acta is approved, we technically shouldn't be editing it, but logic stands.
    const previousActasIds = useMemo(() => {
        if (!allActas) return [];
        const currentDate = new Date(acta.date);
        return allActas
            .filter(a => {
                const aDate = new Date(a.date);
                // Strict less than date, or same date but created before? 
                // Creating multiple actas on same day might be edge case. 
                // Ideally default to strict date < date.
                return aDate < currentDate && (a.status === 'approved' || a.status === 'paid');
            })
            .map(a => a.id);
    }, [allActas, acta.date]);

    // 1. Prepare Data: Consolidate unique items across all groups (budget reference)
    const tableData = useMemo(() => {
        const extractCode = (i: Item) => {
            if (i.values.code) return String(i.values.code).trim();
            const match = i.name.match(/^NP\s*([0-9.]+)/i);
            if (match) return `NP ${match[1]}`.trim();
            if (/^NP\s*$/i.test(i.name)) return 'NP';
            return null;
        };

        const isWorkActivity = (i: Item) => {
            const rubro = String(i.values?.rubro || '').toUpperCase();
            if (i.values?.item_type === 'activity') return false;
            if (rubro === 'INSUMOS' || rubro === 'COSTOS') return false;
            
            const code = extractCode(i);
            if (!code) return false;
            return /^\d/.test(code) || /^NP/i.test(code);
        };

        const uniqueItemsMap = new Map<string, any>();
        
        (groups || []).forEach(g => {
            g.items.forEach(i => {
                if (isWorkActivity(i)) {
                    const extractedCode = extractCode(i);
                    const cleanName = i.name.replace(/^NP\s*[0-9.]+\s*-\s*/i, '')
                                          .replace(/^NP\s*[0-9.]+\s*/i, '')
                                          .replace(/^[0-9.]+\s*-\s*/i, '')
                                          .replace(/^[0-9.]+\s*/i, '')
                                          .trim();
                    
                    const existing = uniqueItemsMap.get(cleanName);
                    const qty = parseFloat(i.values?.cant || 0);
                    
                    if (existing) {
                        const currentQty = parseFloat(existing.values.cant || 0);
                        existing.values.cant = (currentQty + qty).toString();
                        if (!existing.allGroupIds.includes(g.id)) {
                            existing.allGroupIds.push(g.id);
                        }
                    } else {
                        uniqueItemsMap.set(cleanName, {
                            ...i,
                            cleanName,
                            code: extractedCode,
                            originalName: i.name,
                            groupId: g.id,
                            groupName: g.title,
                            allGroupIds: [g.id],
                            values: { ...i.values }
                        });
                    }
                }
            });
        });

        const sortedItems = Array.from(uniqueItemsMap.values()).sort((a, b) => {
            const isNumA = /^\d/.test(a.code);
            const isNumB = /^\d/.test(b.code);
            
            if (isNumA && !isNumB) return -1;
            if (!isNumA && isNumB) return 1;
            
            const parseCodeSegments = (c: string) => {
                const parts = (c || '').replace(/NP\s*/i, '').replace(/,/g, '.').split('.');
                return parts.map(p => {
                    const n = Number(p);
                    return isNaN(n) ? p : n;
                });
            };

            const segmentsA = parseCodeSegments(a.code);
            const segmentsB = parseCodeSegments(b.code);
            
            for (let i = 0; i < Math.max(segmentsA.length, segmentsB.length); i++) {
                const segA = segmentsA[i];
                const segB = segmentsB[i];
                
                if (segA === undefined) return -1;
                if (segB === undefined) return 1;
                
                if (typeof segA === 'number' && typeof segB === 'number') {
                    if (segA !== segB) return segA - segB;
                } else {
                    const strA = String(segA);
                    const strB = String(segB);
                    if (strA !== strB) return strA.localeCompare(strB);
                }
            }
            return 0;
        });

        const normName = (s: string) => (s || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        // --- PERFORMANCE OPTIMIZATION: Precompute Lookups ---
        const itemOriginalNameById = new Map<string, string>();
        const itemNormNameById = new Map<string, string>();
        const relevantGroupIdsFiltered = new Set<string>();
        let generalGroupId: string | undefined;
        
        (groups || []).forEach(g => {
            if (g.title.toUpperCase() === 'PRESUPUESTO GENERAL') {
                generalGroupId = g.id;
            }
            g.items.forEach(i => {
                const idStr = String(i.id);
                itemOriginalNameById.set(idStr, i.name);
                itemNormNameById.set(idStr, normName(i.name));
            });
            if ((selectedSiteId === 'all' || g.id === selectedSiteId) && g.title.toUpperCase() !== 'PRESUPUESTO GENERAL') {
                relevantGroupIdsFiltered.add(g.id);
            }
        });

        if (generalGroupId) relevantGroupIdsFiltered.add(generalGroupId);

        const previousActasIdsSet = new Set(previousActasIds);
        const detailsByNormTarget = new Map<string, any[]>();
        const prevDetailsByNormTarget = new Map<string, any[]>();

        if (details && details.length > 0) {
            details.forEach(d => {
                const normTarget = itemNormNameById.get(String(d.item_id)) || String(d.item_id);
                if (!detailsByNormTarget.has(normTarget)) detailsByNormTarget.set(normTarget, []);
                detailsByNormTarget.get(normTarget)!.push(d);

                if (relevantGroupIdsFiltered.has(d.group_id)) {
                     const siteKey = `site|${normTarget}`;
                     if (!detailsByNormTarget.has(siteKey)) detailsByNormTarget.set(siteKey, []);
                     detailsByNormTarget.get(siteKey)!.push(d);
                }
            });
        }

        if (allBoardDetails && previousActasIdsSet.size > 0) {
            allBoardDetails.forEach(d => {
                if (relevantGroupIdsFiltered.has(d.group_id) && previousActasIdsSet.has(d.acta_id)) {
                    const normTarget = itemNormNameById.get(String(d.item_id)) || String(d.item_id);
                    if (!prevDetailsByNormTarget.has(normTarget)) prevDetailsByNormTarget.set(normTarget, []);
                    prevDetailsByNormTarget.get(normTarget)!.push(d);
                }
            });
        }

        return sortedItems.map(item => {
            const targetNorm = normName(item.originalName);
            const unitPrice = item.values?.unit_price || 0;
            const budgetQty = parseFloat(item.values?.cant || 0);
            const budgetTotal = unitPrice * budgetQty;

             let currentQty = 0;
             let currentValue = 0;
             let manualPrevQty = 0;
             let manualPrevVal = 0;
             let hasManualPrev = false;
             
             if (details) {
                 const siteKey = `site|${targetNorm}`;
                 const siteFallbackKey = `site|${String(item.id)}`;
                 const relevantDetails = [...(detailsByNormTarget.get(siteKey) || []), ...(detailsByNormTarget.get(siteFallbackKey) || [])];
                 
                 currentQty = relevantDetails.reduce((sum, d) => sum + (d.quantity || 0), 0);
                 currentValue = relevantDetails.reduce((sum, d) => sum + (d.value || 0), 0);

                relevantDetails.forEach(d => {
                    if (d.previous_qty !== undefined && d.previous_qty !== null) {
                        manualPrevQty = d.previous_qty;
                        manualPrevVal = d.previous_value || 0;
                        hasManualPrev = true;
                    }
                });
             }

             const currentPct = budgetQty > 0 ? (currentQty / budgetQty) * 100 : 0;

              // Previous Calculation (Consolidated)
              let previousQty = 0;
              let previousValue = 0;
              
              if (hasManualPrev) {
                  // Use manual overrides if present
                  previousQty = manualPrevQty;
                  previousValue = manualPrevVal;
              } else if (allBoardDetails && previousActasIdsSet.size > 0) {
                  const prevDetails = [...(prevDetailsByNormTarget.get(targetNorm) || []), ...(prevDetailsByNormTarget.get(String(item.id)) || [])];
                  
                  let baselinePrevQty = 0;
                  let baselinePrevVal = 0;
                  
                  prevDetails.forEach(d => {
                      if (d.previous_qty !== undefined && d.previous_qty !== null && d.previous_qty > baselinePrevQty) {
                          baselinePrevQty = d.previous_qty;
                      }
                      if (d.previous_value !== undefined && d.previous_value !== null && d.previous_value > baselinePrevVal) {
                          baselinePrevVal = d.previous_value;
                      }
                  });

                  previousQty = baselinePrevQty + prevDetails.reduce((sum, d) => sum + (d.quantity || 0), 0);
                  previousValue = baselinePrevVal + prevDetails.reduce((sum, d) => sum + (d.value || 0), 0);
              }
 
              // Accumulated
              const accumQty = previousQty + currentQty;
              const accumValue = previousValue + currentValue;
              
              const balanceQty = accumQty;
              const balanceValue = accumValue;
 
              return {
                  ...item,
                  name: item.cleanName, 
                  unitPrice,
                  budgetQty,
                  budgetTotal,
                  currentQty,
                  currentValue,
                  currentPct,
                  previousQty,
                  previousValue,
                  manualPrevQty: hasManualPrev ? manualPrevQty : undefined,
                  manualPrevVal: hasManualPrev ? manualPrevVal : undefined,
                  accumQty,
                  accumValue,
                  balanceQty,
                  balanceValue
              };
        });
    }, [groups, details, selectedSiteId, allBoardDetails, previousActasIds]);

    const parseNumber = (val: string): number => {
        if (!val) return 0;
        const normalized = val.replace(',', '.');
        return parseFloat(normalized) || 0;
    };

    const getRowColor = useCallback((code: string) => {
        if (!code) return '';
        const firstMatch = code.match(/^(\d+)/);
        if (!firstMatch) return '';
        const first = firstMatch[1];
        
        if (first === '1') return 'bg-blue-100 hover:bg-blue-200';
        if (first === '2') return 'bg-emerald-100 hover:bg-emerald-200';
        if (first === '3') return 'bg-amber-100 hover:bg-amber-200';
        if (first === '4') return 'bg-orange-100 hover:bg-orange-200';
        if (first === '5') return 'bg-rose-100 hover:bg-rose-200';
        if (first === '6') return 'bg-yellow-100 hover:bg-yellow-200';
        if (first === '7') return 'bg-sky-100 hover:bg-sky-200';
        if (first === '8') return 'bg-fuchsia-100 hover:bg-fuchsia-200';
        if (first === '9') return 'bg-lime-100 hover:bg-lime-200';
        if (first === '10') return 'bg-purple-100 hover:bg-purple-200';
        if (first === '11') return 'bg-stone-100 hover:bg-stone-200';
        if (first === '12') return 'bg-neutral-100 hover:bg-neutral-200';
        return '';
    }, []);

    const handleUpdate = useCallback((item: any, field: 'qty' | 'val' | 'pct' | 'prevQty' | 'prevVal' | 'unitPrice' | 'budgetTotal', value: number) => {
        let newQty = item.currentQty;
        let newVal = item.currentValue;
        // Only send a manual override if explicitly edited or previously set. Otherwise leave undefined to let DB stay null.
        let newPrevQty = field === 'prevQty' ? value : item.manualPrevQty;
        let newPrevVal = field === 'prevVal' ? value : item.manualPrevVal;
        let newUnitPrice = item.unitPrice;

        if (field === 'qty') {
            newQty = value;
            newVal = newQty * item.unitPrice;
        } else if (field === 'val') {
            newVal = value;
            newQty = item.unitPrice > 0 ? newVal / item.unitPrice : 0;
        } else if (field === 'pct') {
            newQty = (value / 100) * item.budgetQty;
            newVal = newQty * item.unitPrice;
        } else if (field === 'prevQty') {
            newPrevQty = value;
            newPrevVal = value * item.unitPrice;
        } else if (field === 'prevVal') {
            newPrevVal = value;
            newPrevQty = item.unitPrice > 0 ? value / item.unitPrice : 0;
        } else if (field === 'unitPrice') {
            newUnitPrice = value;
            newVal = newQty * value;
            if (newPrevQty !== undefined) newPrevVal = newPrevQty * value;
        } else if (field === 'budgetTotal') {
            // Re-calculate budget based on total. If there's unit price, change qty. Otherwise change unit price.
            if (item.unitPrice > 0) {
                 // Adjust qty
                 const adjQty = value / item.unitPrice;
                 newQty = item.currentPct > 0 ? (item.currentPct / 100) * adjQty : newQty;
                 newVal = newQty * item.unitPrice;
            }
        }

        const normName = (s: string) => (s || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const originalName = item.originalName || item.name;
        const targetNorm = normName(originalName);

        if (selectedSiteId !== 'all') {
            // Single site mode (or Matrix cell edit) — save directly to that site group
            const siteGroup = groups.find(g => g.id === selectedSiteId);
            
            // Try to find by exact normalized name first, then fallback to original ID
            let siteItem = siteGroup?.items.find(i => normName(i.name) === targetNorm);
            
            if (!siteItem && siteGroup) {
               siteItem = siteGroup.items.find(i => String(i.id) === String(item.id));
            }
            
            let effectiveGroupId = siteGroup?.id;

            if (!siteItem) {
                // FALLBACK: If the item doesn't structurally exist in this site group, save to PRESUPUESTO GENERAL so the edit is recorded realistically.
                const generalGroup = groups.find(g => g.title.toUpperCase() === 'PRESUPUESTO GENERAL');
                if (generalGroup) {
                     siteItem = generalGroup.items.find(i => normName(i.name) === targetNorm) || generalGroup.items.find(i => String(i.id) === String(item.id));
                     if (siteItem) {
                         effectiveGroupId = generalGroup.id;
                         console.warn('[handleUpdate] Ítem no localizado en este sub-sitio. Redirigiendo guardado a PRESUPUESTO GENERAL de manera nativa.');
                     }
                }
            }

            const effectiveItemId = String(siteItem?.id ?? item.id);

            if (effectiveGroupId && siteItem) {
                // If editing unit price or budgetTotal, update the underlying item
                if (field === 'unitPrice') {
                    updateItem.mutate({ itemId: effectiveItemId, updates: { unit_price: newUnitPrice }, isValuesUpdate: true });
                } else if (field === 'budgetTotal') {
                     if (item.unitPrice > 0) {
                         const newCant = value / item.unitPrice;
                         updateItem.mutate({ itemId: effectiveItemId, updates: { cant: newCant }, isValuesUpdate: true });
                     } else if (item.budgetQty > 0) {
                         const newUp = value / item.budgetQty;
                         updateItem.mutate({ itemId: effectiveItemId, updates: { unit_price: newUp }, isValuesUpdate: true });
                     }
                }

                const payload = {
                    acta_id:  acta.id,
                    item_id:  effectiveItemId,
                    group_id: effectiveGroupId,
                    quantity: newQty,
                    value:    newVal,
                    previous_qty: newPrevQty,
                    previous_value: newPrevVal
                };
                console.log('[DEBUG] Attempting to upsert single site detail:', JSON.stringify(payload, null, 2));
                upsertActaDetail.mutate(payload);

                // SYNC TO MONDAY: Update executed_qty in the main items table
                // Calculate previous quantity for this specific item in this specific group
                const previousActasIdsSet = new Set(previousActasIds);
                const variantPrevDetails = allBoardDetails?.filter(d => 
                    d.group_id === effectiveGroupId && 
                    String(d.item_id) === effectiveItemId && 
                    previousActasIdsSet.has(d.acta_id)
                ) || [];
                
                let vBaselineQty = (newPrevQty !== undefined && newPrevQty !== null) ? newPrevQty : 0;
                if (newPrevQty === undefined || newPrevQty === null) {
                    variantPrevDetails.forEach(d => {
                        if (d.previous_qty !== undefined && d.previous_qty !== null && d.previous_qty > vBaselineQty) vBaselineQty = d.previous_qty;
                    });
                }
                const variantPreviousQty = vBaselineQty + variantPrevDetails.reduce((sum, d) => sum + (d.quantity || 0), 0);
                const variantAccumulatedQty = variantPreviousQty + newQty;

                updateItem.mutate({ 
                    itemId: effectiveItemId, 
                    updates: { executed_qty: variantAccumulatedQty }, 
                    isValuesUpdate: true 
                });
            } else {
                console.error('[handleUpdate] Falla crítica: No se encontró el ítem ni en el sitio local ni en PRESUPUESTO GENERAL.', { selectedSiteId, targetNorm, itemId: item.id });
                alert(`No se pudo guardar. El ítem "${originalName?.slice(0, 40)}" es completamente huérfano y no pertenece a la base general.`);
            }
        } else {
            // "All sites" mode (Summary table edit) — distribute proportionally
            
            const findAllItemsInGroup = (g: any) => 
                g.items.filter((i: any) => normName(i.name) === targetNorm || String(i.id) === String(item.id));

            let siteGroups = groups.filter(g =>
                g.title.toUpperCase() !== 'PRESUPUESTO GENERAL' &&
                findAllItemsInGroup(g).length > 0
            );

            if (siteGroups.length === 0) {
                console.warn('[handleUpdate] No se encontraron grupos de sitio para este ítem. Guardando en PRESUPUESTO GENERAL como respaldo.');
                siteGroups = groups.filter(g => g.title.toUpperCase() === 'PRESUPUESTO GENERAL' && findAllItemsInGroup(g).length > 0);
                if (siteGroups.length === 0) {
                    console.error('[handleUpdate] Ítem no encontrado en ningún grupo de la matriz.');
                    return;
                }
            }

            // 1. Calculate the TOTAL budget quantity for all matching items across all groups
            const globalMatchingBudgetQty = siteGroups.reduce((acc, g) => {
                const matches = findAllItemsInGroup(g);
                return acc + matches.reduce((sum: number, m: any) => sum + (parseFloat((m.values as any)?.cant || '0') || 0), 0);
            }, 0);

            siteGroups.forEach(g => {
                const matches = findAllItemsInGroup(g);
                if (matches.length === 0) return;

                // For each group, we distribute the values further if there are multiple matches in the SAME group
                matches.forEach((siteItem: any) => {
                    let groupQty = newQty;
                    let groupVal = newVal;
                    let groupPrevQty = newPrevQty;
                    let groupPrevVal = newPrevVal;

                    // Proportional distribution logic
                    if (globalMatchingBudgetQty > 0) {
                        const itemBudgetQty = parseFloat((siteItem.values as any)?.cant || '0') || 0;
                        const weight = itemBudgetQty / globalMatchingBudgetQty;
                        groupQty = newQty * weight;
                        groupVal = newVal * weight;
                        
                        if (groupPrevQty !== undefined && groupPrevQty !== null) {
                            groupPrevQty = Number(((groupPrevQty as number) * weight).toFixed(4));
                        }
                        if (groupPrevVal !== undefined && groupPrevVal !== null) {
                            groupPrevVal = Number(((groupPrevVal as number) * weight).toFixed(2));
                        }
                    } else {
                        // If no budget available, distribute equally
                        const totalMatchCount = siteGroups.reduce((acc, sg) => acc + findAllItemsInGroup(sg).length, 0);
                        const weight = 1 / totalMatchCount;
                        groupQty = newQty * weight;
                        groupVal = newVal * weight;
                        if (groupPrevQty !== undefined && groupPrevQty !== null) groupPrevQty = (groupPrevQty as number) * weight;
                        if (groupPrevVal !== undefined && groupPrevVal !== null) groupPrevVal = (groupPrevVal as number) * weight;
                    }

                    // Safety catch for NaN
                    if (Number.isNaN(groupPrevQty)) groupPrevQty = undefined;
                    if (Number.isNaN(groupPrevVal)) groupPrevVal = undefined;

                    if (field === 'unitPrice') {
                        updateItem.mutate({ itemId: String(siteItem.id), updates: { unit_price: newUnitPrice }, isValuesUpdate: true });
                    } else if (field === 'budgetTotal') {
                         if (item.unitPrice > 0) {
                             const newCant = value / item.unitPrice;
                             updateItem.mutate({ itemId: String(siteItem.id), updates: { cant: newCant / matches.length }, isValuesUpdate: true });
                         } else if (item.budgetQty > 0) {
                             const newUp = value / item.budgetQty;
                             updateItem.mutate({ itemId: String(siteItem.id), updates: { unit_price: newUp }, isValuesUpdate: true });
                         }
                    }

                    const payload = {
                        acta_id:  acta.id,
                        item_id:  String(siteItem.id),
                        group_id: g.id,
                        quantity: groupQty,
                        value:    groupVal,
                        previous_qty: groupPrevQty,
                        previous_value: groupPrevVal
                    };
                    
                    console.log('[DEBUG] Upserting detail for item variant:', siteItem.name, 'in group:', g.title);
                    upsertActaDetail.mutate(payload);

                    // SYNC TO MONDAY: Calculate accumulated and push to items table
                    const previousActasIdsSet = new Set(previousActasIds);
                    const variantPrevDetails = allBoardDetails?.filter(d => 
                        d.group_id === g.id && 
                        String(d.item_id) === String(siteItem.id) && 
                        previousActasIdsSet.has(d.acta_id)
                    ) || [];
                    
                    let vBaselineQty = (groupPrevQty !== undefined && groupPrevQty !== null) ? groupPrevQty : 0;
                    if (groupPrevQty === undefined || groupPrevQty === null) {
                         variantPrevDetails.forEach(d => {
                            if (d.previous_qty !== undefined && d.previous_qty !== null && d.previous_qty > vBaselineQty) vBaselineQty = d.previous_qty;
                        });
                    }
                    const variantPreviousQty = vBaselineQty + variantPrevDetails.reduce((sum, d) => sum + (d.quantity || 0), 0);
                    const variantAccumulatedQty = variantPreviousQty + groupQty;

                    updateItem.mutate({ 
                        itemId: String(siteItem.id), 
                        updates: { executed_qty: variantAccumulatedQty }, 
                        isValuesUpdate: true 
                    });
                });
            });
        }
    }, [selectedSiteId, groups, acta.id, upsertActaDetail, updateItem, allBoardDetails, previousActasIds]);


    const handleUpdateActaDetail = useCallback((groupId: string, itemId: string, qty: number) => {
        const item = tableData.find(i => String(i.id) === itemId);
        if (!item) return;
        const value = qty * item.unitPrice;
        
        upsertActaDetail.mutate({
            acta_id: acta.id,
            item_id: itemId,
            group_id: groupId,
            quantity: qty,
            value: value
        });

        // SYNC TO MONDAY: Update executed_qty
        const previousActasIdsSet = new Set(previousActasIds);
        const variantPrevDetails = allBoardDetails?.filter(d => 
            d.group_id === groupId && 
            String(d.item_id) === itemId && 
            previousActasIdsSet.has(d.acta_id)
        ) || [];
        
        // Check for manual overrides in any of the current acta details (in case it was set globally)
        // But here we are in matrix mode, usually no manual override unless set elsewhere.
        // We'll trust the calculated previous from allBoardDetails.
        let vBaselineQty = 0;
        variantPrevDetails.forEach(d => {
            if (d.previous_qty !== undefined && d.previous_qty !== null && d.previous_qty > vBaselineQty) vBaselineQty = d.previous_qty;
        });

        const variantPreviousQty = vBaselineQty + variantPrevDetails.reduce((sum, d) => sum + (d.quantity || 0), 0);
        const variantAccumulatedQty = variantPreviousQty + qty;

        updateItem.mutate({ 
            itemId, 
            updates: { executed_qty: variantAccumulatedQty }, 
            isValuesUpdate: true 
        });
    }, [tableData, acta.id, upsertActaDetail, allBoardDetails, previousActasIds, updateItem]);




    const currencyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
         <div className={`flex flex-col h-full bg-white text-slate-900 transition-all duration-300 ${isCanvasMode ? 'fixed inset-0 z-[100] rounded-0' : 'rounded-[2rem] shadow-sm overflow-hidden'}`}>
            {/* Toolbar (Back button, View Selector) */}
            <div className={`flex items-center justify-between px-6 py-4 border-b border-gray-100 ${isCanvasMode ? 'bg-slate-900 text-white' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-4">
                     <button onClick={onBack} className={`p-2 rounded-xl transition-colors ${isCanvasMode ? 'hover:bg-slate-800 text-[var(--text-primary)]' : 'hover:bg-slate-200 text-slate-500'}`}>
                        <ChevronRight className="rotate-180" />
                    </button>
                    <span className={`font-bold text-sm ${isCanvasMode ? 'text-slate-500' : 'text-slate-400'}`}>Volver al listado</span>
                </div>
                 <div className="flex items-center gap-4">
                    <button 
                        onClick={async () => {
                            try {
                                const response = await fetch('/api/reports/acta', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ acta, tableData })
                                });
                                if (!response.ok) throw new Error('Failed to generate PDF');
                                const blob = await response.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `Acta_${acta.name}.pdf`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                            } catch (e) {
                                alert('Error al generar PDF');
                            }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20 text-xs"
                    >
                        <FileText size={16} /> Exportar PDF
                    </button>

                    {acta.status === 'draft' && (
                        <button 
                            onClick={async () => {
                                if (window.confirm('¿Confirmar facturación del acta? Una vez facturada no se podrán editar los valores.')) {
                                    await updateActa.mutateAsync({ id: acta.id, updates: { status: 'approved' } });
                                }
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/20 text-xs"
                        >
                            <Check size={16} /> Facturar Acta
                        </button>
                    )}

                    <div className="flex items-center bg-white/10 backdrop-blur-md border border-white/20 p-1 rounded-xl">
                        <button 
                            onClick={() => setViewMode('detailed')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'detailed' ? 'bg-white text-black shadow' : (isCanvasMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700')}`}
                        >
                            ACTA
                        </button>
                        <button 
                            onClick={() => setViewMode('matrix')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'matrix' ? 'bg-white text-black shadow' : (isCanvasMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700')}`}
                        >
                            ACTA DETALLADA
                        </button>
                    </div>
                    
                    {/* Canvas Mode Toggle */}
                    <button 
                        onClick={() => setIsCanvasMode(!isCanvasMode)}
                        className={`p-2 rounded-xl border transition-all ${isCanvasMode ? 'bg-blue-600 text-white border-blue-700 shadow-lg' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                        title={isCanvasMode ? "Salir de pantalla completa" : "Pantalla completa (Modo Canvas)"}
                    >
                        {isCanvasMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>

                    {onAddSite && (
                         <button 
                            onClick={onAddSite}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors text-xs"
                        >
                            <Plus size={14} /> Sitio
                        </button>
                    )}
                </div>
            </div>

            {/* SCROLLABLE PAPER CONTENT */}
            <div className={`flex-1 overflow-auto bg-gray-100 ${isCanvasMode ? 'p-0 w-screen h-screen' : 'p-8'}`}>
                <div className={`${isCanvasMode ? 'w-full min-h-full border-none' : 'max-w-[1400px] mx-auto bg-white shadow-2xl min-h-[1000px] p-8 border border-gray-300'}`}>
                
                    {viewMode === 'matrix' ? (
                   <div className="overflow-hidden bg-white border border-slate-300 shadow-sm">
                       <div className="overflow-x-auto">
                        <table className="w-full min-w-max text-[8px] text-left border-collapse border border-slate-300 table-fixed">
                            <colgroup>
                                <col style={{ width: 60, minWidth: 60 }} />
                                <col style={{ width: 400, minWidth: 400 }} />
                                <col style={{ width: 60, minWidth: 60 }} />
                                <col style={{ width: 100, minWidth: 100 }} />
                                <col style={{ width: 130, minWidth: 130 }} />
                                {filteredGroups.map(g => (
                                    <React.Fragment key={`cg-${g.id}`}>
                                        <col style={{ width: 100, minWidth: 100 }} />
                                        <col style={{ width: 130, minWidth: 130 }} />
                                    </React.Fragment>
                                ))}
                                <col style={{ width: 100, minWidth: 100 }} />
                                <col style={{ width: 130, minWidth: 130 }} />
                            </colgroup>
                            <thead className="text-[7px] uppercase bg-slate-800 text-white border border-slate-300">
                                <tr>
                                    {/* Fixed Columns */}
									<th rowSpan={2} className="px-1 py-1 font-bold sticky left-0 bg-slate-800 z-20 w-[60px] border border-slate-600">ITEM</th>
                                    <th rowSpan={2} className="px-2 py-1 font-bold sticky left-[60px] bg-slate-800 z-20 w-[400px] border border-slate-600 text-left">DESCRIPCIÓN</th>
                                    <th rowSpan={2} className="px-1 py-1 font-bold text-center w-[60px] border border-slate-600">UNID</th>
                                    <th rowSpan={2} className="px-1 py-1 font-bold text-right w-[100px] border border-slate-600">CANTIDAD</th>
                                    <th rowSpan={2} className="px-1 py-1 font-bold text-right w-[130px] border border-slate-600 leading-tight">VALOR<br/>UNITARIO</th>

                                    {/* Dynamic Site Columns */}
                                    {filteredGroups.map(group => (
                                        <th key={group.id} colSpan={2} className="px-1 py-1 font-bold text-center bg-slate-800 text-white border border-slate-600">
                                            <div className="text-[9px] font-black">{group.title.toUpperCase()}</div>
                                            <div className="text-[7px] font-medium text-slate-400 mt-0.5">{acta.name.toUpperCase()}</div>
                                        </th>
                                    ))}

                                    {/* Total Column */}
                                    <th colSpan={2} className="px-1 py-1 font-bold text-center bg-slate-900 text-white border border-slate-700 w-[230px] shadow-[-2px_0_5px_rgba(0,0,0,0.1)]">
                                        <div className="text-[9px] font-black">TOTAL ACUMULADO</div>
                                        <div className="text-[7px] font-medium text-slate-400 mt-0.5 whitespace-nowrap">POR ACTIVIDAD</div>
                                    </th>
                                </tr>
                                 <tr className="bg-slate-700">
                                    {/* Sub-headers for sites */}
                                    {filteredGroups.map(group => (
                                        <React.Fragment key={`sub-${group.id}`}>
                                            <th className="px-1 py-1 font-bold text-center bg-slate-50 text-slate-900 w-[100px] border border-slate-300">CANT.</th>
                                            <th className="px-1 py-1 font-bold text-center bg-slate-50 text-slate-900 w-[130px] border border-slate-300">V/TOTAL</th>
                                        </React.Fragment>
                                    ))}
                                    {/* Sub-headers for Total */}
                                    <th className="px-1 py-1 font-bold text-center bg-slate-50 text-slate-900 w-[100px] border border-slate-300 shadow-[-2px_0_2px_rgba(0,0,0,0.05)]">CANT.</th>
                                    <th className="px-1 py-1 font-bold text-center bg-slate-50 text-slate-900 w-[130px] border border-slate-300">V/TOTAL</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-300 text-[8px]">
                                {(() => {
                                    return tableData.map((uItem, idx) => {
                                        let rowTotalQty = 0;
                                        let rowTotalVal = 0;

                                        return (
                                        <tr key={`${uItem.id}-${uItem.code}`} className={`hover:bg-yellow-50 transition-colors h-8 group/row ${getRowColor(uItem.code) || (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}`}>
                                            {/* Fixed Item Info */}
											<td className={`px-1 py-1 font-bold text-center sticky left-0 z-10 border-r border-slate-300 w-[60px] text-[8px] ${getRowColor(uItem.code) || (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}`}>
                                                <div className="flex items-center justify-center gap-1 group/actions relative w-full h-full">
                                                    <div className="absolute inset-0 opacity-0 group-hover/actions:opacity-100 flex items-center justify-center bg-white/90 backdrop-blur-sm shadow-sm z-[100] transition-all">
                                                        <button 
                                                            onClick={async () => {
                                                                if (window.confirm('¿Remover cantidades de este ítem en esta acta? (Ojo: Esto NO lo elimina de la base de datos)')) {
                                                                    // Clear in all site groups
                                                                    groups.forEach(group => {
                                                                        const groupItem = group.items.find(i => i.name === uItem.originalName);
                                                                        if (groupItem) {
                                                                             handleUpdateActaDetail(group.id, String(groupItem.id), 0);
                                                                        }
                                                                    });
                                                                }
                                                            }}
                                                            className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-all flex items-center gap-1 min-w-max"
                                                            title="Limpiar cantidades en este acta"
                                                        >
                                                            <Eraser size={12} />
                                                        </button>
                                                        <button 
                                                            onClick={async () => {
                                                                if (window.confirm(`¿Seguro que deseas remover las cantidades de '${uItem.name}' de esta Acta?\n\n(El ítem seguirá existiendo en el presupuesto / tabla de costos)`)) {
                                                                    // Clear in all site groups
                                                                    groups.forEach(group => {
                                                                        const groupItem = group.items.find(i => i.name === uItem.originalName);
                                                                        if (groupItem) {
                                                                             deleteActaDetail.mutate({ acta_id: acta.id, item_id: String(groupItem.id), group_id: group.id });
                                                                        }
                                                                    });
                                                                }
                                                            }}
                                                            className="p-1.5 bg-slate-50 text-slate-400 hover:text-white hover:bg-red-600 transition-all border-l border-slate-200 flex items-center gap-1 min-w-max"
                                                            title="Remover de esta Acta"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                    <span className="font-bold text-slate-700">{uItem.code}</span>
                                                </div>
                                            </td>
											<td className={`px-2 py-1 font-semibold text-slate-700 sticky left-[60px] z-10 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-[8px] leading-tight w-[400px] min-w-[400px] max-w-[400px] ${getRowColor(uItem.code) || 'bg-white'}`}>
                                                <span className="text-slate-700 line-clamp-2 leading-tight text-left">{uItem.name}</span>
                                            </td>
											<td className={`px-1 py-1 text-center text-slate-500 border-r border-slate-300 w-[60px] text-[8px] ${getRowColor(uItem.code) || (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}`}>
												{uItem.unit || (uItem.values as any)?.unit}
											</td>
											<td className={`px-1 py-1 text-right text-slate-500 border-r border-slate-300 w-[100px] text-[8px] ${getRowColor(uItem.code) || (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}`}>-</td>
											<td className={`px-1 py-1 text-right font-mono text-slate-600 border-r border-slate-300 w-[130px] text-[8px] ${getRowColor(uItem.code) || (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}`}>
												{currencyFormatter.format(uItem.unitPrice)}
											</td>

                                            {/* Dynamic Site Cells */}
                                            {filteredGroups.map(group => {
                                                const normName = (s: string) => (s || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
                                                const originalName = uItem.originalName || uItem.name;
                                                const targetNorm = normName(originalName);
                                                const groupItem = group.items.find(i => normName(i.name) === targetNorm);
                                                
                                                // Use site item id when found, otherwise fall back to the reference item id
                                                const effectiveItemId = String(groupItem?.id ?? uItem.id);
                                                let currentQty = 0;
                                                let currentValue = 0;

                                                const detail = details?.find(d => d.group_id === group.id && d.item_id === effectiveItemId);
                                                if (detail) {
                                                    currentQty = detail.quantity || 0;
                                                    currentValue = detail.value || 0;
                                                }

                                                rowTotalQty += currentQty;
                                                rowTotalVal += currentValue;

                                                return (
                                                    <React.Fragment key={`${group.id}-${uItem.id}`}>
                                                         <td className={`p-0 border-r border-slate-300 w-[100px] ${getRowColor(uItem.code) || (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}`}>
                                                             {acta.status === 'draft' ? (
                                                                 <MatrixQtyInput
                                                                     key={`qty-${group.id}-${effectiveItemId}`}
                                                                     defaultValue={currentQty}
                                                                     onCommit={(v) => handleUpdateActaDetail(group.id, effectiveItemId, v)}
                                                                 />
                                                             ) : <span style={{ display: 'block', padding: '0 6px', textAlign: 'right', fontSize: '8px', fontWeight: 700, color: currentQty > 0 ? '#1e293b' : '#cbd5e1' }}>{currentQty > 0 ? currentQty.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>}
                                                         </td>
                                                         <td className={`px-1 py-1 text-right border-r border-slate-400 font-bold text-slate-800 w-[130px] text-[8px] ${getRowColor(uItem.code) || (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}`}>
                                                              {currentValue > 0 ? currencyFormatter.format(currentValue) : '-'}
                                                         </td>
                                                    </React.Fragment>
                                                );
                                            })}

											{/* Row Totals */}
											<td className={`px-1 py-1 text-right border-r border-slate-300 font-black text-slate-900 w-[100px] text-[8px] ${getRowColor(uItem.code) || (idx % 2 === 0 ? 'bg-slate-50' : 'bg-slate-100')}`}>
												{rowTotalQty > 0 ? rowTotalQty.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
											</td>
											<td className={`px-1 py-1 text-right border-r border-slate-400 font-black text-slate-900 w-[130px] text-[8px] ${getRowColor(uItem.code) || (idx % 2 === 0 ? 'bg-slate-50' : 'bg-slate-100')}`}>
												{rowTotalVal > 0 ? currencyFormatter.format(rowTotalVal) : '-'}
											</td>
                                        </tr>
                                    )});
                                })()}
                                 <tr className="h-10">
                                     <td colSpan={5} className="px-4 py-2 sticky left-0 bg-white z-10 border-r border-slate-300 w-[750px]">
                                         <button 
                                             onClick={onAddResource}
                                             className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg font-bold hover:bg-blue-100 transition-colors text-[8px]"
                                         >
                                             <Plus size={14} /> AGREGAR ACTIVIDAD / RECURSO
                                         </button>
                                     </td>
                                     {filteredGroups.map(g => (
                                         <React.Fragment key={`footer-${g.id}`}>
                                             <td className="border-r border-slate-300 w-[100px]"></td>
                                             <td className="border-r border-slate-400 w-[130px]"></td>
                                         </React.Fragment>
                                     ))}
                                     <td className="bg-slate-100 border-r border-slate-300 w-[100px]"></td>
                                     <td className="bg-slate-100 border-r border-slate-400 w-[130px]"></td>
                                 </tr>
                            </tbody>
                            <tfoot className="bg-white border-t-2 border-slate-900 font-bold text-slate-900 text-[8px] sticky bottom-0 z-20">
                                {/* 1. COSTOS DIRECTOS */}
                                <tr>
                                    <td colSpan={5} className="px-4 py-1 text-right sticky left-0 bg-white z-10 border-r border-slate-300 w-[750px]">TOTAL COSTOS DIRECTOS</td>
                                    {(() => {
                                        let grandTotal = 0;
                                        const siteDirectCosts = filteredGroups.map(group => {
                                            const total = details
                                                ?.filter(d => d.group_id === group.id)
                                                .reduce((sum, d) => sum + (d.value || 0), 0) || 0;
                                            grandTotal += total;
                                            return total;
                                        });

                                        return (
                                            <>
                                                {siteDirectCosts.map((total, idx) => (
                                                    <React.Fragment key={`direct-${idx}`}>
                                                        <td className="border-r border-slate-300 bg-white w-[100px]"></td>
                                                        <td className="px-1 py-1 text-right border-r border-slate-400 bg-white w-[130px]">
                                                            {currencyFormatter.format(total)}
                                                        </td>
                                                    </React.Fragment>
                                                ))}
                                                {/* Grand Total Direct Costs */}
                                                <td className="border-r border-slate-300 bg-slate-800 w-[100px]"></td>
                                                <td className="px-1 py-1 text-right border-r border-slate-400 bg-slate-800 text-white w-[130px]">
                                                    {currencyFormatter.format(grandTotal)}
                                                </td>
                                            </>
                                        );
                                    })()}
                                </tr>

                                {/* 2. ADMINISTRACION 20% */}
                                <tr>
                                    <td colSpan={5} className="px-4 py-1 text-right sticky left-0 bg-white z-10 border-r border-slate-300 w-[750px]">ADMINISTRACION 20%</td>
                                    {(() => {
                                        let grandTotal = 0;
                                        const siteDirectCosts = filteredGroups.map(group => {
                                             return details
                                                ?.filter(d => d.group_id === group.id)
                                                .reduce((sum, d) => sum + (d.value || 0), 0) || 0;
                                        });

                                        return (
                                            <>
                                                {siteDirectCosts.map((directCost, idx) => {
                                                    const admin = directCost * 0.20;
                                                    grandTotal += admin;
                                                    return (
                                                        <React.Fragment key={`admin-${idx}`}>
                                                            <td className="border-r border-slate-300 bg-white w-[100px]"></td>
                                                            <td className="px-1 py-1 text-right border-r border-slate-400 bg-white w-[130px]">
                                                                {currencyFormatter.format(admin)}
                                                            </td>
                                                        </React.Fragment>
                                                    );
                                                })}
                                                <td className="border-r border-slate-300 bg-slate-800 w-[100px]"></td>
                                                <td className="px-1 py-1 text-right border-r border-slate-400 bg-slate-800 text-white w-[130px]">
                                                    {currencyFormatter.format(grandTotal)}
                                                </td>
                                            </>
                                        );
                                    })()}
                                </tr>

                                {/* 3. IMPREVISTOS 5% */}
                                <tr>
                                    <td colSpan={5} className="px-4 py-1 text-right sticky left-0 bg-white z-10 border-r border-slate-300 w-[750px]">IMPREVISTOS 5%</td>
                                    {(() => {
                                        let grandTotal = 0;
                                        const siteDirectCosts = filteredGroups.map(group => {
                                             return details
                                                ?.filter(d => d.group_id === group.id)
                                                .reduce((sum, d) => sum + (d.value || 0), 0) || 0;
                                        });

                                        return (
                                            <>
                                                {siteDirectCosts.map((directCost, idx) => {
                                                    const imprevistos = directCost * 0.05;
                                                    grandTotal += imprevistos;
                                                    return (
                                                        <React.Fragment key={`imprev-${idx}`}>
                                                            <td className="border-r border-slate-300 bg-white w-[100px]"></td>
                                                            <td className="px-1 py-1 text-right border-r border-slate-400 bg-white w-[130px]">
                                                                {currencyFormatter.format(imprevistos)}
                                                            </td>
                                                        </React.Fragment>
                                                    );
                                                })}
                                                <td className="border-r border-slate-300 bg-slate-800 w-[100px]"></td>
                                                <td className="px-1 py-1 text-right border-r border-slate-400 bg-slate-800 text-white w-[130px]">
                                                    {currencyFormatter.format(grandTotal)}
                                                </td>
                                            </>
                                        );
                                    })()}
                                </tr>

                                {/* 4. UTILIDAD 5% */}
                                <tr>
                                    <td colSpan={5} className="px-4 py-1 text-right sticky left-0 bg-white z-10 border-r border-slate-300 w-[750px]">UTILIDAD 5%</td>
                                    {(() => {
                                        let grandTotal = 0;
                                        const siteDirectCosts = filteredGroups.map(group => {
                                             return details
                                                ?.filter(d => d.group_id === group.id)
                                                .reduce((sum, d) => sum + (d.value || 0), 0) || 0;
                                        });

                                        return (
                                            <>
                                                {siteDirectCosts.map((directCost, idx) => {
                                                    const utilidad = directCost * 0.05;
                                                    grandTotal += utilidad;
                                                    return (
                                                        <React.Fragment key={`util-${idx}`}>
                                                            <td className="border-r border-slate-300 bg-white w-[100px]"></td>
                                                            <td className="px-1 py-1 text-right border-r border-slate-400 bg-white w-[130px]">
                                                                {currencyFormatter.format(utilidad)}
                                                            </td>
                                                        </React.Fragment>
                                                    );
                                                })}
                                                <td className="border-r border-slate-300 bg-slate-800 w-[100px]"></td>
                                                <td className="px-1 py-1 text-right border-r border-slate-400 bg-slate-800 text-white w-[130px]">
                                                    {currencyFormatter.format(grandTotal)}
                                                </td>
                                            </>
                                        );
                                    })()}
                                </tr>

                                {/* 5. TOTAL A PAGAR */}
                                <tr className="border-t-2 border-slate-900">
                                    <td colSpan={5} className="px-4 py-1 text-right sticky left-0 bg-white z-10 border-r border-slate-300 font-black w-[750px]">TOTAL A PAGAR {new Date(acta.date).getFullYear()}</td>
                                    {(() => {
                                        let grandTotal = 0;
                                        const siteDirectCosts = filteredGroups.map(group => {
                                             return details
                                                ?.filter(d => d.group_id === group.id)
                                                .reduce((sum, d) => sum + (d.value || 0), 0) || 0;
                                        });

                                        return (
                                            <>
                                                {siteDirectCosts.map((directCost, idx) => {
                                                    const totalAPagar = directCost * 1.30; // Direct + 20% + 5% + 5% = 1.30
                                                    grandTotal += totalAPagar;
                                                    return (
                                                        <React.Fragment key={`grand-${idx}`}>
                                                            <td className="border-r border-slate-300 bg-white w-[100px]"></td>
                                                            <td className="px-1 py-1 text-right border-r border-slate-400 bg-white font-black w-[130px]">
                                                                {currencyFormatter.format(totalAPagar)}
                                                            </td>
                                                        </React.Fragment>
                                                    );
                                                })}
                                                <td className="border-r border-slate-300 bg-slate-800 w-[100px]"></td>
                                                <td className="px-1 py-1 text-right border-r border-slate-400 bg-slate-800 text-white w-[130px] font-black">
                                                    {currencyFormatter.format(grandTotal)}
                                                </td>
                                            </>
                                        );
                                    })()}
                                </tr>
                            </tfoot>
                        </table>
                       </div>
                   </div>
                ) : (
                       <div className="flex flex-col gap-2">
                            {/* COLLAPSE TOGGLE BAR */}
                            <button
                                onClick={() => setHeaderCollapsed(c => !c)}
                                className="flex items-center justify-between w-full px-4 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-xs font-bold text-slate-600 transition-colors"
                            >
                                <span className="uppercase tracking-wider">{headerCollapsed ? '▼ Mostrar encabezado' : '▲ Ocultar encabezado'}</span>
                                <span className="text-slate-400">{acta.name}</span>
                            </button>

                            {/* EXCEL-LIKE HEADER (PORTRAIT/VERTICAL OPTIMIZED) */}
                            {!headerCollapsed && (
                            <div className="border-4 border-slate-900 bg-white flex flex-col divide-y-4 divide-slate-900 overflow-hidden">
                                {/* 1. Logo Section (Top) */}
                                <div className="flex items-center justify-between p-6 bg-white gap-8">
                                    <div className="flex-1 flex flex-col items-center justify-center">
                                        <div className="relative w-80 h-32 flex items-center justify-center">
                                            <img 
                                                src="/logo-consorcio-hd.png" 
                                                alt="Logo Consorcio" 
                                                className="max-w-full max-h-full object-contain"
                                            />
                                        </div>
                                        <div className="text-[16px] font-black text-slate-800 tracking-[0.25em] mt-2 uppercase serif">Consorcio Conservación Costera</div>
                                    </div>
                                    
                                    {/* Date/Year Box (Small, side of logo) */}
                                    <div className="w-[180px] flex flex-col border-4 border-slate-900 divide-y-4 divide-slate-900">
                                        <div className="bg-slate-50 flex flex-col items-center justify-center py-2">
                                            <div className="text-[24px] font-black text-slate-900 leading-none">{new Date(acta.date).getFullYear()}</div>
                                            <div className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-widest">AÑO</div>
                                        </div>
                                        <div className="bg-white flex flex-col items-center justify-center py-2 px-4 shadow-inner">
                                            <div className="text-[18px] uppercase font-black text-slate-900 leading-none">
                                                {new Date(new Date(acta.date).getFullYear(), new Date(acta.date).getMonth() - 1, 1).toLocaleDateString('es-CO', { month: 'long' })}
                                            </div>
                                            <div className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-widest text-center">MES EJECUCIÓN</div>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Title Section (Middle) */}
                                <div className="text-center font-black text-3xl py-4 bg-slate-900 text-white uppercase tracking-[0.4em] shadow-lg">
                                    {acta.name.toUpperCase()}
                                </div>
                                
                                {/* 3. Info Grid (Bottom) */}
                                <div className="flex divide-x-4 divide-slate-900 min-h-[100px]">
                                    {/* Left Block: Client Info */}
                                    <div className="flex-1 p-4 bg-white flex flex-col justify-center gap-1 text-[11px] font-black">
                                        <div className="text-slate-500 text-[8px] uppercase tracking-tighter">CONTRATANTE:</div>
                                        <div className="text-slate-950 font-black leading-tight">PUERTA DE ORO EMPRESA DE DESARROLLO CARIBE S.A.S</div>
                                        <div className="flex gap-4 mt-1 border-t border-slate-100 pt-1">
                                            <span className="text-slate-900">NIT.: 900.249.143-1</span>
                                            <span className="text-slate-900 font-black ml-auto bg-slate-100 px-2 py-0.5 rounded">CONTRATO: 038 - 2023</span>
                                        </div>
                                    </div>

                                    {/* Right Block: Contractor & Object */}
                                    <div className="flex-[1.5] p-4 bg-white flex flex-col justify-center gap-1 text-[11px] font-black">
                                        <div className="text-slate-500 text-[8px] uppercase tracking-tighter">CONTRATISTA / OBJETO:</div>
                                        <div className="text-slate-950 font-black leading-tight mb-1">CONSORCIO CONSERVACIÓN COSTERA [901.727.371-7]</div>
                                        <div className="leading-tight text-[9px] text-slate-600 italic font-medium border-l-2 border-slate-200 pl-2">
                                            CONSERVACIÓN INTEGRAL Y REVITALIZACIÓN DE LOS PROYECTOS DE INFRAESTRUCTURA TURÍSTICA DEL DEPARTAMENTO DEL ATLÁNTICO, ASÍ COMO SUS ACTIVIDADES RELACIONADAS Y/O CONEXAS
                                        </div>
                                    </div>
                                </div>
                            </div>
                            )}

                            {/* HANDSONTABLE GRID */}
                            <div
                                className="border border-slate-300 bg-white shadow-none"
                                style={{ height: isCanvasMode ? 'calc(100vh - 200px)' : headerCollapsed ? '560px' : '465px' }}
                            >
                                <ActasHotTable
                                    tableData={tableData as any}
                                    isReadOnly={acta.status !== 'draft'}
                                    onCellChange={(row: any, field: any, value: any) => handleUpdate(row, field, value)}
                                    actaName={acta.name}
                                    onDelete={(row: any) => {
                                        // Delete ALL items from ALL groups that contain it (matched by originalName)
                                        const originalName = row.originalName || row.name;
                                        (groups || []).forEach(g => {
                                            const matches = g.items.filter(i => i.name === originalName);
                                            matches.forEach(m => deleteItem.mutate(m.id));
                                        });
                                    }}

                                />
                            </div>

                            {/* FINANCIAL SUMMARY BAR */}
                            {(() => {
                                const prevDirectCostsTotal    = tableData.reduce((s, r) => s + (r.previousValue || 0), 0);
                                const currentDirectCostsTotal = tableData.reduce((s, r) => s + (r.currentValue || 0), 0);
                                const accumDirectCostsTotal   = prevDirectCostsTotal + currentDirectCostsTotal;

                                // Column widths derived from ActasHotTable:
                                const W_OFFSET = 751; // code(42) + name(350) + unit(55) + budgetQty(78) + unitPrice(108) + budgetTotal(118)
                                const W_PREV   = 196; // prevQty(78) + prevVal(118)
                                const W_CUR    = 250; // curQty(80) + curVal(118) + curPct(52)
                                const W_ACC    = 196; // accQty(78) + accVal(118) 
                                // actions width is 36, ignoring it for totals.

                                const calcRow = (label: string, totalPrev: number, totalCur: number, isTotal: boolean = false) => {
                                    const totalAcc = totalPrev + totalCur;
                                    return (
                                        <div className={`flex divide-x divide-slate-200 min-w-max ${isTotal ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
                                            <div style={{ width: W_OFFSET }} className="px-4 py-2 flex items-center justify-end">
                                                <div className={`text-[10px] uppercase font-black tracking-widest ${isTotal ? 'text-emerald-400' : 'text-slate-500'}`}>{label}</div>
                                            </div>
                                            <div style={{ width: W_PREV }} className="px-5 py-2 flex items-center justify-end">
                                                <div className="text-[11px] font-bold">{currencyFormatter.format(totalPrev)}</div>
                                            </div>
                                            <div style={{ width: W_CUR }} className="px-8 py-2 flex items-center justify-end">
                                                <div className="text-[11px] font-bold text-blue-600">{currencyFormatter.format(totalCur)}</div>
                                            </div>
                                            <div style={{ width: W_ACC }} className="px-3 py-2 flex items-center justify-end bg-slate-100/50">
                                                <div className={`text-[11px] font-black ${isTotal ? 'text-white' : 'text-slate-900'}`}>{currencyFormatter.format(totalAcc)}</div>
                                            </div>
                                        </div>
                                    );
                                };

                                return (
                                    <div className="border border-slate-300 mt-4 bg-white text-[11px] font-bold shadow-sm rounded-lg overflow-x-auto no-scrollbar">
                                        {/* Header Row */}
                                        <div className="flex divide-x divide-slate-200 bg-slate-100 border-b border-slate-300 min-w-max">
                                            <div style={{ width: W_OFFSET }} className="px-4 py-2"></div>
                                            <div style={{ width: W_PREV }} className="px-4 py-2 text-center text-[9px] text-slate-500 uppercase font-black tracking-widest">Actas Anteriores</div>
                                            <div style={{ width: W_CUR }} className="px-4 py-2 text-center text-[9px] text-blue-600 uppercase font-black tracking-widest">Acta Actual</div>
                                            <div style={{ width: W_ACC }} className="px-4 py-2 text-center text-[9px] text-slate-800 uppercase font-black tracking-widest">Acumulado a la Fecha</div>
                                        </div>
                                        
                                        <div className="divide-y divide-slate-100">
                                            {calcRow('Costos Directos', prevDirectCostsTotal, currentDirectCostsTotal)}
                                            {calcRow('Administración 20%', prevDirectCostsTotal * 0.20, currentDirectCostsTotal * 0.20)}
                                            {calcRow('Imprevistos 5%', prevDirectCostsTotal * 0.05, currentDirectCostsTotal * 0.05)}
                                            {calcRow('Utilidad 5%', prevDirectCostsTotal * 0.05, currentDirectCostsTotal * 0.05)}
                                            {calcRow(`Total a Pagar ${new Date(acta.date).getFullYear()}`, prevDirectCostsTotal * 1.30, currentDirectCostsTotal * 1.30, true)}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                     )}
                </div>
            </div>
         </div>
    );
}
