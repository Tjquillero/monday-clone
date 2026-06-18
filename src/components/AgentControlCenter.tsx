'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, 
  X, 
  Send, 
  History, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  Database,
  ShieldCheck,
  Zap,
  Cpu,
  Terminal,
  Activity
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface SkillVersion {
  id: string;
  version: number;
  instructions: string;
  created_at: string;
  active: boolean;
}

export default function AgentControlCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cargar versiones de la skill
  const fetchVersions = async () => {
    const { data } = await supabase
      .from('ai_skills')
      .select('*')
      .eq('name', 'test_skill')
      .order('version', { ascending: false });
    
    if (data) setVersions(data);
  };

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });

      const data = await res.json();
      
      if (data.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.respuesta }]);
        if (data.reparado) fetchVersions();
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Lo siento, hubo un problema de conexión con Gemini 3." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const activateVersion = async (version: number) => {
    await supabase.from('ai_skills').update({ active: false }).eq('name', 'test_skill');
    await supabase.from('ai_skills').update({ active: true }).eq('name', 'test_skill').eq('version', version);
    fetchVersions();
  };

  return (
    <div className="fixed bottom-8 right-8 z-[200]">
      {/* Botón Flotante Estilo Industrial */}
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
        
        {/* Pulse Ring */}
        {!isOpen && (
            <div className="absolute inset-0 rounded-[2rem] border-2 border-[#3B7EF8]/30 animate-ping opacity-20 pointer-events-none" />
        )}
      </motion.button>

      {/* Panel de Control Industrial */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 40, scale: 0.9, filter: 'blur(10px)' }}
            className="absolute bottom-24 right-0 w-[420px] h-[680px] bg-[var(--bg-secondary)] rounded-[3rem] shadow-[0_30px_100px_rgba(0,0,0,0.6)] overflow-hidden border border-[var(--border-color)] flex flex-col backdrop-blur-2xl"
          >
            {/* Header Modular */}
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
                            <h3 className="font-black text-white text-xl tracking-tighter uppercase italic italic">Control_Center</h3>
                            <div className="flex items-center space-x-2 mt-1">
                                <span className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Neural_Sync_Active</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-mono text-[#3B7EF8] font-black">v3.0_FLASH</span>
                        <Activity className="w-4 h-4 text-emerald-500/50 mt-1" />
                    </div>
                </div>

                {/* Tabs Estilo Dashboard */}
                <div className="flex mt-8 bg-[var(--bg-primary)] p-1.5 rounded-2xl border border-[var(--border-color)] relative z-10 shadow-inner">
                    <button 
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 flex items-center justify-center py-3 rounded-xl text-[10px] font-black tracking-[0.2em] transition-all duration-300 ${activeTab === 'chat' ? 'bg-[#3B7EF8] text-white shadow-lg shadow-[#3B7EF8]/20' : 'text-slate-600 hover:text-slate-400'}`}
                    >
                        <Terminal className="w-3.5 h-3.5 mr-2" /> TERMINAL
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 flex items-center justify-center py-3 rounded-xl text-[10px] font-black tracking-[0.2em] transition-all duration-300 ${activeTab === 'history' ? 'bg-[#3B7EF8] text-white shadow-lg shadow-[#3B7EF8]/20' : 'text-slate-600 hover:text-slate-400'}`}
                    >
                        <History className="w-3.5 h-3.5 mr-2" /> VERSIONS
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative bg-[var(--bg-primary)]/30">
                <AnimatePresence mode="wait">
                    {activeTab === 'chat' ? (
                        <motion.div 
                            key="chat"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="h-full flex flex-col p-6"
                        >
                            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pr-3 custom-scrollbar">
                                {messages.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-20">
                                        <Bot className="w-16 h-16 mb-6 text-[#3B7EF8]" />
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] leading-loose">Waiting_for_Instruction...<br/>Ready_to_Assist_Field_Ops</p>
                                    </div>
                                )}
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] p-4 rounded-2xl text-[12px] font-medium leading-relaxed border transition-all ${m.role === 'user' ? 'bg-[#3B7EF8]/10 text-white border-[#3B7EF8]/20 rounded-tr-none' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-color)] rounded-tl-none shadow-xl'}`}>
                                            <div className="flex items-center gap-2 mb-2 opacity-50">
                                                <span className="text-[8px] font-black uppercase tracking-widest">{m.role === 'user' ? 'Operator' : 'AI_Model'}</span>
                                                <div className="h-[1px] flex-1 bg-current opacity-20" />
                                            </div>
                                            {m.content}
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

                            {/* Tactical Input Area */}
                            <div className="mt-6 flex items-center space-x-3 bg-[var(--bg-primary)] p-2 rounded-2xl border border-[var(--border-color)] shadow-inner group-focus-within:border-[#3B7EF8]/50 transition-all">
                                <input 
                                    type="text" 
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                    placeholder="Execute_Command..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-[11px] font-black uppercase tracking-widest text-white px-4 h-12"
                                />
                                <button 
                                    onClick={handleSendMessage}
                                    disabled={!input.trim() || isLoading}
                                    className="w-12 h-12 bg-[#3B7EF8] text-white rounded-xl flex items-center justify-center shadow-lg shadow-[#3B7EF8]/30 hover:bg-[#2563EB] disabled:opacity-30 transition-all active:scale-90 border border-[var(--border-color)]"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="history"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="h-full overflow-y-auto p-6 space-y-4 custom-scrollbar"
                        >
                            <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-[1.5rem] flex items-start space-x-4 mb-6">
                                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] font-black text-amber-500/70 uppercase tracking-widest leading-relaxed italic">
                                    System Archive: Auto-repair versions detected. Rollback available for tactical redundancy.
                                </p>
                            </div>

                            {versions.map((v) => (
                                <div key={v.id} className={`p-5 rounded-[2rem] border transition-all duration-300 ${v.active ? 'bg-[#3B7EF8]/10 border-[#3B7EF8]/30 shadow-[0_0_20px_rgba(59,126,248,0.1)]' : 'bg-[var(--bg-secondary)] border-[var(--border-color)] hover:border-white/20'}`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center space-x-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border shadow-lg ${v.active ? 'bg-[#3B7EF8] text-white border-white/20' : 'bg-[var(--bg-primary)] text-slate-500 border-[var(--border-color)]'}`}>v{v.version}</div>
                                            <div>
                                                <h4 className="text-[10px] font-black text-white tracking-widest uppercase">System_Patch</h4>
                                                <p className="text-[8px] font-black text-slate-600 mt-1 uppercase tracking-tighter">{new Date(v.created_at).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        {v.active && <CheckCircle2 className="w-5 h-5 text-[#3B7EF8] animate-pulse" />}
                                    </div>
                                    
                                    <div className="bg-[var(--bg-primary)]/50 p-4 rounded-2xl border border-[var(--border-color)] mb-5 italic">
                                        <p className="text-[11px] text-slate-400 font-medium leading-relaxed">"{v.instructions}"</p>
                                    </div>
                                    
                                    {!v.active && (
                                        <button 
                                            onClick={() => activateVersion(v.version)}
                                            className="w-full py-3 bg-slate-500/5 border border-[var(--border-color)] rounded-xl text-[9px] font-black text-[#3B7EF8] hover:bg-[#3B7EF8] hover:text-white transition-all shadow-xl flex items-center justify-center tracking-[0.2em] uppercase"
                                        >
                                            ROLLBACK_TO_V{v.version} <ChevronRight className="w-3 h-3 ml-2" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Tactical Footer */}
            <div className="p-4 bg-[var(--bg-primary)] border-t border-[var(--border-color)] flex items-center justify-between px-8 relative">
                <div className="flex items-center space-x-3 opacity-30 group hover:opacity-100 transition-all cursor-crosshair">
                    <Database className="w-3 h-3 text-[#3B7EF8]" />
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">Supabase_Core_Link_Stable</span>
                </div>
                <div className="flex items-center space-x-1">
                    <div className="w-1 h-1 bg-[#3B7EF8] rounded-full animate-ping" />
                    <span className="text-[8px] font-black text-[#3B7EF8] uppercase tracking-tighter italic">LIVE_FEED</span>
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
