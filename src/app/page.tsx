'use client';

import dynamic from 'next/dynamic';
import { NextPage } from 'next';

const LandingPage = dynamic(() => import('./LandingPage'), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-white" />,
});

const Page: NextPage = () => {
  return <LandingPage />;
};

export default Page;
