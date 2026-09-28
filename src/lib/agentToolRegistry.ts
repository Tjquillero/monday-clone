/**
 * Tool Registry: Governed Agent Tool Management (Hito 7.1A v1.0)
 *
 * Axiomas de Gobierno:
 * 1. Cada herramienta disponible para el agente declara explícitamente su scope, riskClass y permisos.
 * 2. Validación previa de esquema de argumentos e invarianza de permisos antes del despacho.
 * 3. Prohibición estricta de "acceso por defecto" (Fail-Closed).
 */

import { ToolDeclaration } from '@/types/agentRuntime';

class GovernedToolRegistry {
  private tools: Map<string, ToolDeclaration> = new Map();

  constructor() {
    this.registerBuiltInTools();
  }

  /**
   * Registra una herramienta gobernada en el catálogo
   */
  registerTool<TInput = unknown, TOutput = unknown>(
    declaration: ToolDeclaration<TInput, TOutput>
  ): void {
    this.tools.set(declaration.toolName, declaration as ToolDeclaration);
  }

  /**
   * Obtiene la declaración de una herramienta por su nombre
   */
  getTool(toolName: string): ToolDeclaration | null {
    return this.tools.get(toolName) || null;
  }

  /**
   * Retorna la lista de todas las herramientas registradas
   */
  listTools(): ToolDeclaration[] {
    return Array.from(this.tools.values());
  }

  /**
   * Limpia el registro (útil para pruebas)
   */
  clear(): void {
    this.tools.clear();
    this.registerBuiltInTools();
  }

  /**
   * Herramientas built-in gobernadas de prueba/demostración
   */
  private registerBuiltInTools(): void {
    // 1. Tool de lectura de eventos de observabilidad (Clase A - READ_ONLY)
    this.registerTool({
      toolName: 'readObservabilityEvents',
      description: 'Lee el buffer de sobres de eventos de observabilidad H7.1',
      scope: 'READ_ONLY',
      riskClass: 'LOW',
      allowedLifecycleStates: ['OBSERVING', 'CONTEXTUALIZING', 'REASONING'],
      requiresHumanApproval: false,
      hasProductionSideEffects: false,
      validateInput: (input) => typeof input === 'object' && input !== null,
    });

    // 2. Tool de evaluación analítica OMA-01 (Clase A - READ_ONLY)
    this.registerTool({
      toolName: 'evaluateMemoryAnalytics',
      description: 'Consulta analítica de métricas y patrones de memoria en OMA-01',
      scope: 'READ_ONLY',
      riskClass: 'LOW',
      allowedLifecycleStates: ['CONTEXTUALIZING', 'REASONING'],
      requiresHumanApproval: false,
      hasProductionSideEffects: false,
    });

    // 3. Tool de ejecución de pruebas Jest en Sandbox (Clase A - WORKSPACE_SANDBOX)
    this.registerTool({
      toolName: 'runJestValidation',
      description: 'Ejecuta validación de pruebas Jest exclusivamente en Workspace Sandbox local',
      scope: 'WORKSPACE_SANDBOX',
      riskClass: 'MEDIUM',
      allowedLifecycleStates: ['REQUESTING_ACTION', 'POLICY_CHECK'],
      requiresHumanApproval: false,
      hasProductionSideEffects: false,
    });

    // 4. Tool de mutación contractual POA (Clase B - CONTRACTUAL_WRITE -> ESCALATE_TO_HUMAN)
    this.registerTool({
      toolName: 'updateContractualPOA',
      description: 'Propuesta de actualización de valores contractuales en POA',
      scope: 'CONTRACTUAL_WRITE',
      riskClass: 'CRITICAL',
      allowedLifecycleStates: ['REQUESTING_ACTION'],
      requiresHumanApproval: true,
      hasProductionSideEffects: false,
    });

    // 5. Tool de infraestructura DDL (INFRASTRUCTURE -> DENY_STRICT)
    this.registerTool({
      toolName: 'executeDatabaseDDL',
      description: 'Ejecución de cambios DDL o migraciones SQL en base de datos',
      scope: 'INFRASTRUCTURE',
      riskClass: 'CRITICAL',
      allowedLifecycleStates: [],
      requiresHumanApproval: true,
      hasProductionSideEffects: true,
    });
  }
}

export const agentToolRegistry = new GovernedToolRegistry();
