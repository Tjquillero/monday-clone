'use client';

import ProfessionalLayout from '@/components/ProfessionalLayout';

export default function MyWorkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProfessionalLayout>{children}</ProfessionalLayout>;
}
