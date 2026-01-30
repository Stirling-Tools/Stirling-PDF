import { useRedaction as useEmbedPdfRedaction, RedactionSelectionMenuProps } from '@embedpdf/plugin-redaction/react';
import { ActionIcon, Tooltip, Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useRedaction } from '@app/contexts/RedactionContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';

// Use the official EmbedPDF v2.3.0 types
export type { RedactionSelectionMenuProps };

export function RedactionSelectionMenu(props: RedactionSelectionMenuProps) {
  const activeDocumentId = useActiveDocumentId();
  
  // Don't render until we have a valid document ID
  if (!activeDocumentId) {
    return null;
  }
  
  return (
    <RedactionSelectionMenuInner 
      documentId={activeDocumentId}
      {...props}
    />
  );
}

function RedactionSelectionMenuInner({ 
  documentId,
  context,
  selected, 
  menuWrapperProps,
}: RedactionSelectionMenuProps & { documentId: string }) {
  // Extract item and pageIndex from context (EmbedPDF v2.3.0 API)
  const item = context?.item;
  const pageIndex = context?.pageIndex;
  const { t } = useTranslation();
  const { provides } = useEmbedPdfRedaction(documentId);
  const { setRedactionsApplied } = useRedaction();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  
  // Merge refs - menuWrapperProps.ref is a callback ref
  const setRef = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node;
    // Call the EmbedPDF ref callback
    menuWrapperProps?.ref?.(node);
  }, [menuWrapperProps]);
  
  const handleRemove = useCallback(() => {
    if (provides?.removePending && item && pageIndex !== undefined) {
      provides.removePending(pageIndex, item.id);
    }
  }, [provides, item, pageIndex]);

  const handleApply = useCallback(() => {
    if (provides?.commitPending && item && pageIndex !== undefined) {
      provides.commitPending(pageIndex, item.id);
      // Mark redactions as applied (but not yet saved) so the Save Changes button stays enabled
      // This ensures the button doesn't become disabled when pendingCount decreases
      setRedactionsApplied(true);
    }
  }, [provides, item, pageIndex, setRedactionsApplied]);

  // Calculate position for portal based on wrapper element
  useEffect(() => {
    if (!selected || !item || !wrapperRef.current) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) {
        setMenuPosition(null);
        return;
      }

      const wrapperRect = wrapper.getBoundingClientRect();
      // Position menu below the wrapper, centered
      // Use getBoundingClientRect which gives viewport-relative coordinates
      // Since we're using fixed positioning in the portal, we don't need to add scroll offsets
      setMenuPosition({
        top: wrapperRect.bottom + 8,
        left: wrapperRect.left + wrapperRect.width / 2,
      });
    };

    updatePosition();
    
    // Update position on scroll/resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [selected, item]);
  
  // Early return AFTER all hooks have been called
  if (!selected || !item) return null;

  const menuContent = menuPosition ? (
    <div
      style={{
        position: 'fixed',
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        transform: 'translateX(-50%)',
        pointerEvents: 'auto',
        zIndex: 10000, // Very high z-index to appear above everything
        backgroundColor: 'var(--mantine-color-body)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.25)',
        border: '1px solid var(--mantine-color-default-border)',
        // Fixed size to prevent browser zoom affecting layout
        fontSize: '14px',
        minWidth: '180px',
      }}
    >
        <Group gap="sm" wrap="nowrap" justify="center">
          <Tooltip label="Remove this mark">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              onClick={handleRemove}
              styles={{
                root: {
                  flexShrink: 0,
                  backgroundColor: 'var(--bg-raised)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)',
                  '&:hover': {
                    backgroundColor: 'var(--hover-bg)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-primary)',
                  },
                },
              }}
            >
              <DeleteIcon style={{ fontSize: 18 }} />
            </ActionIcon>
          </Tooltip>
          
          <Tooltip 
            label={t('redact.manual.applyWarning', '⚠️ Permanent application, cannot be undone and the data underneath will be deleted')}
            withArrow
            position="top"
          >
            <Button
              variant="filled"
              color="red"
              size="xs"
              onClick={handleApply}
              leftSection={<CheckCircleIcon style={{ fontSize: 16 }} />}
              styles={{
                root: { flexShrink: 0, whiteSpace: 'nowrap' },
              }}
            >
              Apply (permanent)
            </Button>
          </Tooltip>
        </Group>
      </div>
    ) : null;

  return (
    <>
      {/* Invisible wrapper that provides positioning - uses EmbedPDF's menuWrapperProps */}
      <div 
        ref={setRef} 
        style={{ 
          // Use EmbedPDF's positioning styles
          ...menuWrapperProps?.style,
          // Keep the wrapper invisible but still occupying space for positioning
          opacity: 0,
          pointerEvents: 'none',
        }} 
      />
      {typeof document !== 'undefined' && menuContent
        ? createPortal(menuContent, document.body)
        : null}
    </>
  );
}
