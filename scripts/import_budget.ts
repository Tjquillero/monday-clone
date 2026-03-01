
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Manual env vars to avoid parsing issues
const SUPABASE_URL = 'https://azhkbijknwywpqtgknus.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6aGtiaWprbnd5d3BxdGdrbnVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNTgyODQsImV4cCI6MjA4NDkzNDI4NH0.Jb0K8RcVf3b8cf6cH8UDxydzdXqSBI0dvqNensqNBnM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    console.log('Starting import...');

    // 1. Check/Create Group
    // We'll assume a single board for now.
    const { data: boards } = await supabase.from('boards').select('id').limit(1);
    if (!boards || boards.length === 0) {
        console.error('No boards found. Please create a board first.');
        process.exit(1);
    }
    const boardId = boards[0].id;

    // Check for existing groups
    let targetGroupId: string;
    const { data: groups } = await supabase.from('groups').select('id, title').eq('board_id', boardId);

    if (groups && groups.length > 0) {
        // Try to find one named similarly or just pick the first one
        const budgetGroup = groups.find(g => g.title.toUpperCase().includes('PRESUPUESTO'));
        if (budgetGroup) {
            targetGroupId = budgetGroup.id;
            console.log(`Using existing group: ${budgetGroup.title}`);
        } else {
            targetGroupId = groups[0].id;
            console.log(`Using existing group: ${groups[0].title}`);
        }
    } else {
        // Create new group
        console.log('Creating new group: PRESUPUESTO GENERAL');
        const { data: newGroup, error } = await supabase.from('groups').insert({
            board_id: boardId,
            title: 'PRESUPUESTO GENERAL',
            color: '#579bfc',
            position: 0
        }).select().single();

        if (error) {
            console.error('Error creating group:', error);
            process.exit(1);
        }
        targetGroupId = newGroup.id;
    }

    // 2. Read Excel
    const filePath = path.join(process.cwd(), 'ACTIVIDADES-ACTA.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Skip header (Row 0)
    const dataRows = rows.slice(1);

    console.log(`Found ${dataRows.length} rows to import.`);

    let importedCount = 0;

    for (const row of dataRows) {
        // Row structure: [Code, Desc, Unit, Qty, UnitPrice]
        // Example: ["1.01", "SUMINISTRO...", "M2-MES", 1, 1356.35]
        
        const code = row[0] ? String(row[0]).trim() : '';
        const desc = row[1] ? String(row[1]).trim() : '';
        const unit = row[2] ? String(row[2]).trim() : 'UND';
        const qty = parseFloat(row[3]) || 1;
        const unitPrice = parseFloat(row[4]) || 0;

        if (!desc) continue;

        const fullName = `${code} ${desc}`;

        const itemValues = {
            unit: unit,
            cant: qty,
            unit_price: unitPrice,
            budget: qty * unitPrice,
            // Add other fields if necessary
        };

        const { error: insertError } = await supabase.from('items').insert({
            name: fullName,
            group_id: targetGroupId,
            board_id: boardId,
            item_type: 'financial',
            values: itemValues
        });

        if (insertError) {
            console.error(`Error importing ${fullName}:`, insertError.message);
        } else {
            importedCount++;
             if (importedCount % 10 === 0) process.stdout.write('.');
        }
    }

    console.log(`\nImport completed. Imported ${importedCount} items.`);
}

main().catch(console.error);
