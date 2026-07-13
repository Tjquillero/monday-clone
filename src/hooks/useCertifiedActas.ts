import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { CertifiedActa } from '@/types/monday';

// Único punto de acceso al subsistema "Actas certificadas" (Incremento 5).
// La UI nunca llama supabase.from('actas'/'acta_items'/'acta_item_sources')
// directamente ni construye RPCs sueltos — todo pasa por aquí. Ver
// docs/adr/ADR-0003-billing-source.md y docs/architecture/acta-billing-design.md.

const certifiedActaKeys = {
  draft: (boardId?: string) => ['certified-acta-draft', boardId] as const,
  issued: (boardId?: string) => ['certified-actas-issued', boardId] as const,
};

const ACTA_SELECT = '*, items:acta_items(*)';

export const useCertifiedActaDraft = (boardId?: string) => {
  return useQuery({
    queryKey: certifiedActaKeys.draft(boardId),
    queryFn: async () => {
      if (!boardId) return null;
      const { data, error } = await supabase
        .from('actas')
        .select(ACTA_SELECT)
        .eq('board_id', boardId)
        .eq('estado', 'draft')
        .maybeSingle();
      if (error) throw error;
      return data as CertifiedActa | null;
    },
    enabled: !!boardId,
  });
};

export const useCertifiedActasIssued = (boardId?: string) => {
  return useQuery({
    queryKey: certifiedActaKeys.issued(boardId),
    queryFn: async () => {
      if (!boardId) return [];
      const { data, error } = await supabase
        .from('actas')
        .select(ACTA_SELECT)
        .eq('board_id', boardId)
        .eq('estado', 'issued')
        .order('numero', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CertifiedActa[];
    },
    enabled: !!boardId,
  });
};

export const useCertifiedActaMutations = (boardId?: string) => {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: certifiedActaKeys.draft(boardId) });
    queryClient.invalidateQueries({ queryKey: certifiedActaKeys.issued(boardId) });
  };

  const generateDraft = useMutation({
    mutationFn: async () => {
      if (!boardId) throw new Error('boardId requerido');
      const { data, error } = await supabase.rpc('generate_acta_draft', { p_board_id: boardId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });

  const adjustQuantity = useMutation({
    mutationFn: async ({ actaItemId, cantidad }: { actaItemId: string; cantidad: number }) => {
      const { error } = await supabase.rpc('adjust_acta_item_quantity', {
        p_acta_item_id: actaItemId,
        p_cantidad: cantidad,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const issueActa = useMutation({
    mutationFn: async (actaId: string) => {
      const { data, error } = await supabase.rpc('issue_acta', { p_acta_id: actaId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });

  return { generateDraft, adjustQuantity, issueActa };
};
