import { supabase } from '@/lib/supabaseClient';
import { autoMejorarSkill } from '../services/ai/Optimizer';

export class MantenixAgent {
  private nombreSkill: string;

  constructor(nombreSkill: string = 'mantenix_manager') {
    this.nombreSkill = nombreSkill;
  }

  /**
   * Obtiene las instrucciones y los ejemplos dorados para que el agente aprenda
   */
  async obtenerConfiguracionAgente(): Promise<{ instrucciones: string, ejemplos: any[] }> {
    try {
      // 1. Cargamos las instrucciones (El Prompt de la Skill)
      const { data: skillData, error: skillError } = await supabase
        .from('ai_skills')
        .select('instructions')
        .eq('name', this.nombreSkill)
        .eq('active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (skillError) {
        console.error("No se encontraron instrucciones activas para:", this.nombreSkill);
      }

      // 2. Cargamos el "Dataset Dorado" (Ejemplos de éxito)
      const { data: ejemplos, error: ejemplosError } = await supabase
        .from('ai_examples')
        .select('user_query, perfect_response')
        .eq('skill_name', this.nombreSkill)
        .limit(5);

      if (ejemplosError) {
          console.error("No se pudo cargar el Dataset Dorado.");
      }

      const instruccionesFinales = skillData?.instructions || "Eres un asistente experto.";
      
      // Inyección automática del Esquema de la DB (El "Libro de Reglas")
      const esquemaDB = `
        BASE DE DATOS (REGLAS):
        - Tabla 'boards':id, name, created_at
        - Tabla 'columns': id, board_id, title, order
        - Tabla 'tasks': id, column_id, content, user_id, status, due_date
        - Tabla 'ai_skills': id, name, instructions, version
      `;

      return { 
          instrucciones: `${instruccionesFinales}\n\n${esquemaDB}`, 
          ejemplos: ejemplos || [] 
      };

    } catch (error) {
      console.error('Error cargando configuración:', error);
      return { instrucciones: "Eres un asistente de gestión de proyectos.", ejemplos: [] };
    }
  }

  /**
   * Ejecuta la tarea con el contexto completo (Instrucciones + Ejemplos + Reglas de Negocio)
   */
  async runTask(mensajeUsuario: string, data: any) {
    let configActual = { instrucciones: '', ejemplos: [] as any[] };
    
    try {
        // 1. Cargamos todo el conocimiento dinámico
        configActual = await this.obtenerConfiguracionAgente();
        console.log(`[MantenixAgent] Iniciando con conocimiento dinámico de: ${this.nombreSkill}`);
        
        // Simular ejecución: Validar lógica de negocio (Power Move)
        if (data?.due_date && new Date(data.due_date) < new Date('2024-01-01')) {
            throw new Error('REGLA DE NEGOCIO: No se permiten fechas de entrega históricas o inconsistentes.');
        }

        // Aquí iría la llamada a Gemini 3 con los ejemplos del Golden Dataset
        console.log(`[MantenixAgent] Usando ${configActual.ejemplos.length} ejemplos del Dataset Dorado como guía.`);

        return { 
            success: true, 
            mensaje: `Agente ejecutado con éxito bajo reglas de Supabase.`,
            contexto: configActual
        };

    } catch (error: any) {
        console.log("¡ALERTA!: Error detectado. Enviando reporte al Optimizer...");
        
        // Llamamos al Optimizer para que mejore el Libro de Reglas
        await autoMejorarSkill(error.message, configActual.instrucciones, this.nombreSkill);
        
        return { 
            success: false, 
            reparado: true,
            mensaje: "He detectado una inconsistencia de negocio, pero ya he aprendido de ella y he actualizado mis reglas.",
            error: error.message
        };
    }
  }
}
