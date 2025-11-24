import { useEffect, useState } from 'react';
import { SidebarRefs } from '@app/types/sidebar';

export function useRightRailTooltipSide(
  sidebarRefs?: SidebarRefs,
  defaultOffset: number = 16
): { position: 'left' | 'right'; offset: number } {
  const [position, setPosition] = useState<'left' | 'right'>('left');

  useEffect(() => {
    const computePosition = () => {
      const rail = sidebarRefs?.rightRailRef?.current;
      const isRTL = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

      // Fallback to left if we can't measure
      if (!rail || typeof window === 'undefined') {
        setPosition(isRTL ? 'left' : 'left');
        return;
      }

      const rect = rail.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const preferred = center > window.innerWidth / 2 ? 'left' : 'right';
      setPosition(isRTL ? 'left' : preferred);
    };

    computePosition();
    window.addEventListener('resize', computePosition);
    return () => window.removeEventListener('resize', computePosition);
  }, [sidebarRefs]);

  return { position, offset: defaultOffset };
}
