'use client';

import ProfessionalLayout from '@/components/ProfessionalLayout';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProfessionalLayout>{children}</ProfessionalLayout>;
}
