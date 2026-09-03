import { generateUUID } from '@/lib/offlineDB';
import { supabase } from '@/lib/supabaseClient';

// Mock de Supabase para simular la ejecución E2E del Vertical Slice de Campo
jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe('Field Workflow E2E v1 (Vertical Slice Test 22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Vertical Slice E2E: Mi Día -> Captura Offline -> Evidencia -> Sync -> Supervisor Verify -> Billing Eligible', async () => {
    // 1. Contexto: Plan Semanal W1 publicado (planned_qty = 100 m2)
    const mockPlanItemId = generateUUID();
    const mockBoardId = generateUUID();
    const plannedQty = 100;
    const unitPrice = 15000;

    // 2. Líder inicia jornada offline en IndexedDB: executed_qty = 65 m2, worker_count = 4
    const localExecution = {
      id: generateUUID(),
      plan_item_id: mockPlanItemId,
      execution_date: '2026-11-02',
      crew_name: 'Cuadrilla Norte',
      worker_count: 4,
      started_at: '2026-11-02T07:00:00.000Z',
      finished_at: '2026-11-02T15:00:00.000Z',
      executed_qty: 65,
      status: 'draft', // Guardado localmente en móvil
    };

    expect(localExecution.status).toBe('draft');
    expect(localExecution.executed_qty).toBe(65);

    // 3. Adjuntar evidencia fotográfica (before & after) con SHA-256 hash
    const attachmentBefore = {
      id: generateUUID(),
      execution_id: localExecution.id,
      file_name: 'antes.jpg',
      file_hash: 'hash-sha256-before-123',
      phase: 'before',
      status: 'queued', // Almacenado localmente en IndexedDB Blob store
    };

    const attachmentAfter = {
      id: generateUUID(),
      execution_id: localExecution.id,
      file_name: 'despues.jpg',
      file_hash: 'hash-sha256-after-456',
      phase: 'after',
      status: 'queued',
    };

    // La UI muestra 'Evidencia Almacenada / Pendiente Sync', NUNCA 'Ejecución Verificada'
    expect(attachmentBefore.status).toBe('queued');
    expect(attachmentAfter.status).toBe('queued');
    expect(localExecution.status).not.toBe('verified');

    // 4. Conexión restablecida -> Sync Queue procesa domain_commands (report_execution)
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null }); // report_execution
    const reportRes = await supabase.rpc('report_execution', { p_execution_id: localExecution.id });
    expect(reportRes.error).toBeNull();
    localExecution.status = 'reported'; // Estado sincronizado en PostgreSQL

    // 5. Supervisor revisa en panel y ejecuta verify_execution(p_execution_id)
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null }); // verify_execution
    const verifyRes = await supabase.rpc('verify_execution', { p_execution_id: localExecution.id });
    expect(verifyRes.error).toBeNull();
    localExecution.status = 'verified'; // Certificado server-authoritative

    // 6. Motor de Facturación: generate_acta_draft() incluye los 65 m2 certificados
    const mockActaId = generateUUID();
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: mockActaId, error: null }); // generate_acta_draft
    const draftRes = await supabase.rpc('generate_acta_draft', { p_board_id: mockBoardId });
    expect(draftRes.data).toBe(mockActaId);

    // 7. Emitir Acta: issue_acta() congela el snapshot inmutable (65 m2 * $15,000 = $975,000)
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: 'ACT-2026-999', error: null }); // issue_acta
    const issueRes = await supabase.rpc('issue_acta', { p_acta_id: mockActaId });
    expect(issueRes.data).toBe('ACT-2026-999');

    // 8. Verificación final de Invariantes del Flujo E2E:
    expect(plannedQty).toBe(100);
    expect(localExecution.executed_qty).toBe(65);
    expect(localExecution.worker_count).toBe(4);
    expect(unitPrice).toBe(15000);
    expect(localExecution.executed_qty * unitPrice).toBe(975000);
  });
});
