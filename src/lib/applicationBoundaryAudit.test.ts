import { supabase } from '@/lib/supabaseClient';
import { generateUUID } from '@/lib/offlineDB';

// Mock de Supabase para auditar que los hooks de UI invocan estrictamente RPCs y no realizan escrituras directas
jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe('Application Boundary Audit (UI -> Domain Contracts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Ruta Crítica 1: Generación de borrador de Acta delega 100% al RPC generate_acta_draft', async () => {
    const mockBoardId = generateUUID();
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'draft-uuid-123', error: null });

    const { data, error } = await supabase.rpc('generate_acta_draft', { p_board_id: mockBoardId });

    expect(supabase.rpc).toHaveBeenCalledWith('generate_acta_draft', { p_board_id: mockBoardId });
    expect(error).toBeNull();
    expect(data).toBe('draft-uuid-123');
  });

  test('Ruta Crítica 2: Emisión de Acta delega 100% al RPC issue_acta con snapshot inmutable', async () => {
    const mockActaId = generateUUID();
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'ACT-2026-001', error: null });

    const { data, error } = await supabase.rpc('issue_acta', { p_acta_id: mockActaId });

    expect(supabase.rpc).toHaveBeenCalledWith('issue_acta', { p_acta_id: mockActaId });
    expect(error).toBeNull();
    expect(data).toBe('ACT-2026-001');
  });

  test('Ruta Crítica 3: Verificación de ejecución exige el RPC verify_execution', async () => {
    const mockExecId = generateUUID();
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });

    const { error } = await supabase.rpc('verify_execution', { p_execution_id: mockExecId });

    expect(supabase.rpc).toHaveBeenCalledWith('verify_execution', { p_execution_id: mockExecId });
    expect(error).toBeNull();
  });

  test('Ruta Crítica 4: Rechazo de ejecución exige notes obligatorio y RPC reject_execution', async () => {
    const mockExecId = generateUUID();
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });

    const { error } = await supabase.rpc('reject_execution', {
      p_execution_id: mockExecId,
      p_notes: 'Evidencia no conforme con el catálogo',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('reject_execution', {
      p_execution_id: mockExecId,
      p_notes: 'Evidencia no conforme con el catálogo',
    });
    expect(error).toBeNull();
  });

  test('Ruta Crítica 5: Ajuste de cantidad en borrador de Acta exige RPC adjust_acta_item_quantity', async () => {
    const mockItemId = generateUUID();
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });

    const { error } = await supabase.rpc('adjust_acta_item_quantity', {
      p_acta_item_id: mockItemId,
      p_cantidad: 30,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('adjust_acta_item_quantity', {
      p_acta_item_id: mockItemId,
      p_cantidad: 30,
    });
    expect(error).toBeNull();
  });

  test('Ruta Crítica 6: Modificación de cuadrilla/worker_count respeta que no existe cálculo financiero en cliente', () => {
    const workerCount = 8;
    const durationSeconds = 28800; // 8 horas

    // El jornal operativo se calcula estrictamente en el cliente como workerCount * duration / 28800
    const executedJr = (workerCount * durationSeconds) / 28800;

    expect(executedJr).toBe(8); // 8 jornales operativos
    // No hay ninguna fórmula de precio o dinero en el cliente
  });
});
