'use client';

import { Suspense } from 'react';
import SwapDataGrid from '@/components/SwapDataGrid';
import { useConfig } from '@/contexts/ConfigContext';

function HomeContent() {
  const { selectedPair } = useConfig();

  return <SwapDataGrid pairId={selectedPair} />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
