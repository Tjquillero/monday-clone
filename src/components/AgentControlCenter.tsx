'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Zap, Cpu, Activity, Wrench } from 'lucide-react';
import { EMPTY_CONVERSATION, trimConversationState, type ConversationState } from '@/services/ai/conversationState';
import type { ToolCitation } from '@/services/ai/orchestrator';
import { getToolDisplayName } from '@/services/ai/tools/displayNames';
import { useAiProactiveSummary } from '@/hooks/useAiProactiveSummary';

// Copiloto del dominio (Incremento 5 en adelante). Cliente muy fino: nunca
// calcula, nunca conoce tablas — solo envía el mensaje del usuario a
// /api/ai/ask, que orquesta Gemini contra el Tool Registry (ver
// src/services/ai/orchestrator.ts). Reemplaza por completo la versión
// anterior (self-healing prompts / ai_skills / reglas hardcodeadas) — ese
// mecanismo no sobrevive aquí, no se adapta.

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: ToolCitation[];
}

// La cita se arma con los mismos datos que ya devolvió el Orchestrator
// (tool + argumentos reales de la llamada) — nunca texto libre del modelo.
// El nombre técnico se traduce a un rótulo natural solo para presentación
// (displayNames.ts); los argumentos crudos se conservan entre paréntesis
// para no perder trazabilidad/auditabilidad.
function formatCitation(c: ToolCitation): string {
  const label = getToolDisplayName(c.tool);
  const args = Object.entries(c.args)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  return args ? `${label} (${args})` : label;
}

// Sin board seleccionado (vistas globales) usa su propio balde de memoria —
// nunca comparte historial con un board real.
const NO_BOARD_KEY = '__no_board__';

interface BoardChatState {
  messages: Message[];
  conversation: ConversationState;
}

