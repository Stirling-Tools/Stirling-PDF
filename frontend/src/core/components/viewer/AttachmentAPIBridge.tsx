import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAttachmentCapability } from '@embedpdf/plugin-attachment/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { AttachmentState, AttachmentAPIWrapper } from '@app/contexts/viewer/viewerBridges';
import { PdfAttachmentObject } from '@embedpdf/models';

export function AttachmentAPIBridge() {
  const { provides: attachmentCapability } = useAttachmentCapability();
  const { registerBridge } = useViewer();
  const [state, setState] = useState<AttachmentState>({
    attachments: null,
    isLoading: false,
    error: null,
  });

  const fetchAttachments = useCallback(
    async () => {
      if (!attachmentCapability) return [];

      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const task = attachmentCapability.getAttachments();
        const result = await task.toPromise();
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
        throw error;
      }
    },
    [attachmentCapability]
  );

  const api = useMemo<AttachmentAPIWrapper | null>(() => {
    if (!attachmentCapability) return null;

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
  }, [attachmentCapability, fetchAttachments]);

  useEffect(() => {
    if (!api) return;

    registerBridge('attachment', {
      state,
      api,
    });
  }, [api, state, registerBridge]);

  return null;
}
