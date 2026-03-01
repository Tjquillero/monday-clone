'use client';

import ProfessionalLayout from '@/components/ProfessionalLayout';

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProfessionalLayout>{children}</ProfessionalLayout>;
}
