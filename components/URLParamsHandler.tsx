'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface URLParamsHandlerProps {
  children: React.ReactNode;
  onParamsChange?: (params: { pair?: string; tab?: string; mode?: string }) => void;
}

/**
 * This component handles URL params synchronization.
 * It must be wrapped in a Suspense boundary.
 */
export default function URLParamsHandler({ children, onParamsChange }: URLParamsHandlerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (onParamsChange) {
      const pair = searchParams.get('pair') || undefined;
      const tab = searchParams.get('tab') || undefined;
      const mode = searchParams.get('mode') || undefined;

      onParamsChange({ pair, tab, mode });
    }
  }, [searchParams, onParamsChange]);

  return <>{children}</>;
}
