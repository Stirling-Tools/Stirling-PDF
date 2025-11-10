import { useState, useEffect } from 'react';
import { usePageDocument } from '@app/components/pageEditor/hooks/usePageDocument';
import { PDFDocument } from '@app/types/pageEditor';

/**
 * Hook that calls usePageDocument but only returns the FIRST non-null result
 * After initialization, it ignores all subsequent updates
 */
export function useInitialPageDocument(): PDFDocument | null {
  const { document: liveDocument } = usePageDocument();
  const [initialDocument, setInitialDocument] = useState<PDFDocument | null>(null);

  useEffect(() => {
    // Only set once when we get the first non-null document
    if (liveDocument && !initialDocument) {
      console.log('📄 useInitialPageDocument: Captured initial document with', liveDocument.pages.length, 'pages');
      setInitialDocument(liveDocument);
    }
  }, [liveDocument, initialDocument]);

  return initialDocument;
}
