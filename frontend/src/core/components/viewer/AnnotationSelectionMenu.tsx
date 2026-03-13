import { ActionIcon, Tooltip, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useAnnotation } from '@embedpdf/plugin-annotation/react';
import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import type { PdfAnnotationObject } from '@embedpdf/models';
import type { AnnotationPatch, AnnotationObject } from '@app/components/viewer/viewerTypes';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';
import { OpacityControl } from '@app/components/annotation/shared/OpacityControl';
import { WidthControl } from '@app/components/annotation/shared/WidthControl';
import { PropertiesPopover } from '@app/components/annotation/shared/PropertiesPopover';
import { ColorControl } from '@app/components/annotation/shared/ColorControl';

/**
 * Props interface matching EmbedPDF's annotation selection menu pattern
 * This matches the type from @embedpdf/plugin-annotation
 */
export interface AnnotationSelectionMenuProps {
  documentId?: string;
  context?: {
    type: 'annotation';
    annotation: TrackedAnnotation<PdfAnnotationObject>;
    pageIndex: number;
  };
  selected: boolean;
  menuWrapperProps?: {
    ref?: (node: HTMLDivElement | null) => void;
    style?: React.CSSProperties;
  };
}

export function AnnotationSelectionMenu(props: AnnotationSelectionMenuProps) {
  const activeDocumentId = useActiveDocumentId();

  // Don't render until we have a valid document ID
  if (!activeDocumentId) {
    return null;
  }

  return (
    <AnnotationSelectionMenuInner
      documentId={activeDocumentId}
      {...props}
    />
  );
}

type AnnotationType = 'textMarkup' | 'ink' | 'inkHighlighter' | 'text' | 'note' | 'shape' | 'line' | 'stamp' | 'unknown';