export default function AgentControlCenter() {
  const searchParams = useSearchParams();
  const boardId = searchParams?.get('boardId') ?? null;
  const boardKey = boardId ?? NO_BOARD_KEY;

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Memoria conversacional (Opción A), separada POR BOARD: el widget vive
  // montado globalmente (layout.tsx) y no se desmonta al cambiar de board,
  // así que sin este balde por board_id el historial de un board se
  // filtraría al siguiente ("este contrato", "la última acta" resolverían
  // mal). Cada entrada guarda tanto los `messages` (solo para pintar la UI)
  // como el `ConversationState` opaco que viaja al Orchestrator. Vive en un
  // ref, no en estado de React — cambiar de board no debe re-renderizar nada
  // por sí solo. Se pierde al recargar la página, igual que la memoria base.
  const chatStoreRef = useRef<Map<string, BoardChatState>>(new Map());
  const boardKeyRef = useRef<string>(boardKey);

  // Sugerencia proactiva: solo se calcula si el panel está abierto y la
  // conversación de este board sigue vacía — desaparece en cuanto el
  // usuario envía un mensaje real (deja de cumplirse messages.length===0).
  // No es un turno de Gemini ni se guarda en el historial: es un aviso vivo
  // de la app, recalculado cada vez que aplica.
  const { data: proactiveSummary } = useAiProactiveSummary(boardId, isOpen && messages.length === 0);

  useEffect(() => {
    boardKeyRef.current = boardKey;
    setMessages(chatStoreRef.current.get(boardKey)?.messages ?? []);
  }, [boardKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');

    // El board de destino se fija al momento de enviar: si el usuario
    // cambia de board mientras la respuesta está en vuelo, esta respuesta
    // debe actualizar el balde del board ORIGINAL, nunca el que quede
    // activo en pantalla en ese momento.
    const targetBoardKey = boardKeyRef.current;
    const before = chatStoreRef.current.get(targetBoardKey) ?? { messages: [], conversation: EMPTY_CONVERSATION };
    const withUserMsg: Message[] = [...before.messages, { role: 'user', content: userMsg }];
    chatStoreRef.current.set(targetBoardKey, { messages: withUserMsg, conversation: before.conversation });
    if (boardKeyRef.current === targetBoardKey) setMessages(withUserMsg);
    setIsLoading(true);

    try {
      // Recorte antes de enviar (reduce el tamaño de la petición) — el
      // Orchestrator también recorta defensivamente al recibirlo, así que
      // un cliente que no recortara no rompería nada, solo enviaría de más.
      const historyToSend = trimConversationState(before.conversation);

      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          boardId: targetBoardKey === NO_BOARD_KEY ? null : targetBoardKey,
          history: historyToSend,
        }),
      });
      const data = await res.json();

      const latest = chatStoreRef.current.get(targetBoardKey) ?? { messages: withUserMsg, conversation: before.conversation };
      const newMessages: Message[] = res.ok
        ? [...latest.messages, { role: 'assistant', content: data.text, citations: data.citations }]
        : [...latest.messages, { role: 'assistant', content: `Error: ${data.error || 'algo salió mal.'}` }];
      const newConversation: ConversationState = res.ok && data.history ? data.history : latest.conversation;

      chatStoreRef.current.set(targetBoardKey, { messages: newMessages, conversation: newConversation });
      if (boardKeyRef.current === targetBoardKey) setMessages(newMessages);
    } catch {
      const latest = chatStoreRef.current.get(targetBoardKey) ?? { messages: withUserMsg, conversation: before.conversation };
      const newMessages: Message[] = [...latest.messages, { role: 'assistant', content: 'No pude conectar con el copiloto. Intenta de nuevo.' }];
      chatStoreRef.current.set(targetBoardKey, { ...latest, messages: newMessages });
      if (boardKeyRef.current === targetBoardKey) setMessages(newMessages);
    } finally {
      if (boardKeyRef.current === targetBoardKey) setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-[200]">
      <motion.button
        whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(59, 126, 248, 0.4)' }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-18 h-18 rounded-[2rem] shadow-2xl flex items-center justify-center relative border-2 overflow-hidden group transition-all duration-500 ${isOpen ? 'bg-[#3B7EF8] border-white/20' : 'bg-[var(--bg-primary)] border-[var(--border-color)]'}`}
        style={{ width: '72px', height: '72px' }}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-[#3B7EF8]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${isOpen ? 'rotate-180 scale-0 opacity-0' : 'scale-100 opacity-100'}`}>
          <Cpu className="w-8 h-8 text-[#3B7EF8]" />
        </div>
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${isOpen ? 'scale-100 opacity-100' : 'scale-0 -rotate-180 opacity-0'}`}>
          <X className="w-8 h-8 text-white" />
        </div>
        {!isOpen && (
          <div className="absolute inset-0 rounded-[2rem] border-2 border-[#3B7EF8]/30 animate-ping opacity-20 pointer-events-none" />
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 40, scale: 0.9, filter: 'blur(10px)' }}
            className="absolute bottom-24 right-0 w-[420px] h-[680px] bg-[var(--bg-secondary)] rounded-[3rem] shadow-[0_30px_100px_rgba(0,0,0,0.6)] overflow-hidden border border-[var(--border-color)] flex flex-col backdrop-blur-2xl"
          >
            <div className="bg-[var(--bg-primary)] p-8 shrink-0 relative overflow-hidden border-b border-[var(--border-color)]">
              <div className="absolute -top-12 -right-12 opacity-5 blur-[80px]">
                <Zap className="w-48 h-48 text-[#3B7EF8]" />
              </div>
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-5">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#3B7EF8] to-[#1E2442] rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(59,126,248,0.3)] border border-[var(--border-color)]">
                    <Bot className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-xl tracking-tighter uppercase italic">Copiloto Mantenix</h3>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">
                        {boardId ? 'Board activo' : 'Sin board seleccionado'}
                      </span>
                    </div>
                  </div>
                </div>
                <Activity className="w-4 h-4 text-emerald-500/50" />
              </div>
            </div>

            <div className="flex-1 overflow-hidden relative bg-[var(--bg-primary)]/30 p-6 flex flex-col">
              <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pr-3 custom-scrollbar">
                {messages.length === 0 && proactiveSummary && (
                  <div className="p-4 rounded-2xl border border-[#3B7EF8]/20 bg-[#3B7EF8]/5 text-[12px] font-medium leading-relaxed text-[var(--text-primary)]">
                    <div className="flex items-center gap-2 mb-2 opacity-60">
                      <Activity className="w-3 h-3 text-[#3B7EF8]" />
                      <span className="text-[8px] font-black uppercase tracking-widest">Aviso automático</span>
                    </div>
                    {proactiveSummary}
                  </div>
                )}
                {messages.length === 0 && !proactiveSummary && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-30">
                    <Bot className="w-16 h-16 mb-6 text-[#3B7EF8]" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] leading-loose">
                      Pregúntame sobre este board.
                      <br />
                      Solo respondo con datos reales del dominio.
                    </p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] p-4 rounded-2xl text-[12px] font-medium leading-relaxed border transition-all ${m.role === 'user' ? 'bg-[#3B7EF8]/10 text-white border-[#3B7EF8]/20 rounded-tr-none' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-color)] rounded-tl-none shadow-xl'}`}
                    >
                      <div className="flex items-center gap-2 mb-2 opacity-50">
                        <span className="text-[8px] font-black uppercase tracking-widest">
                          {m.role === 'user' ? 'Tú' : 'Copiloto'}
                        </span>
                        <div className="h-[1px] flex-1 bg-current opacity-20" />
                      </div>
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      {m.citations && m.citations.length > 0 && (
                        <div className="flex items-start gap-1.5 mt-3 pt-2 border-t border-current/10 opacity-50">
                          <Wrench className="w-3 h-3 mt-[1px] shrink-0" />
                          <span className="text-[8px] font-bold uppercase tracking-wider break-all">
                            Fuente: {m.citations.map(formatCitation).join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[var(--bg-secondary)] p-4 rounded-2xl border border-[var(--border-color)] shadow-xl flex space-x-2 items-center">
                      <div className="w-1.5 h-1.5 bg-[#3B7EF8] rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-[#3B7EF8] rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-[#3B7EF8] rounded-full animate-bounce" />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center space-x-3 bg-[var(--bg-primary)] p-2 rounded-2xl border border-[var(--border-color)] shadow-inner group-focus-within:border-[#3B7EF8]/50 transition-all">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Pregunta algo sobre este board..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-[12px] font-medium text-white px-4 h-12"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isLoading}
                  className="w-12 h-12 bg-[#3B7EF8] text-white rounded-xl flex items-center justify-center shadow-lg shadow-[#3B7EF8]/30 hover:bg-[#2563EB] disabled:opacity-30 transition-all active:scale-90 border border-[var(--border-color)]"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 126, 248, 0.3);
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}
