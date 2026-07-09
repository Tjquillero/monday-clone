'use client';

// Verificación — superficie del SUPERVISOR (ver src/config/navigation.ts).
// Bandeja de jornadas reportadas: verificar o observar, una por una.

import { ShieldCheck, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import VerificationContainer from '@/components/verification/VerificationContainer';

export default function VerificationPage() {
  return (
    <div className="p-4 md:p-8 w-full max-w-[900px] mx-auto font-sans text-slate-800">
      <div className="mb-6 md:mb-8">
        <div className="flex items-center space-x-2 text-slate-400 text-xs mb-2">
          <Link href="/dashboard" className="hover:text-primary transition-colors">Inicio</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-600">Verificación</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <ShieldCheck className="w-8 h-8 mr-3 text-primary" />
          Verificación
        </h1>
      </div>

      <VerificationContainer />
    </div>
  );
}
