
'use client';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Group } from '@/types/monday';

interface InitFinancialGroupsProps {
  boardId: string | null;
  groups: Group[];
  initDone?: boolean;
  onInitComplete?: () => void;
}

export default function InitFinancialGroups({ boardId, groups, initDone, onInitComplete }: InitFinancialGroupsProps) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || initDone || !boardId || groups.length === 0) return;
    
    const initGroups = async () => {
      // 1. Heuristic check: If the board has ANY items at all, we consider it initialized or in-use.
      // This prevents "resurrecting" deleted items when the user starts customizing the board.
      const hasAnyItems = groups.some(g => g.items.length > 0);
      
      if (hasAnyItems) {
          console.log(`[Init] Board ${boardId} is already in use. Skipping auto-init.`);
          initialized.current = true;
          if (onInitComplete) onInitComplete();
          return;
      }

      console.log(`[Init] Checking if board ${boardId} needs initial financial groups...`);
      initialized.current = true;
      
      const defaultRubros = ['Nómina', 'Insumos', 'Transporte', 'Fijo', 'Caja Menor'];
      
      // Double check server-side for this specific board to avoid race conditions
      const groupIds = groups.map(g => g.id);
      const { data: existingFinancialItems } = await supabase
        .from('items')
        .select('id')
        .in('group_id', groupIds)
        .eq('values->>item_type', 'financial')
        .limit(1);
        
      if (existingFinancialItems && existingFinancialItems.length > 0) {
          console.log("[Init] Server confirms financial items exist. Aborting re-init.");
          if (onInitComplete) onInitComplete();
          return;
      }

      console.log("[Init] Creating default financial rubros...");
      
      const targetGroupId = groups[0].id;

      for (const rubro of defaultRubros) {
            await supabase.from('items').insert({
              group_id: targetGroupId,
              name: "General",
              values: {
                  rubro: rubro,
                  category: 'General',
                  unit: 'Gl',
                  cant: 0,
                  unit_price: 0,
                  item_type: 'financial'
              },
              position: 999
          });
      }
      
      console.log("[Init] Default financial groups created.");
      if (onInitComplete) onInitComplete();
    };

    initGroups();
  }, [boardId, groups]);

  return null;
}
