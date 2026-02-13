import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAttachmentCapability } from '@embedpdf/plugin-attachment/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { AttachmentState, AttachmentAPIWrapper } from '@app/contexts/viewer/viewerBridges';
import { PdfAttachmentObject } from '@embedpdf/models';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

/**
 * Connects the PDF attachment plugin to the shared ViewerContext.
 */
export function AttachmentAPIBridge() {
  const { provides: attachmentCapability } = useAttachmentCapability();
  const { registerBridge } = useViewer();
  const [state, setState] = useState<AttachmentState>({
    attachments: null,
    isLoading: false,
    error: null,
  });
  const documentReady = useDocumentReady();

  const fetchAttachments = useCallback(
    async () => {
      if (!attachmentCapability || !documentReady) {
        // Set error state instead of throwing for better user experience
        setState(prev => ({
          ...prev,
          error: 'Document not ready or attachment capability not available',
          isLoading: false
        }));
        return [];
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const task = attachmentCapability.getAttachments();

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Attachment fetch timeout after 10 seconds')), 10000);
        });

        const result = await Promise.race([task.toPromise(), timeoutPromise]);
        setState({
          attachments: result ?? [],
          isLoading: false,
          error: null,
        });
        return result ?? [];
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load attachments';
        setState({
          attachments: null,
          isLoading: false,
          error: message,
        });
        // Consistent contract: always return empty array on failure.
        // Callers can check the error state via getAttachmentState().
        return [];
      }
    },
    [attachmentCapability, documentReady]
  );

  const api = useMemo<AttachmentAPIWrapper | null>(() => {
    // Only provide API when both capability AND document are ready
    if (!attachmentCapability || !documentReady) return null;

    return {
      getAttachments: fetchAttachments,
      downloadAttachment: async (attachment: PdfAttachmentObject) => {
        try {
          const task = attachmentCapability.downloadAttachment(attachment);
          const buffer = await task.toPromise();

          // Create a blob and trigger download
          const blob = new Blob([buffer], { type: 'application/octet-stream' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = attachment.name || 'attachment';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        } catch (error) {
          console.error('Failed to download attachment:', error);
        }
      },
      clearAttachments: () => {
        setState({
          attachments: null,
          isLoading: false,
          error: null,
        });
      },
      setLocalAttachments: (attachments, error = null) => {
        setState({
          attachments,
          isLoading: false,
          error,
        });
      },
    };
  }, [attachmentCapability, documentReady, fetchAttachments]);

  useEffect(() => {
    if (!api) {
      // If API becomes null (e.g. document transitions), ensure we unregister stale bridge
      registerBridge('attachment', null);
      return;
    }

    registerBridge('attachment', {
      state,
      api,
    });

    return () => {
      registerBridge('attachment', null);
    };
  }, [api, state, registerBridge]);

  return null;
}
