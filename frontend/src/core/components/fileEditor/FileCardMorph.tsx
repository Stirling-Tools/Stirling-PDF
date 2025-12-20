import { useMorphElement } from '@app/hooks/useMorphElement';

interface FileCardMorphProps {
  fileId: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wrapper for file cards that registers them for morphing animations
 */
export function FileCardMorph({ fileId, children, className }: FileCardMorphProps) {
  const morphRef = useMorphElement<HTMLDivElement>(
    `file-${fileId}`,
    { fileId, type: 'file' },
    { onlyIn: ['fileEditor'] }
  );

  return (
    <div
      ref={morphRef}
      className={className}
      data-morph-id={`file-${fileId}`}
      data-morph-file-id={fileId}
      data-morph-type="file"
    >
      {children}
    </div>
  );
}
