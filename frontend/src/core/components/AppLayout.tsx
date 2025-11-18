import { ReactNode } from 'react';
import { useBanner } from '@app/contexts/BannerContext';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * App layout wrapper that handles banner rendering and viewport sizing
 * Automatically adjusts child components to fit remaining space after banner
 */
export function AppLayout({ children }: AppLayoutProps) {
  const { banner } = useBanner();

  return (
    <>
      <style>{`
        .h-screen,
        .right-rail {
          height: 100% !important;
        }
      `}</style>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {banner}
        <div style={{ flex: 1, minHeight: 0, height: 0 }}>
          {children}
        </div>
      </div>
    </>
  );
}
