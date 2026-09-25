'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, X, Check, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
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

export default function NotificationBell() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchNotifications = useCallback(async () => {
        if (!user?.id) {
            setNotifications([]);
            setUnreadCount(0);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) {
                console.warn('[NotificationBell] Failed to fetch notifications:', error.message);
                return;
            }

            if (data) {
                setNotifications(data);
                setUnreadCount(data.filter((n: any) => !n.read).length);
            }
        } catch (err) {
            console.warn('[NotificationBell] Network or auth error fetching notifications:', err instanceof Error ? err.message : String(err));
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;

        fetchNotifications();

        // Real-time listener for new notifications
        const channel = supabase
            .channel(`notifications:${user.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
                (payload: any) => {
                    const newNotif = payload.new as Notification;
                    setNotifications(prev => [newNotif, ...prev]);
                    setUnreadCount(prev => prev + 1);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, fetchNotifications]);

    const markAsRead = async (id: string) => {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('id', id);

            if (!error) {
                setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch (err) {
            console.warn('[NotificationBell] Error marking notification as read:', err);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'alert': return <AlertTriangle size={16} className="text-[var(--color-danger)]" />;
            case 'success': return <CheckCircle size={16} className="text-[var(--color-success)]" />;
            case 'mention': return <Info size={16} className="text-[var(--color-info)]" />;
            default: return <Info size={16} className="text-[var(--text-muted)]" />;
        }
    };

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-subtle)] transition-all rounded-[var(--radius-control)]"
                title="Notificaciones"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[var(--color-danger)] text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-[var(--card-bg)]">
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
                            className="absolute left-full top-0 ml-4 w-80 bg-[var(--card-bg)] rounded-[var(--radius-surface)] shadow-[var(--shadow-floating)] border border-[var(--border-color)] z-50 overflow-hidden font-sans"
                        >
                            <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--color-surface-subtle)]">
                                <h3 className="text-[var(--text-primary)] brand-title text-sm tracking-tight">Notificaciones</h3>
                                <button onClick={() => setIsOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                                {notifications.length === 0 ? (
                                    <div className="p-12 text-center text-[var(--text-muted)] text-xs font-medium">
                                        No hay notificaciones nuevas
                                    </div>
                                ) : (
                                    notifications.map(n => (
                                        <div 
                                            key={n.id} 
                                            className={`p-4 border-b border-[var(--border-color)] transition-colors hover:bg-[var(--color-surface-subtle)] relative group ${!n.read ? 'bg-[var(--color-primary-subtle)]/40' : ''}`}
                                        >
                                            <div className="flex gap-3">
                                                <div className="mt-0.5">{getIcon(n.type)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <h4 className={`text-xs font-bold truncate ${!n.read ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{n.title}</h4>
                                                        <span className="text-[10px] text-[var(--text-muted)] font-medium whitespace-nowrap">
                                                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                                                        </span>
                                                    </div>
                                                    <p className="text-[var(--text-secondary)] text-[11px] leading-relaxed mt-1">{n.message}</p>
                                                    
                                                    {!n.read && (
                                                        <button 
                                                            onClick={() => markAsRead(n.id)}
                                                            className="mt-2.5 flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-accent)] uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity"
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
                                <div className="p-3 bg-[var(--color-surface-subtle)] text-center border-t border-[var(--border-color)]">
                                    <Link 
                                        href="/dashboard?view=notifications" 
                                        onClick={() => setIsOpen(false)}
                                        className="text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] uppercase tracking-wider block"
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
