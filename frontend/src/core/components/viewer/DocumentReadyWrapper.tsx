import React, { useState, useEffect } from 'react';
import { useDocumentManagerPlugin } from '@embedpdf/plugin-document-manager/react';

interface DocumentReadyWrapperProps {
  children: (documentId: string) => React.ReactNode;
  fallback?: React.ReactNode;
}

export function DocumentReadyWrapper({ children, fallback = null }: DocumentReadyWrapperProps) {
  const { plugin, isLoading, ready } = useDocumentManagerPlugin();
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !plugin) return;

    const checkActiveDocument = async () => {
      await ready;

      // Try to get the active document from the plugin's provides()
      const docManagerApi = plugin.provides?.();
      if (docManagerApi) {
        // Try different methods to get the active document
        const activeDoc = docManagerApi.getActiveDocument?.();
        if (activeDoc?.id) {
          setActiveDocumentId(activeDoc.id);
          return;
        }
      }
    };

    checkActiveDocument();

    // Subscribe to document changes
    const docManagerApi = plugin.provides?.();
    if (docManagerApi?.onDocumentOpened) {
      const unsubscribe = docManagerApi.onDocumentOpened((event: any) => {
        const docId = event?.documentId || event?.id || event?.document?.id;
        if (docId) {
          setActiveDocumentId(docId);
        }
      });

      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [plugin, isLoading, ready]);

  if (!activeDocumentId) {
    return <>{fallback}</>;
  }

  return <>{children(activeDocumentId)}</>;
}
