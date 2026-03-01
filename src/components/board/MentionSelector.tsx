'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { User } from 'lucide-react';

interface Profile {
    id: string;
    full_name: string;
    avatar_url: string | null;
}

interface MentionSelectorProps {
    searchQuery: string;
    onSelect: (profile: Profile) => void;
    onClose: () => void;
}

export default function MentionSelector({ searchQuery, onSelect, onClose }: MentionSelectorProps) {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProfiles();
    }, []);

    const fetchProfiles = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url')
                .order('full_name');
            
            if (error) throw error;
            setProfiles(data || []);
        } catch (error) {
            console.error('Error fetching profiles for mentions:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredProfiles = profiles.filter(p => 
        p.full_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filteredProfiles.length === 0 && !loading) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50"
        >
            <div className="p-2 bg-slate-50 border-b border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mencionar a...</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
                {loading ? (
                    <div className="p-4 text-center text-xs text-slate-400">Cargando equipo...</div>
                ) : (
                    filteredProfiles.map((profile) => (
                        <button
                            key={profile.id}
                            onClick={() => onSelect(profile)}
                            className="w-full flex items-center px-4 py-2.5 hover:bg-primary/5 text-left transition-colors group"
                        >
                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center mr-3 border border-slate-200 group-hover:border-primary/20 overflow-hidden">
                                {profile.avatar_url ? (
                                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" />
                                )}
                            </div>
                            <span className="text-sm font-bold text-slate-700 group-hover:text-primary transition-colors">
                                {profile.full_name}
                            </span>
                        </button>
                    ))
                )}
            </div>
        </motion.div>
    );
}
