import { motion } from 'framer-motion';
import { useWorkbenchTransition } from '@app/contexts/WorkbenchTransitionContext';
import { useEffect, useMemo } from 'react';

/**
 * MorphOverlay renders animated clones of elements during workbench transitions
 *
 * Uses Framer Motion to smoothly morph elements from source to target positions,
 * creating the illusion that pages/files are transforming between view modes.
 */
export function MorphOverlay() {
  const { transitionState, getMorphPairs, completeTransition } = useWorkbenchTransition();

  const morphPairs = getMorphPairs();

  // Debug logging
  useEffect(() => {
    if (transitionState.isTransitioning) {
      console.log('[MorphOverlay] Transition state:', {
        from: transitionState.fromWorkbench,
        to: transitionState.toWorkbench,
        sources: transitionState.sourceSnapshots.length,
        targets: transitionState.targetSnapshots.length,
        pairs: morphPairs.length,
      });

      if (morphPairs.length > 0) {
        const pairsBySource = new Map<string, number>();
        morphPairs.forEach(({ source }) => {
          pairsBySource.set(source.id, (pairsBySource.get(source.id) || 0) + 1);
        });
        const hasSplit = Array.from(pairsBySource.values()).some(count => count > 1);
        const type = hasSplit ? 'SPLIT' : 'MERGE';

        console.log(`[MorphOverlay] ${type} animation with ${morphPairs.length} pairs`);

        // Log first pair details
        const first = morphPairs[0];
        console.log('[MorphOverlay] First pair:', {
          source: first.source.id,
          target: first.target.id,
          sourcePos: { x: Math.round(first.source.rect.left), y: Math.round(first.source.rect.top) },
          targetPos: { x: Math.round(first.target.rect.left), y: Math.round(first.target.rect.top) },
        });
      } else {
        console.log('[MorphOverlay] No morph pairs created!');
      }
    }
  }, [transitionState, morphPairs]);

  useEffect(() => {
    if (!transitionState.isTransitioning) return;

    // Auto-complete transition after animation duration.
    // Give extra time when pairs are not ready so targets can register.
    const timeout = setTimeout(() => {
      completeTransition();
    }, morphPairs.length > 0 ? 1400 : 3500); // allow time for targets to register

    return () => clearTimeout(timeout);
  }, [transitionState.isTransitioning, morphPairs.length, completeTransition]);

  const isSplit = morphPairs.some(({ source }) => {
    const sourceFile = source.metadata?.fileId;
    const counts = morphPairs.filter(p => p.source.metadata?.fileId === sourceFile);
    return counts.length > 1;
  });

  // For split animations, we want all outgoing clones to originate near the first page spot
  const firstTargetRectByFile = useMemo(() => {
    const map = new Map<string, DOMRect>();
    morphPairs.forEach(({ source, target }) => {
      const fileId = source.metadata?.fileId || target.metadata?.fileId;
      if (fileId && !map.has(fileId)) {
        map.set(fileId, target.rect);
      }
    });
    return map;
  }, [morphPairs]);

  const preferSplitTargetOrigin = transitionState.toWorkbench === 'pageEditor';

  if (!transitionState.isTransitioning || morphPairs.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 10000,
        overflow: 'hidden',
      }}
    >
      {morphPairs.map(({ source, target }, index) => {
        const sourceRect = source.rect;
        const targetRect = target.rect;
        const fileId = source.metadata?.fileId || target.metadata?.fileId;

        // If splitting (file -> pages), start all clones from the first target rect for that file
        const initialRect =
          source.metadata?.type === 'file' &&
          isSplit &&
          preferSplitTargetOrigin &&
          fileId &&
          firstTargetRectByFile.get(fileId)
            ? firstTargetRectByFile.get(fileId)!
            : sourceRect;

        // Use combination of source and target IDs for unique keys (supports split/merge)
        const key = `${source.id}-to-${target.id}`;

        // Use page thumbnail when flying pages -> file, and target when file -> pages
        const thumbnail =
          source.metadata?.type === 'page'
            ? source.thumbnail || target.thumbnail
            : target.thumbnail || source.thumbnail;

        return (
            <motion.div
              key={key}
              initial={{
                position: 'absolute',
                left: initialRect.left,
                top: initialRect.top,
                width: initialRect.width,
                height: initialRect.height,
                borderRadius: '4px',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                opacity: 0.9,
                scale: 0.9,
              }}
              animate={{
                left: targetRect.left,
                top: targetRect.top,
                width: targetRect.width,
                height: targetRect.height,
                opacity: 1,
                scale: 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 220,
                damping: 26,
                mass: 1.05,
                bounce: 0.3,
                restDelta: 0.1,
                restSpeed: 0.1,
                delay: isSplit ? index * 0.05 : 0,
              }}
              style={{ willChange: 'transform, width, height, opacity' }}
            >
              {/* Render thumbnail if available */}
              {thumbnail && (
                <motion.img
                  src={thumbnail}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    backgroundColor: 'white',
                  }}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              )}

              {/* Fallback: render a placeholder */}
              {!source.thumbnail && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'var(--file-card-bg, #f5f5f5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: '24px', opacity: 0.5 }}>📄</span>
                </div>
              )}
            </motion.div>
          );
        })}
    </div>
  );
}
