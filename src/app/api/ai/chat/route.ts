import { NextResponse } from 'next/server';
import { MantenixAgent } from '@/agents/MantenixAgent';

export async function POST(req: Request) {
  try {
    const { message, data } = await req.json();
    
    // Instanciamos el agente principal con la skill de producción
    const agent = new MantenixAgent('test_skill');
    
    // Ejecutamos la tarea con el mensaje del usuario y datos opcionales
    const result = await agent.runTask(message, data || {});

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[API Chat] Error fatal:', error.message);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
