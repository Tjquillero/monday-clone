'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, LogIn, UserPlus, AlertCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (signUpError) throw signUpError;
        alert('Revisa tu correo para confirmar tu registro.');
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-100"
      >
        {/* Brand Header */}
        <div className="text-center mb-10">
          <Image src="/logo-new.png" alt="Mantenix Logo" width={96} height={96} className="mx-auto mb-4 object-contain" />
          <h1 className="text-4xl font-black text-[#1e1f21] tracking-tight">Mantenix</h1>
          <p className="text-gray-500 mt-2 font-medium">Gestión inteligente de flujos</p>
        </div>

        {/* Toggle Login/Signup */}
        <div className="flex bg-gray-100 p-1 rounded-xl mb-8">
          <button 
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${isLogin ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Iniciar Sesión
          </button>
          <button 
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${!isLogin ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Registrarse
          </button>
        </div>

        <form onSubmit={handleAuth} className="space-y-5">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-center text-red-700 text-sm"
              >
                <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="block text-sm font-bold text-[#323338] mb-2 px-1">Correo Electrónico</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-[#0073ea]/10 focus:border-[#0073ea] transition-all bg-gray-50/50"
                placeholder="nombre@empresa.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-[#323338] mb-2 px-1">Contraseña</label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-[#0073ea]/10 focus:border-[#0073ea] transition-all bg-gray-50/50"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-[#24614b] text-white py-4 rounded-xl flex items-center justify-center font-bold text-lg shadow-xl shadow-green-900/10 transition-all active:scale-95 disabled:opacity-70 disabled:active:scale-100"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                {isLogin ? (
                  <>Iniciar Sesión <LogIn className="w-5 h-5 ml-2" /></>
                ) : (
                  <>Crear Cuenta <UserPlus className="w-5 h-5 ml-2" /></>
                )}
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-gray-400 text-sm font-medium">
            Al continuar aceptas nuestros <button className="text-[#0073ea] hover:underline">Términos de Servicio</button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}