'use client';

import { use } from 'react';
import { UploadCloud, ChevronRight, ShieldAlert, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import PoaImportContainer from '@/components/poa/PoaImportContainer';
import { useAuth } from '@/contexts/AuthContext';
import { isAppAdminUser } from '@/config/navigation';

export default function PoaImportPage({ params }: { params: { poaId: string } | Promise<{ poaId: string }> }) {
  const resolvedParams = params instanceof Promise || (params && typeof (params as any).then === 'function')
    ? use(params as Promise<{ poaId: string }>)
    : (params as { poaId: string });
  const poaId = resolvedParams?.poaId;
  const { user, session, loading } = useAuth();
  const isAdmin = isAppAdminUser(session?.user || user);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // B3: Acceso restringido para no administradores por app_metadata
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center font-sans">
        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl shadow-xl">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Acceso restringido</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Solo los administradores con privilegios en app_metadata pueden importar nuevas versiones del POA.
          </p>
          <Link
            href="/poa"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-primary-hover transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a POA
          </Link>
        </div>
      </div>
    );
  }

  if (!poaId) {
    return <div className="p-8 text-center">No se ha especificado un POA.</div>;
  }

  return (
    <div className="p-4 md:p-8 w-full max-w-[900px] mx-auto font-sans text-slate-800 dark:text-slate-200">
      <div className="mb-6 md:mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2 text-slate-400 text-xs">
            <Link href="/dashboard" className="hover:text-primary transition-colors">Inicio</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/poa" className="hover:text-primary transition-colors">POA</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-600 dark:text-slate-300">Importar POA</span>
          </div>
          <Link
            href="/poa"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Volver a POA
          </Link>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <UploadCloud className="w-8 h-8 mr-3 text-primary" />
          Importar POA
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Sube el Excel oficial del POA para crear una nueva versión.
        </p>
      </div>

      <PoaImportContainer poaId={poaId} />
    </div>
  );
}
