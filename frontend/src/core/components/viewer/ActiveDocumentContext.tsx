import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useDocumentManagerPlugin } from '@embedpdf/plugin-document-manager/react';

interface ActiveDocumentContextType {
  documentId: string | null;
}

const ActiveDocumentContext = createContext<ActiveDocumentContextType>({ documentId: null });

export function ActiveDocumentProvider({ children }: { children: React.ReactNode }) {
  const { plugin, isLoading } = useDocumentManagerPlugin();
  const [documentId, setDocumentId] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const documentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !plugin) return;

    const docManagerApi = plugin.provides?.();
    if (!docManagerApi) return;

    // Get initial active document (synchronously if available)
    const activeDoc = docManagerApi.getActiveDocument?.();
    if (activeDoc?.id && activeDoc.id !== documentIdRef.current) {
      documentIdRef.current = activeDoc.id;
      setDocumentId(activeDoc.id);
    }

    // Subscribe to document changes (only if not already subscribed)
    if (!unsubscribeRef.current && docManagerApi.onDocumentOpened) {
      unsubscribeRef.current = docManagerApi.onDocumentOpened((event: any) => {
        const docId = event?.documentId || event?.id || event?.document?.id;
        if (docId && docId !== documentIdRef.current) {
          documentIdRef.current = docId;
          setDocumentId(docId);
        }
      });
    }

    // Note: We don't unsubscribe on effect cleanup to avoid re-subscribing on every render
    // Cleanup happens only on unmount
  }, [plugin, isLoading]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  return (
    <ActiveDocumentContext.Provider value={{ documentId }}>
      {children}
    </ActiveDocumentContext.Provider>
  );
}

export function useActiveDocument(): string | null {
  const context = useContext(ActiveDocumentContext);
  return context.documentId;
}
