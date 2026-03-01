'use client';

import { useState, useEffect } from 'react';
import { Bell, X, Check, Info, AlertTriangle, CheckCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'alert' | 'success' | 'mention';
    read: boolean;
    created_at: string;
    link?: string;
}

import NewsModal from '@/components/modals/NewsModal';

export default function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        fetchNotifications();

        // Real-time listener for new notifications
        const channel = supabase
            .channel('public:notifications')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                (payload) => {
                    const newNotif = payload.new as Notification;
                    setNotifications(prev => [newNotif, ...prev]);
                    setUnreadCount(prev => prev + 1);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchNotifications = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (data) {
            setNotifications(data);
            setUnreadCount(data.filter(n => !n.read).length);
        }
    };

    const markAsRead = async (id: string) => {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', id);

        if (!error) {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'alert': return <AlertTriangle size={16} className="text-rose-500" />;
            case 'success': return <CheckCircle size={16} className="text-emerald-500" />;
            case 'mention': return <Info size={16} className="text-blue-500" />;
            default: return <Info size={16} className="text-slate-400" />;
        }
    };

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all rounded-xl border border-transparent hover:border-slate-100"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white">
                        {unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                        <motion.div 
                            initial={{ opacity: 0, x: -10, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -10, scale: 0.95 }}
                            className="absolute left-full top-0 ml-4 w-80 bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100 z-50 overflow-hidden font-sans"
                        >
                            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                                <h3 className="text-slate-900 font-black text-sm uppercase tracking-widest">Notificaciones</h3>
                                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="max-h-[350px] overflow-y-auto no-scrollbar">
                                {notifications.length === 0 ? (
                                    <div className="p-12 text-center text-slate-400 text-xs font-medium">
                                        No hay notificaciones nuevas
                                    </div>
                                ) : (
                                    notifications.map(n => (
                                        <div 
                                            key={n.id} 
                                            className={`p-5 border-b border-slate-50 transition-colors hover:bg-slate-50 relative group ${!n.read ? 'bg-emerald-50/20' : ''}`}
                                        >
                                            <div className="flex gap-4">
                                                <div className="mt-1">{getIcon(n.type)}</div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start">
                                                        <h4 className={`text-slate-800 font-bold text-xs ${!n.read ? 'text-emerald-700' : ''}`}>{n.title}</h4>
                                                        <span className="text-[10px] text-slate-400 font-medium italic">
                                                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-500 text-[11px] leading-relaxed mt-1">{n.message}</p>
                                                    
                                                    {!n.read && (
                                                        <button 
                                                            onClick={() => markAsRead(n.id)}
                                                            className="mt-3 flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <Check size={12} /> Marcar como leída
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {notifications.length > 0 && (
                                <div className="p-4 bg-slate-50/50 text-center">
                                    <Link 
                                        href="/dashboard?view=notifications" 
                                        onClick={() => setIsOpen(false)}
                                        className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest block"
                                    >
                                        Ver Todo
                                    </Link>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
