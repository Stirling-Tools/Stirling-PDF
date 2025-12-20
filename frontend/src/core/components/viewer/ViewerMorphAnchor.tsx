import { useMemo } from 'react';
import { useMorphElement } from '@app/hooks/useMorphElement';

interface ViewerMorphAnchorProps {
  fileId?: string;
}

/**
 * Invisible anchor that registers the current viewer file for morph animations.
 * Gives the transition system a source/target element when coming from the viewer.
 */
export function ViewerMorphAnchor({ fileId }: ViewerMorphAnchorProps) {
  const morphId = fileId ? `file-${fileId}` : undefined;

  const metadata = useMemo(() => {
    if (!fileId) return undefined;
    return { fileId, type: 'file' };
  }, [fileId]);

  const ref = useMorphElement<HTMLDivElement>(
    morphId ?? 'viewer-file-anchor',
    metadata,
    { onlyIn: ['viewer'], disabled: !fileId }
  );

  if (!fileId) return null;

  return (
    <div
      ref={ref}
      data-morph-id={morphId}
      data-morph-file-id={fileId}
      data-morph-type="file"
      style={{
        position: 'fixed',
        left: '50%',
        top: '45%',
        width: '180px',
        height: '220px',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        opacity: 0,
        borderRadius: '6px',
        background: 'transparent',
        zIndex: 5,
      }}
    />
  );
}
