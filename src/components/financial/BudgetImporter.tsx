
import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { Upload, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

interface BudgetImporterProps {
    boardId: string;
    onImportComplete?: () => void;
}

export default function BudgetImporter({ boardId, onImportComplete }: BudgetImporterProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setStatus('idle');
        setMessage('Leyendo archivo...');

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            // Skip header (Row 0)
            const dataRows = rows.slice(1);
            setMessage(`Encontrados ${dataRows.length} items. Iniciando importación...`);

            // 1. Check Groups
            let { data: groups } = await supabase.from('groups').select('id, title').eq('board_id', boardId);
            let targetGroupId = '';

            if (groups && groups.length > 0) { 
                 // Try to find one named similarly
                 const budgetGroup = groups.find(g => g.title.toUpperCase().includes('PRESUPUESTO'));
                 targetGroupId = budgetGroup ? budgetGroup.id : groups[0].id;
            } else {
                 // Create Group
                 const { data: newGroup, error } = await supabase.from('groups').insert({
                     board_id: boardId,
                     title: 'PRESUPUESTO GENERAL',
                     color: '#579bfc',
                     position: 0
                 }).select().single();
                 if (error) throw error;
                 targetGroupId = newGroup.id;
            }

            let importedCount = 0;
            // 2. Import Items
            for (const row of dataRows) {
                 // Row: [Code, Desc, Unit, Qty, UnitPrice]
                 const code = row[0] ? String(row[0]).trim() : '';
                 const desc = row[1] ? String(row[1]).trim() : '';
                 const unit = row[2] ? String(row[2]).trim() : 'UND';
                 const qty = parseFloat(row[3]) || 1;
                 const unitPrice = parseFloat(row[4]) || 0;
         
                 if (!desc) continue;
         
                 const fullName = `${code} ${desc}`;
         
                 const { error: insertError } = await supabase.from('items').insert({
                     name: fullName,
                     group_id: targetGroupId,
                     board_id: boardId,
                     item_type: 'financial',
                     values: {
                         unit: unit,
                         cant: qty,
                         unit_price: unitPrice,
                         budget: qty * unitPrice
                     }
                 });

                 if (!insertError) importedCount++;
            }

            setStatus('success');
            setMessage(`Importación exitosa: ${importedCount} items agregados.`);
            if (onImportComplete) onImportComplete();

        } catch (error: any) {
            console.error(error);
            setStatus('error');
            setMessage(`Error: ${error.message || 'Error desconocido'}`);
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="inline-block">
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept=".xlsx, .xls, .csv"
            />
            
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all shadow-lg ${
                    status === 'error' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                    status === 'success' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' :
                    'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-900/20'
                }`}
            >
                {isImporting ? <Loader2 className="animate-spin" size={18} /> : 
                 status === 'success' ? <CheckCircle size={18} /> :
                 status === 'error' ? <AlertTriangle size={18} /> :
                 <Upload size={18} />}
                
                {isImporting ? 'Importando...' : 'Importar Excel'}
            </button>
            {message && status === 'error' && (
                <div className="absolute mt-2 p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 max-w-[200px]">
                    {message}
                </div>
            )}
        </div>
    );
}
