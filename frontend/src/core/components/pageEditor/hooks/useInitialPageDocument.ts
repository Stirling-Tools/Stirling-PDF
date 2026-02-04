import { useState, useEffect, useRef } from 'react';
import { usePageDocument } from '@app/components/pageEditor/hooks/usePageDocument';
import { PDFDocument } from '@app/types/pageEditor';

/**
 * Hook that calls usePageDocument but only returns the FIRST non-null result
 * After initialization, it ignores all subsequent updates
 */
export function useInitialPageDocument(): PDFDocument | null {
  const { document: liveDocument } = usePageDocument();
  const [initialDocument, setInitialDocument] = useState<PDFDocument | null>(null);
  const lastDocumentIdRef = useRef<string | null>(null);
  const liveDocumentId = liveDocument?.id ?? null;

  useEffect(() => {
    if (!liveDocumentId) {
      lastDocumentIdRef.current = null;
      setInitialDocument(null);
      return;
    }

    if (liveDocumentId !== lastDocumentIdRef.current) {
      lastDocumentIdRef.current = liveDocumentId;
      setInitialDocument(null);
    }
  }, [liveDocumentId]);

  useEffect(() => {
    if (!liveDocument || initialDocument) {
      return;
    }

    console.log('📄 useInitialPageDocument: Captured initial document with', liveDocument.pages.length, 'pages');
    setInitialDocument(liveDocument);
  }, [liveDocument, initialDocument]);

  return initialDocument;
}
