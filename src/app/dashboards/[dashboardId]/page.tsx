'use client';

import CustomizableDashboard from '@/components/dashboards/CustomizableDashboard';
import { Suspense } from 'react';

// This component will extract the dashboardId from the URL parameters
// and pass it to our main dashboard component.

function DashboardPageContent({ dashboardId }: { dashboardId: string }) {
  return <CustomizableDashboard dashboardId={dashboardId} />;
}

export default function Page({ params }: { params: { dashboardId: string } }) {
  const { dashboardId } = params;

  if (!dashboardId) {
    return <div className="p-8 text-center">No se ha especificado un ID de dashboard.</div>;
  }

  return (
    // Using Suspense for potential future data fetching needs at the page level
    <Suspense fallback={<div className="p-8 text-center">Cargando...</div>}>
      <DashboardPageContent dashboardId={dashboardId} />
    </Suspense>
  );
}
