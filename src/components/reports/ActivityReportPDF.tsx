// NOTE: This is a non-interactive component used for server-side PDF generation.
// It should only contain layout and data display logic.
// All data is passed in as props.

import { Item, Group } from '@/types/monday';

interface ActivityReportProps {
  projectName: string;
  dateRange: {
    from: string;
    to: string;
  };
  groups: Group[];
}

// We need to inline the Tailwind CSS for the PDF generator.
// A simple way is to define styles here. In a real app, you might have a build step.
const styles = {
  body: `font-sans p-12 bg-white`,
  header: `flex justify-between items-start mb-10 border-b-2 border-slate-800 pb-4`,
  h1: `text-3xl font-bold text-slate-800`,
  h2: `text-xl font-bold text-slate-700 mt-8 mb-4 border-b border-slate-200 pb-2`,
  metaInfo: `text-sm text-slate-500`,
  table: `w-full border-collapse text-left`,
  th: `p-2 bg-slate-100 text-xs font-bold text-slate-600 uppercase tracking-wider border-b-2 border-slate-200`,
  td: `p-3 border-b border-slate-100 text-sm`,
  groupTitle: `p-2 bg-slate-200 text-sm font-bold text-slate-800`,
  statusBadge: (status: string) => {
    const base = 'text-xs font-bold px-2 py-0.5 rounded-full text-white';
    if (status === 'Done') return `${base} bg-green-500`;
    if (status === 'Working on it') return `${base} bg-yellow-500`;
    if (status === 'Stuck') return `${base} bg-red-500`;
    return `${base} bg-slate-400`;
  },
};

export default function ActivityReportPDF({ projectName, dateRange, groups }: ActivityReportProps) {
  const totalTasks = groups.reduce((acc, group) => acc + group.items.length, 0);
  const doneTasks = groups.reduce((acc, group) => 
    acc + group.items.filter(item => (item.values as any).status === 'Done').length, 
  0);

  return (
    <div className={styles.body}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.h1}>{projectName}</h1>
          <p className={styles.metaInfo}>Reporte de Actividad</p>
        </div>
        <div className="text-right">
          <p className={styles.metaInfo}>
            Desde: {new Date(dateRange.from).toLocaleDateString('es-ES')}
          </p>
          <p className={styles.metaInfo}>
            Hasta: {new Date(dateRange.to).toLocaleDateString('es-ES')}
          </p>
          <p className={styles.metaInfo}>
            Generado: {new Date().toLocaleDateString('es-ES')}
          </p>
        </div>
      </header>

      <main>
        <section className="mb-10">
          <h2 className={styles.h2}>Resumen del Periodo</h2>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="text-3xl font-bold text-slate-800">{groups.length}</div>
              <div className="text-sm text-slate-500">Grupos Activos</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="text-3xl font-bold text-slate-800">{totalTasks}</div>
              <div className="text-sm text-slate-500">Tareas Totales</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-3xl font-bold text-green-600">{doneTasks}</div>
              <div className="text-sm text-green-500">Tareas Completadas</div>
            </div>
          </div>
        </section>

        <section>
          <h2 className={styles.h2}>Detalle de Tareas</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Tarea</th>
                <th className={styles.th}>Estado</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <>
                  <tr key={group.id}>
                    <td colSpan={3} className={styles.groupTitle}>{group.title}</td>
                  </tr>
                  {group.items.length > 0 ? group.items.map(item => (
                    <tr key={item.id}>
                      <td className={styles.td}>
                        <div className="font-medium text-slate-800">{item.name}</div>
                      </td>
                      <td className={styles.td}>
                        <span className={styles.statusBadge((item.values as any).status)}>
                          {(item.values as any).status || 'Sin Estado'}
                        </span>
                      </td>
                      <td className={styles.td}>
                        {/* Placeholder for a potential chart or more info */}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-slate-400 italic">
                        No hay tareas en este grupo para el periodo seleccionado.
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      <footer className="text-center text-xs text-slate-400 pt-10 mt-10 border-t border-slate-200">
        <p>Reporte generado por Mantenix</p>
      </footer>
    </div>
  );
}
