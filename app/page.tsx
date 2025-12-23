'use client';

import SwapDataGrid from '@/components/SwapDataGrid';
import { useConfig } from '@/contexts/ConfigContext';

export default function Home() {
  const { selectedPair } = useConfig();

  return <SwapDataGrid pairId={selectedPair} />;
}
