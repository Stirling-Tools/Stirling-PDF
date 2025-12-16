import { useRedaction as useEmbedPdfRedaction, SelectionMenuProps } from '@embedpdf/plugin-redaction/react';
import { ActionIcon, Tooltip, Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

/**
 * Custom menu component that appears when a pending redaction mark is selected.
 * Allows users to remove or apply individual pending marks.
 * Uses a portal to ensure it appears above all content, including next pages.
 */
export function RedactionSelectionMenu({ item, selected, menuWrapperProps }: SelectionMenuProps) {
  const { t } = useTranslation();
  const { provides } = useEmbedPdfRedaction();
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Merge refs if menuWrapperProps has a ref
  const setRef = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node;
    if (menuWrapperProps?.ref) {
      const ref = menuWrapperProps.ref;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref && 'current' in ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    }
  }, [menuWrapperProps]);
  
  const handleRemove = useCallback(() => {
    if (provides?.removePending && item) {
      provides.removePending(item.page, item.id);
    }
  }, [provides, item]);

  const handleApply = useCallback(() => {
    if (provides?.commitPending && item) {
      provides.commitPending(item.page, item.id);
    }
  }, [provides, item]);

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

      const rect = wrapper.getBoundingClientRect();
      // Position menu below the wrapper, centered
      // Use getBoundingClientRect which gives viewport-relative coordinates
      // Since we're using fixed positioning in the portal, we don't need to add scroll offsets
      setMenuPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
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

  // Extract ref from menuWrapperProps to avoid conflicts
  const { ref: _, ...wrapperPropsWithoutRef } = menuWrapperProps || {};

  return (
    <>
      <div 
        ref={setRef} 
        {...wrapperPropsWithoutRef} 
        style={{ 
          // Preserve the original positioning from menuWrapperProps
          ...(wrapperPropsWithoutRef?.style || {}),
          // Override visibility to hide the wrapper (we only need its position)
          visibility: 'hidden',
          pointerEvents: 'none',
        }} 
      />
      {typeof document !== 'undefined' && menuContent
        ? createPortal(menuContent, document.body)
        : null}
    </>
  );
}

