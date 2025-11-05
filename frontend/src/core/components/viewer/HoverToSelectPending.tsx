import { useEffect, useRef } from 'react';
import { useRedaction } from '@embedpdf/plugin-redaction/react';

type Props = {
  pageIndex: number;
  scale: number;
  getPageEl: () => HTMLElement | null;
};

/**
 * When hovering a pending box and the user is in marquee (area) mode,
 * temporarily pause drawing so clicks select the box.
 * When leaving the box (and nothing is selected), restore the last clicked mode.
 */
export default function HoverToSelectPending({ pageIndex, scale, getPageEl }: Props) {
  const { state, provides } = useRedaction();
  const pausedRef = useRef(false);

  useEffect(() => {
    const el = getPageEl();
    if (!el || !provides) return;

    const restoreIfIdle = () => {
      if (!pausedRef.current) return;
      if (state.selected) return; // keep paused while a box is selected
      pausedRef.current = false;

      const desired = (document as any)._embedpdf_redactMode as 'marqueeRedact' | 'redactSelection' | undefined;
      const anyProv = provides as any;
      if (desired && typeof anyProv.setActiveType === 'function') {
        anyProv.setActiveType(desired);
      } else if (desired === 'marqueeRedact' && state.activeType !== 'marqueeRedact') {
        provides.toggleMarqueeRedact?.();
      } else if (desired === 'redactSelection' && state.activeType !== 'redactSelection') {
        provides.toggleRedactSelection?.();
      }
    };

    const onMove = (e: PointerEvent) => {
      const list: any[] = (state.pending as any)?.[pageIndex] || [];
      if (!list.length) { restoreIfIdle(); return; }

      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / scale;
      const py = (e.clientY - r.top) / scale;

      const hit = list.find((it) => {
        if (!it?.rect) return false;
        const { pos, size } = it.rect;
        if (!pos || !size) return false;
        return px >= pos.x && px <= pos.x + size.width && py >= pos.y && py <= pos.y + size.height;
      });

      // Only pause auto-draw when we're in marquee mode and actually hovering a box
      if (hit && state.activeType === 'marqueeRedact' && !pausedRef.current) {
        pausedRef.current = true;
        provides.toggleMarqueeRedact?.(); // turn OFF drawing so clicks select the box
      } else if (!hit) {
        restoreIfIdle();
      }
    };

    const onLeave = () => restoreIfIdle();

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave, { passive: true });
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [provides, state.pending, state.selected, state.activeType, pageIndex, scale]);

  return null;
}
