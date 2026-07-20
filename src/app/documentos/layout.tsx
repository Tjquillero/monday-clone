'use client';

import ProfessionalLayout from '@/components/ProfessionalLayout';

export default function DocumentosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProfessionalLayout>{children}</ProfessionalLayout>;
}
