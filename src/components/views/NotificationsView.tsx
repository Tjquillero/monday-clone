'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Bell, Check, Trash2, Mail, Info, AlertTriangle, Filter, ChevronRight, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'alert' | 'success' | 'mention';
    read: boolean;
    created_at: string;
    link?: string;
}

export default function NotificationsView() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread' | 'mentions'>('all');

    useEffect(() => {
        fetchNotifications();

        const channel = supabase
            .channel('notifications_view')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notifications' },
                () => fetchNotifications()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchNotifications = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let query = supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        const { data, error } = await query;
        if (data) setNotifications(data);
        setLoading(false);
    };

    const markAllAsRead = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        await supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', user.id)
            .eq('read', false);
    };

    const deleteHistory = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        if (confirm('¿Estás seguro de que deseas eliminar todo el historial de notificaciones?')) {
            await supabase
                .from('notifications')
                .delete()
                .eq('user_id', user.id);
        }
    };

    const filtered = notifications.filter(n => {
        if (filter === 'unread') return !n.read;
        if (filter === 'mentions') return n.type === 'mention';
        return true;
    });

    const getIcon = (type: string) => {
        switch (type) {
            case 'mention': return <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><User size={20} /></div>;
            case 'alert': return <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><AlertTriangle size={20} /></div>;
            default: return <div className="p-2 bg-slate-50 text-slate-400 rounded-lg"><Info size={20} /></div>;
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#f8f9fb]">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 flex items-center justify-center rounded-xl text-primary">
                            <Bell size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Centro de Notificaciones</h1>
                            <p className="text-sm text-slate-500 font-medium italic">Gestiona tus menciones, alertas y actualizaciones de equipo.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={markAllAsRead}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-lg transition-all border border-slate-200"
                        >
                            <Check size={14} /> Marcar todo como leído
                        </button>
                        <button 
                            onClick={deleteHistory}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-rose-100"
                        >
                            <Trash2 size={14} /> Limpiar historial
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-xl w-max">
                    <button 
                        onClick={() => setFilter('all')}
                        className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${filter === 'all' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Todas
                    </button>
                    <button 
                        onClick={() => setFilter('unread')}
                        className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${filter === 'unread' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Sin leer ({notifications.filter(n => !n.read).length})
                    </button>
                    <button 
                        onClick={() => setFilter('mentions')}
                        className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${filter === 'mentions' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Menciones
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-8 py-6 no-scrollbar">
                <div className="max-w-4xl mx-auto space-y-3">
                    <AnimatePresence mode="popLayout">
                        {loading ? (
                            <div className="text-center py-20 animate-pulse text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando notificaciones...</div>
                        ) : filtered.length === 0 ? (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100"
                            >
                                <Mail className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                <p className="text-sm text-slate-400 font-medium">No hay notificaciones para mostrar aquí.</p>
                            </motion.div>
                        ) : (
                            filtered.map((n) => (
                                <motion.div
                                    key={n.id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className={`flex items-start gap-4 p-5 bg-white rounded-2xl border transition-all hover:shadow-lg hover:shadow-slate-200/50 group ${!n.read ? 'border-primary/20 bg-primary/5' : 'border-slate-100 hover:border-slate-200'}`}
                                >
                                    {getIcon(n.type)}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <h3 className={`text-sm font-black ${!n.read ? 'text-primary' : 'text-slate-800'}`}>{n.title}</h3>
                                            <span className="text-[10px] text-slate-400 font-medium italic">
                                                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-600 leading-relaxed mb-3">{n.message}</p>
                                        
                                        <div className="flex items-center justify-between">
                                            {n.link && (
                                                <Link 
                                                    href={n.link}
                                                    className="flex items-center gap-1.5 text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                                                >
                                                    Ver detalles <ChevronRight size={12} />
                                                </Link>
                                            )}
                                            {!n.read && (
                                                <button 
                                                    onClick={async () => {
                                                        await supabase.from('notifications').update({ read: true }).eq('id', n.id);
                                                        fetchNotifications();
                                                    }}
                                                    className="px-3 py-1 bg-primary text-white text-[10px] font-black rounded-lg uppercase tracking-widest hover:bg-primary-dark transition-all"
                                                >
                                                    Entendido
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
