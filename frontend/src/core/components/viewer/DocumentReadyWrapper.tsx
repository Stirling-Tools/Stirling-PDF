import React, { useState, useEffect } from 'react';
import { useDocumentManagerPlugin } from '@embedpdf/plugin-document-manager/react';

interface DocumentReadyWrapperProps {
  children: (documentId: string) => React.ReactNode;
  fallback?: React.ReactNode;
}

export function DocumentReadyWrapper({ children, fallback = null }: DocumentReadyWrapperProps) {
  const { plugin, isLoading } = useDocumentManagerPlugin();
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !plugin) return;

    const docManagerApi = plugin.provides?.();
    if (!docManagerApi) return;

    let settled = false;
    const resolve = (id: string) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      setActiveDocumentId(id);
    };

    const unsubscribe = docManagerApi.onDocumentOpened?.((event: any) => {
      const id = typeof event === 'string'
        ? event
        : event?.documentId ?? event?.id ?? event?.document?.id ?? null;
      if (id) resolve(id);
    });

    const poll = setInterval(() => {
      const activeDoc = docManagerApi.getActiveDocument?.();
      if (activeDoc?.id) resolve(activeDoc.id);
    }, 50);

    return () => {
      settled = true;
      clearInterval(poll);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [plugin, isLoading]);

  if (!activeDocumentId) {
    return <>{fallback}</>;
  }

  return <>{children(activeDocumentId)}</>;
}
