'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid } from 'lucide-react';

interface Dashboard {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

// --- API Functions ---
const getDashboards = async (): Promise<Dashboard[]> => {
  // In a real multi-tenant app, you'd filter by board/project membership.
  // For now, we fetch all dashboards. RLS policies should enforce security.
  const { data, error } = await supabase
    .from('dashboards')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
};

const createDashboard = async (name: string): Promise<Dashboard> => {
  const { data, error } = await supabase
    .from('dashboards')
    .insert({ name })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export default function DashboardsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: dashboards = [], isLoading } = useQuery({
    queryKey: ['dashboards'],
    queryFn: getDashboards,
  });

  const createDashboardMutation = useMutation({
    mutationFn: createDashboard,
    onSuccess: (newDashboard) => {
      // Invalidate the list to show the new one
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      // Redirect to the new dashboard page
      router.push(`/dashboards/${newDashboard.id}`);
    },
    onError: (error) => {
      alert(`Failed to create dashboard: ${error.message}`);
    }
  });

  const handleCreateDashboard = () => {
    const name = prompt('Ingresa el nombre para el nuevo panel:');
    if (name) {
      createDashboardMutation.mutate(name);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Cargando paneles...</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Mis Paneles</h1>
        <button
          onClick={handleCreateDashboard}
          disabled={createDashboardMutation.isPending}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Plus size={16} />
          {createDashboardMutation.isPending ? 'Creando...' : 'Crear Panel'}
        </button>
      </div>

      {dashboards.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-slate-200 rounded-xl">
          <LayoutGrid size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-600">No tienes paneles todavía</h3>
          <p className="text-sm text-slate-400 mb-6">Crea tu primer panel para empezar a visualizar tus datos.</p>
          <button 
            onClick={handleCreateDashboard}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold"
          >
            Crear tu Primer Panel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {dashboards.map(dashboard => (
            <Link href={`/dashboards/${dashboard.id}`} key={dashboard.id}>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-40 flex flex-col justify-between hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group">
                <div>
                  <h2 className="font-bold text-slate-800 group-hover:text-primary transition-colors truncate">{dashboard.name}</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Creado el {new Date(dashboard.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver Panel →
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
