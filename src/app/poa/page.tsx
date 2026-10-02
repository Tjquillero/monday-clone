'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  FileSpreadsheet, UploadCloud, MapPin, CheckCircle2, 
  Clock, AlertCircle, ArrowLeft, ShieldAlert 
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { isAppAdminUser } from '@/config/navigation';

interface PoaRecord {
  id: string;
  board_id: string;
  name: string;
  created_at?: string;
}

interface PoaVersionRecord {
  id: string;
  poa_id: string;
  version_number: number;
  status: 'active' | 'draft' | 'archived' | 'superseded';
  created_at: string;
  published_at?: string | null;
  activity_count?: number;
}

function PoaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();

  const boardId = searchParams ? searchParams.get('boardId') : null;

  const [poa, setPoa] = useState<PoaRecord | null>(null);
  const [versions, setVersions] = useState<PoaVersionRecord[]>([]);
  const [activeVersion, setActiveVersion] = useState<PoaVersionRecord | null>(null);
  const [activeActivityCount, setActiveActivityCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = isAppAdminUser(session?.user || user);

  useEffect(() => {
    async function loadPoaData() {
      if (!boardId) {
        // Intentar resolver el primer tablero del usuario si no viene en searchParams
        const { data: boards } = await supabase.from('boards').select('id, name').limit(1);
        if (boards && boards.length > 0) {
          router.replace(`/poa?boardId=${boards[0].id}`);
          return;
        }
        setLoading(false);
        setError('No se ha especificado un tablero.');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Resolver POA por board_id
        const { data: poaData, error: poaErr } = await supabase
          .from('poa')
          .select('*')
          .eq('board_id', boardId)
          .maybeSingle();

        if (poaErr) throw poaErr;

        if (!poaData) {
          setPoa(null);
          setLoading(false);
          return;
        }

        setPoa(poaData);

        // 2. Obtener versiones del POA
        const { data: verData, error: verErr } = await supabase
          .from('poa_versions')
          .select('*')
          .eq('poa_id', poaData.id)
          .order('version_number', { ascending: false });

        if (verErr) throw verErr;

        const vers: PoaVersionRecord[] = verData || [];
        setVersions(vers);

        const active = vers.find((v) => v.status === 'active') || null;
        setActiveVersion(active);

        if (active) {
          // Contar actividades de la versión activa
          const { count, error: countErr } = await supabase
            .from('poa_activities')
            .select('id', { count: 'exact', head: true })
            .eq('poa_version_id', active.id);

          if (!countErr && typeof count === 'number') {
            setActiveActivityCount(count);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Error al cargar los datos del POA');
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadPoaData();
    }
  }, [boardId, authLoading, router]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // B1 / B3: Acceso restringido para no administradores por app_metadata
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center font-sans">
        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl shadow-xl">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-2">Acceso restringido</h2>
          <p className="text-xs text-slate-400 mb-6">
            Solo los administradores con privilegios en app_metadata tienen acceso a la gestión del POA.
          </p>
          <Link
            href={boardId ? `/dashboard?boardId=${boardId}` : '/dashboard'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3B7EF8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#2563EB] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Volver al tablero
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto font-sans text-white">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <Link href={boardId ? `/dashboard?boardId=${boardId}` : '/dashboard'} className="hover:text-[#3B7EF8] transition-colors flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Tablero
          </Link>
          <span>/</span>
          <span className="text-slate-200 font-bold">Gestión del POA</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider flex items-center gap-3 text-white">
            <FileSpreadsheet className="w-8 h-8 text-[#3B7EF8]" />
            Plan Operativo Anual (POA)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestión de versiones contractuales, alcance por zonas y catálogo del contrato.
          </p>
        </div>

        {poa && (
          <div className="flex items-center gap-3">
            <Link
              href={`/poa/${poa.id}/import`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3B7EF8] hover:bg-[#2563EB] text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-[#3B7EF8]/20"
            >
              <UploadCloud className="w-4 h-4" />
              Importar nueva versión
            </Link>
            <Link
              href={`/poa/${poa.id}/zone-mappings`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold uppercase tracking-wider transition-all"
            >
              <MapPin className="w-4 h-4 text-[#3B7EF8]" />
              Asignar zonas
            </Link>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-3 mb-6">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && !poa && (
        <div className="p-8 rounded-2xl bg-black/40 border border-slate-800 text-center">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">Sin POA configurado</h3>
          <p className="text-xs text-slate-400 mb-6">
            Este tablero no cuenta con un registro de POA asignado en la base de datos.
          </p>
        </div>
      )}

      {!loading && !error && poa && (
        <div className="space-y-6">
          {/* Card Versión Activa */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#3B7EF8] px-2.5 py-1 rounded bg-[#3B7EF8]/10 border border-[#3B7EF8]/20">
                Versión en Operación
              </span>
              {activeVersion && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /> Activa
                </span>
              )}
            </div>

            {activeVersion ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-black/40 border border-slate-800/80">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Versión</span>
                  <p className="text-2xl font-black text-white mt-0.5">V{activeVersion.version_number}</p>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-slate-800/80">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Fecha de Publicación</span>
                  <p className="text-sm font-bold text-slate-200 mt-1">
                    {activeVersion.published_at
                      ? new Date(activeVersion.published_at).toLocaleDateString()
                      : new Date(activeVersion.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-slate-800/80">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Actividades Contractuales</span>
                  <p className="text-2xl font-black text-[#3B7EF8] mt-0.5">{activeActivityCount}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-4">No hay una versión activa actualmente para este POA.</p>
            )}
          </div>

          {/* Historial de Versiones */}
          <div className="p-6 rounded-2xl bg-black/40 border border-slate-800">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Historial de Versiones
            </h3>

            {versions.length === 0 ? (
              <p className="text-xs text-slate-500">No hay versiones registradas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase font-black tracking-wider text-slate-500">
                      <th className="py-2.5 px-3">Versión</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 font-mono">
                    {versions.map((ver) => (
                      <tr key={ver.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-3 font-bold text-white">V{ver.version_number}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              ver.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {ver.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 font-sans">
                          {new Date(ver.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PoaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-8 h-8 border-2 border-[#3B7EF8] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PoaContent />
    </Suspense>
  );
}
