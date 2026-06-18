import { NextResponse } from 'next/server';
import { MantenixAgent } from '@/agents/MantenixAgent';

export async function GET() {
  const agent = new MantenixAgent('test_skill');

  // Caso 1: Regla de Negocio (Power Move)
  console.log('--- TEST 1: Intento de Fecha en el Pasado (Debería fallar y autosanarse) ---');
  const res1 = await agent.runTask('Crear tarea poda para ayer', { due_date: '1990-01-01' });

  // Caso 2: Ejecución Normal (Debería usar el Golden Dataset)
  console.log('--- TEST 2: Consulta Normal con Dataset Dorado ---');
  const res2 = await agent.runTask('¿Qué tareas tengo para hoy?', { });

  return NextResponse.json({
    test_negocio: res1, // Si falló, debería haber activado el Optimizer
    test_normal: res2,
    message: 'Se han ejecutado los tests del agente con Dataset Dorado y Reglas de Negocio. Revisa Supabase (v3).'
  });
}