function AnnotationSelectionMenuInner({
  documentId,
  context,
  selected,
  menuWrapperProps,
}: AnnotationSelectionMenuProps & { documentId: string }) {
  const annotation = context?.annotation;
  const pageIndex = context?.pageIndex;
  const { t } = useTranslation();
  const { provides } = useAnnotation(documentId);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Merge refs - menuWrapperProps.ref is a callback ref
  const setRef = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node;
    // Call the EmbedPDF ref callback
    menuWrapperProps?.ref?.(node);
  }, [menuWrapperProps]);

  // Type detection
  const getAnnotationType = useCallback((): AnnotationType => {
    const type = annotation?.object?.type;
    const toolId = (annotation?.object as AnnotationObject | undefined)?.customData?.toolId;

    // Map type numbers to categories
    if (type !== undefined && [9, 10, 11, 12].includes(type)) return 'textMarkup';
    if (type === 15) {
      return toolId === 'inkHighlighter' ? 'inkHighlighter' : 'ink';
    }
    if (type === 3) {
      return toolId === 'note' ? 'note' : 'text';
    }
    if (type !== undefined && [5, 6, 7].includes(type)) return 'shape';
    if (type !== undefined && [4, 8].includes(type)) return 'line';
    if (type === 13) return 'stamp';

    return 'unknown';
  }, [annotation]);

  // Calculate menu width based on annotation type
  const calculateWidth = (annotationType: AnnotationType): number => {
    switch (annotationType) {
      case 'stamp':
        return 80;
      case 'inkHighlighter':
        return 220;
      case 'shape':
        return 200;
      default:
        return 180;
    }
  };

  // Get annotation properties
  const obj = annotation?.object as AnnotationObject | undefined;
  const annotationType = getAnnotationType();
  const annotationId = obj?.id;

  // Get current colors
  const getCurrentColor = (): string => {
    if (!obj) return '#000000';
    const type = obj.type;
    // Text annotations use textColor
    if (type === 3) return obj.textColor || obj.color || '#000000';
    // Shape annotations use strokeColor
    if (type !== undefined && [4, 5, 6, 7, 8].includes(type)) return obj.strokeColor || obj.color || '#000000';
    // Default to color property
    return obj.color || obj.strokeColor || '#000000';
  };

  const getStrokeColor = (): string => {
    return obj?.strokeColor || obj?.color || '#000000';
  };

  const getFillColor = (): string => {
    return obj?.color || obj?.fillColor || '#0000ff';
  };

  const getBackgroundColor = (): string => {
    // Check multiple possible properties for background color
    return obj?.backgroundColor || obj?.fillColor || obj?.color || '#ffffff';
  };

  const getTextColor = (): string => {
    return obj?.textColor || obj?.color || '#000000';
  };

  const getOpacity = (): number => {
    return Math.round((obj?.opacity ?? 1) * 100);
  };

  const getWidth = (): number => {
    return obj?.strokeWidth ?? obj?.borderWidth ?? obj?.lineWidth ?? obj?.thickness ?? 2;
  };

  // Handlers
  const handleDelete = useCallback(() => {
    if (provides?.deleteAnnotation && annotationId && pageIndex !== undefined) {
      provides.deleteAnnotation(pageIndex, annotationId);
    }
  }, [provides, annotationId, pageIndex]);

  // Focus inline text input (same as double-clicking the note/text box). Dispatches dblclick on the
  // annotation hit-area div (EmbedPDF's inner div with onDoubleClick) so built-in FreeText editing is used.
  const handleFocusTextEdit = useCallback(() => {
    const root = wrapperRef.current?.closest('[data-no-interaction]');
    const main = root?.firstElementChild;
    // EmbedPDF puts onDoubleClick on the content div. For text/note (no rotation) it's the first child.
    const hitArea = main?.lastElementChild ?? main?.firstElementChild;
    if (!hitArea) return;
    hitArea.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
  }, []);

  const handleColorChange = useCallback((color: string, target: 'main' | 'stroke' | 'fill' | 'text' | 'background') => {
    if (!provides?.updateAnnotation || !annotationId || pageIndex === undefined) return;

    const type = obj?.type;
    const patch: AnnotationPatch = {};

    if (target === 'stroke') {
      // Shape stroke - preserve fill color
      patch.strokeColor = color;
      patch.color = obj?.color || '#0000ff'; // Preserve fill
      patch.strokeWidth = getWidth();
    } else if (target === 'fill') {
      // Shape fill - preserve stroke color
      patch.color = color;
      patch.strokeColor = obj?.strokeColor || '#000000'; // Preserve stroke
      patch.strokeWidth = getWidth();
    } else if (target === 'background') {
      // Background color for text/note - set multiple properties for compatibility
      patch.backgroundColor = color;
      patch.fillColor = color;
      patch.color = color;
    } else if (target === 'text') {
      // Text color for text/note - TRY PROPERTY COMBINATIONS
      patch.textColor = color;
      patch.fontColor = color;  // EmbedPDF might expect this instead

      // Include font metadata (EmbedPDF might require these together)
      patch.fontSize = obj?.fontSize ?? 14;
      patch.fontFamily = obj?.fontFamily ?? 'Helvetica';

      // Re-submit text content
      patch.contents = obj?.contents ?? '';
    } else {
      // Main color - for highlights, ink, etc.
      patch.color = color;

      // For text markup annotations (highlight, underline, strikeout, squiggly)
      if (type !== undefined && [9, 10, 11, 12].includes(type)) {
        patch.strokeColor = color;
        patch.fillColor = color;
        patch.opacity = obj?.opacity ?? 1;
      }

      // For line annotations (type 4, 8), include stroke properties
      if (type !== undefined && [4, 8].includes(type)) {
        patch.strokeColor = color;
        patch.strokeWidth = obj?.strokeWidth ?? obj?.lineWidth ?? 2;
        patch.lineWidth = obj?.lineWidth ?? obj?.strokeWidth ?? 2;
      }

      // For ink annotations (type 15), include all stroke-related properties
      if (type === 15) {
        patch.strokeColor = color;
        patch.strokeWidth = obj?.strokeWidth ?? obj?.thickness ?? 2;
        patch.opacity = obj?.opacity ?? 1;
      }
    }

    provides.updateAnnotation(pageIndex, annotationId, patch);
  }, [provides, annotationId, pageIndex, obj]);

  const handleOpacityChange = useCallback((opacity: number) => {
    if (!provides?.updateAnnotation || !annotationId || pageIndex === undefined) return;

    provides.updateAnnotation(pageIndex, annotationId, {
      opacity: opacity / 100,
    });
  }, [provides, annotationId, pageIndex]);

  const handleWidthChange = useCallback((width: number) => {
    if (!provides?.updateAnnotation || !annotationId || pageIndex === undefined) return;

    provides.updateAnnotation(pageIndex, annotationId, {
      strokeWidth: width,
    });
  }, [provides, annotationId, pageIndex]);

  const handlePropertiesUpdate = useCallback((patch: Record<string, any>) => {
    if (!provides?.updateAnnotation || !annotationId || pageIndex === undefined) return;

    provides.updateAnnotation(pageIndex, annotationId, patch);
  }, [provides, annotationId, pageIndex]);

  // Render button groups based on annotation type
  const renderButtons = () => {
    const commonButtonStyles = {
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
    };

    const EditTextButton = () => (
      <Tooltip label={t('annotation.editText', 'Edit Text')}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          onClick={handleFocusTextEdit}
          styles={commonButtonStyles}
        >
          <EditIcon style={{ fontSize: 18 }} />
        </ActionIcon>
      </Tooltip>
    );

    const DeleteButton = () => (
      <Tooltip label={t('annotation.delete', 'Delete')}>
        <ActionIcon
          variant="subtle"
          color="red"
          size="md"
          onClick={handleDelete}
          styles={{
            root: {
              ...commonButtonStyles.root,
              '&:hover': {
                backgroundColor: 'var(--mantine-color-red-1)',
                borderColor: 'var(--mantine-color-red-4)',
                color: 'var(--mantine-color-red-7)',
              },
            },
          }}
        >
          <DeleteIcon style={{ fontSize: 18 }} />
        </ActionIcon>
      </Tooltip>
    );

    switch (annotationType) {
      case 'textMarkup':
        return (
          <>
            <ColorControl
              value={getCurrentColor()}
              onChange={(color) => handleColorChange(color, 'main')}
              label={t('annotation.changeColor', 'Change Colour')}
            />
            <OpacityControl value={getOpacity()} onChange={handleOpacityChange} />
            <DeleteButton />
          </>
        );

      case 'ink':
        return (
          <>
            <ColorControl
              value={getCurrentColor()}
              onChange={(color) => handleColorChange(color, 'main')}
              label={t('annotation.changeColor', 'Change Colour')}
            />
            <WidthControl value={getWidth()} onChange={handleWidthChange} min={1} max={12} />
            <DeleteButton />
          </>
        );

      case 'inkHighlighter':
        return (
          <>
            <ColorControl
              value={getCurrentColor()}
              onChange={(color) => handleColorChange(color, 'main')}
              label={t('annotation.changeColor', 'Change Colour')}
            />
            <WidthControl value={getWidth()} onChange={handleWidthChange} min={1} max={20} />
            <OpacityControl value={getOpacity()} onChange={handleOpacityChange} />
            <DeleteButton />
          </>
        );

      case 'text':
      case 'note':
        return (
          <>
            <ColorControl
              value={getTextColor()}
              onChange={(color) => handleColorChange(color, 'text')}
              label={t('annotation.color', 'Color')}
            />
            <ColorControl
              value={getBackgroundColor()}
              onChange={(color) => handleColorChange(color, 'background')}
              label={t('annotation.backgroundColor', 'Background color')}
            />
            <EditTextButton />
            <PropertiesPopover
              annotationType={annotationType}
              annotation={annotation}
              onUpdate={handlePropertiesUpdate}
            />
            <DeleteButton />
          </>
        );

      case 'shape':
        return (
          <>
            <ColorControl
              value={getStrokeColor()}
              onChange={(color) => handleColorChange(color, 'stroke')}
              label={t('annotation.strokeColor', 'Stroke Colour')}
            />
            <ColorControl
              value={getFillColor()}
              onChange={(color) => handleColorChange(color, 'fill')}
              label={t('annotation.fillColor', 'Fill Colour')}
            />
            <PropertiesPopover
              annotationType="shape"
              annotation={annotation}
              onUpdate={handlePropertiesUpdate}
            />
            <DeleteButton />
          </>
        );

      case 'line':
        return (
          <>
            <ColorControl
              value={getCurrentColor()}
              onChange={(color) => handleColorChange(color, 'main')}
              label={t('annotation.changeColor', 'Change Colour')}
            />
            <WidthControl value={getWidth()} onChange={handleWidthChange} min={1} max={12} />
            <DeleteButton />
          </>
        );

      case 'stamp':
        return <DeleteButton />;

      default:
        return (
          <>
            <ColorControl
              value={getCurrentColor()}
              onChange={(color) => handleColorChange(color, 'main')}
              label={t('annotation.changeColor', 'Change Colour')}
            />
            <DeleteButton />
          </>
        );
    }
  };

  // Calculate position for portal based on wrapper element
  useEffect(() => {
    if (!selected || !annotation || !wrapperRef.current) {
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
      setMenuPosition({
        top: wrapperRect.bottom + 8,
        left: wrapperRect.left + wrapperRect.width / 2,
      });
    };

    updatePosition();

    // MutationObserver catches EmbedPDF updating the wrapper's inline style during drag
    const observer = new MutationObserver(updatePosition);
    observer.observe(wrapperRef.current, { attributes: true, attributeFilter: ['style'] });

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [selected, annotation]);

  // Early return AFTER all hooks have been called
  if (!selected || !annotation) return null;

  const menuContent = menuPosition ? (
    <div
      data-annotation-selection-menu
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
        fontSize: '14px',
        minWidth: `${calculateWidth(annotationType)}px`,
        transition: 'min-width 0.2s ease',
      }}
    >
      <Group gap="sm" wrap="nowrap" justify="center">
        {renderButtons()}
      </Group>
    </div>
  ) : null;

  return (
    <>
      {/* Invisible wrapper that provides positioning - uses EmbedPDF's menuWrapperProps.
          Must stay pointerEvents:none so EmbedPDF's internal drag handlers receive events.
          Edit Text button dispatches dblclick on this wrapper's parent to use EmbedPDF's built-in inline editing. */}
      <div
        ref={setRef}
        style={{
          ...menuWrapperProps?.style,
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
