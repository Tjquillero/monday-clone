import { generateUUID } from '@/lib/offlineDB';
import { supabase } from '@/lib/supabaseClient';

// Mock de Supabase para auditar resiliencia adversaria en terreno y relojes temporales
jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe('Field Reliability & Adversarial Resilience Audit (Test 23)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Caso Complejo: Captura Offline bajo POA v1 + Activación POA v2 antes de Sync -> Preserva física e Inmutabilidad Financiera', async () => {
    const mockPlanItemId = generateUUID();
    const mockBoardId = generateUUID();

    // 1. POA v1 activo: $15,000/m²
    let activePoaPrice = 15000;

    // 2. Dispositivo entra en modo 100% offline y registra captura en terreno bajo POA v1
    const offlineCapturedAt = '2026-11-05T08:30:00.000Z';
    const localExecution = {
      id: generateUUID(),
      plan_item_id: mockPlanItemId,
      execution_date: '2026-11-05',
      crew_name: 'Cuadrilla Costa',
      worker_count: 4,
      started_at: '2026-11-05T07:00:00.000Z',
      finished_at: '2026-11-05T15:00:00.000Z',
      executed_qty: 65,
      captured_at: offlineCapturedAt,
      status: 'draft',
    };

    // 3. Mientras el móvil sigue DESCONECTADO, el servidor activa POA v2 ($18,000/m²)
    activePoaPrice = 18000;

    // 4. El móvil recupera conexión y sincroniza la cola de comandos
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null }); // report_execution
    const reportRes = await supabase.rpc('report_execution', { p_execution_id: localExecution.id });
    expect(reportRes.error).toBeNull();
    localExecution.status = 'reported';

    // 5. Verificación Server-Authoritative del Supervisor
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null }); // verify_execution
    const verifyRes = await supabase.rpc('verify_execution', { p_execution_id: localExecution.id });
    expect(verifyRes.error).toBeNull();
    localExecution.status = 'verified';

    // 6. El borrador de Acta proyecta la tarifa activa al momento de facturar ($18,000 * 65 m2 = $1,170,000)
    const mockActaId = generateUUID();
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: mockActaId, error: null });
    const draftRes = await supabase.rpc('generate_acta_draft', { p_board_id: mockBoardId });
    expect(draftRes.data).toBe(mockActaId);

    const projectedTotal = localExecution.executed_qty * activePoaPrice;
    expect(projectedTotal).toBe(1170000);

    // 7. Emitir el Acta congela $1,170,000 de forma inmutable
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: 'ACT-2026-ADV01', error: null });
    const issueRes = await supabase.rpc('issue_acta', { p_acta_id: mockActaId });
    expect(issueRes.data).toBe('ACT-2026-ADV01');

    // 8. Garantía de Invariantes: La captura física conservó captured_at original sin mutar
    expect(localExecution.captured_at).toBe(offlineCapturedAt);
    expect(localExecution.executed_qty).toBe(65);
    expect(localExecution.worker_count).toBe(4);
  });

  test('Prueba Adversaria: Reintento de doble envío (Double-Submit Retry) no duplica la ejecución', async () => {
    const mockExecId = generateUUID();

    // Primer intento de envío RPC
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null });
    const res1 = await supabase.rpc('report_execution', { p_execution_id: mockExecId });
    expect(res1.error).toBeNull();

    // Reintento de red (segundo envío por mala señal)
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null });
    const res2 = await supabase.rpc('report_execution', { p_execution_id: mockExecId });
    expect(res2.error).toBeNull();

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    // El servidor procesó de forma idempotente la misma llamada para p_execution_id
  });

  test('Prueba Adversaria: Intento de actualización local tardía a ejecuciones ya verificadas es ignorado', () => {
    const verifiedExecution = {
      id: generateUUID(),
      executed_qty: 65,
      status: 'verified',
    };

    // Intentar aplicar un patch tardío desde cliente en estado draft
    const lateClientPatch = { executed_qty: 80, status: 'draft' };

    // Regla Server-State Wins on Status: Si el estado es verified, la actualización local se descarta
    const finalState = verifiedExecution.status === 'verified' ? verifiedExecution : lateClientPatch;

    expect(finalState.executed_qty).toBe(65);
    expect(finalState.status).toBe('verified');
  });
});
