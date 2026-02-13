/**
 * FormFieldOverlay — Renders interactive HTML form widgets on top of a PDF page.
 *
 * This layer is placed inside the renderPage callback of the EmbedPDF Scroller,
 * similar to how AnnotationLayer, RedactionLayer, and LinkLayer work.
 *
 * It reads the form field coordinates (in un-rotated CSS space, top-left origin)
 * and scales them using the document scale from EmbedPDF.
 *
 * Each widget renders an appropriate HTML input (text, checkbox, dropdown, etc.)
 * that synchronises bidirectionally with FormFillContext values.
 *
 * Coordinate handling:
 * Both providers (PdfLibFormProvider and PdfBoxFormProvider) output widget
 * coordinates in un-rotated PDF space (y-flipped to CSS upper-left origin).
 * The <Rotate> component (which wraps this overlay along with page tiles)
 * handles visual rotation via CSS transforms — same as TilingLayer,
 * AnnotationLayer, and LinkLayer.
 */
import React, { useCallback, useMemo, memo } from 'react';
import { useDocumentState } from '@embedpdf/core/react';
import { useFormFill, useFieldValue } from '@proprietary/tools/formFill/FormFillContext';
import type { FormField, WidgetCoordinates } from '@proprietary/tools/formFill/types';

interface WidgetInputProps {
  field: FormField;
  widget: WidgetCoordinates;
  isActive: boolean;
  error?: string;
  scaleX: number;
  scaleY: number;
  onFocus: (fieldName: string) => void;
  onChange: (fieldName: string, value: string) => void;
}

/**
 * WidgetInput subscribes to its own field value via useSyncExternalStore,
 * so it only re-renders when its specific value changes — not when ANY
 * form value in the entire document changes.
 */
function WidgetInputInner({
  field,
  widget,
  isActive,
  error,
  scaleX,
  scaleY,
  onFocus,
  onChange,
}: WidgetInputProps) {
  // Per-field value subscription — only this widget re-renders when its value changes
  const value = useFieldValue(field.name);

  // Coordinates are in visual CSS space (top-left origin).
  // Multiply by per-axis scale to get rendered pixel coordinates.
  const left = widget.x * scaleX;
  const top = widget.y * scaleY;
  const width = widget.width * scaleX;
  const height = widget.height * scaleY;

  const borderColor = error ? '#f44336' : (isActive ? '#2196F3' : 'rgba(33, 150, 243, 0.4)');
  const bgColor = error
    ? '#FFEBEE' // Red 50 (Opaque)
    : (isActive ? '#E3F2FD' : '#FFFFFF'); // Blue 50 (Opaque) : White (Opaque)

  const commonStyle: React.CSSProperties = {
    position: 'absolute',
    left,
    top,
    width,
    height,
    zIndex: 10,
    boxSizing: 'border-box',
    border: `2px solid ${borderColor}`,
    borderRadius: 2,
    background: bgColor,
    transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
    boxShadow: isActive
      ? `0 0 0 2px ${error ? 'rgba(244, 67, 54, 0.25)' : 'rgba(33, 150, 243, 0.25)'}`
      : 'none',
    cursor: field.readOnly ? 'default' : 'text',
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: field.multiline ? 'stretch' : 'center',
  };

  const stopPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    // Also stop immediate propagation to native listeners to block non-React subscribers
    if (e.nativeEvent) {
      e.nativeEvent.stopImmediatePropagation?.();
    }
  };

  const commonProps = {
    style: commonStyle,
    onPointerDown: stopPropagation,
    onPointerUp: stopPropagation,
    onMouseDown: stopPropagation,
    onMouseUp: stopPropagation,
    onClick: stopPropagation,
    onDoubleClick: stopPropagation,
    onKeyDown: stopPropagation,
    onKeyUp: stopPropagation,
    onKeyPress: stopPropagation,
    onDragStart: stopPropagation,
    onSelect: stopPropagation,
    onContextMenu: stopPropagation,
  };

  const captureStopProps = {
    onPointerDownCapture: stopPropagation,
    onPointerUpCapture: stopPropagation,
    onMouseDownCapture: stopPropagation,
    onMouseUpCapture: stopPropagation,
    onClickCapture: stopPropagation,
    onKeyDownCapture: stopPropagation,
    onKeyUpCapture: stopPropagation,
    onKeyPressCapture: stopPropagation,
  };

  const fontSize = widget.fontSize
    ? widget.fontSize * scaleY
    : field.multiline
      ? Math.max(8, Math.min(height * 0.65, 14))
      : Math.max(8, height * 0.7);

  const inputBaseStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    padding: 0,
    paddingLeft: `${Math.max(2, 4 * scaleX)}px`,
    paddingRight: `${Math.max(2, 4 * scaleX)}px`,
    fontSize: `${fontSize}px`,
    fontFamily: 'Helvetica, Arial, sans-serif',
    color: '#000',
    boxSizing: 'border-box',
    lineHeight: 'normal',
  };

  const handleFocus = () => onFocus(field.name);

  switch (field.type) {
    case 'text':
      return (
        <div {...commonProps} title={error || field.tooltip || field.label}>
          {field.multiline ? (
            <textarea
              value={value}
              onChange={(e) => onChange(field.name, e.target.value)}
              onFocus={handleFocus}
              disabled={field.readOnly}
              placeholder={field.label}
              style={{
                ...inputBaseStyle,
                resize: 'none',
                overflow: 'auto',
                paddingTop: `${Math.max(1, 2 * scaleY)}px`,
              }}
              {...captureStopProps}
            />
          ) : (
            <input
              type="text"
              id={`${field.name}_${widget.pageIndex}_${widget.x}_${widget.y}`}
              value={value}
              onChange={(e) => onChange(field.name, e.target.value)}
              onFocus={handleFocus}
              disabled={field.readOnly}
              placeholder={field.label}
              style={inputBaseStyle}
              aria-label={field.label || field.name}
              aria-required={field.required}
              aria-invalid={!!error}
              aria-describedby={error ? `${field.name}-error` : undefined}
              {...captureStopProps}
            />
          )}
        </div>
      );

    case 'checkbox': {
      // Checkbox is checked when value is anything other than 'Off' or empty
      const isChecked = !!value && value !== 'Off';
      // When toggling on, use the widget's exportValue (e.g. 'Red', 'Blue') or fall back to 'Yes'
      const onValue = widget.exportValue || 'Yes';
      return (
        <div
          {...commonProps}
          style={{
            ...commonStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: field.readOnly ? 'default' : 'pointer',
          }}
          title={error || field.tooltip || field.label}
          onClick={(e) => {
            if (field.readOnly) return;
            handleFocus();
            onChange(field.name, isChecked ? 'Off' : onValue);
            stopPropagation(e);
          }}
        >
          <span
            style={{
              fontSize: `${Math.max(12, height * 0.7)}px`,
              lineHeight: 1,
              color: isChecked ? '#2196F3' : 'transparent',
              fontWeight: 700,
              userSelect: 'none',
            }}
          >
            ✓
          </span>
        </div>
      );
    }

    case 'combobox':
    case 'listbox': {
      const inputId = `${field.name}_${widget.pageIndex}_${widget.x}_${widget.y}`;

      // For multi-select, value should be an array
      // We store as comma-separated string, so parse it
      const selectValue = field.multiSelect
        ? (value ? value.split(',').map(v => v.trim()) : [])
        : value;

      const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (field.multiSelect) {
          // For multi-select, join selected options with comma
          const selected = Array.from(e.target.selectedOptions, opt => opt.value);
          onChange(field.name, selected.join(','));
        } else {
          onChange(field.name, e.target.value);
        }
      };

      return (
        <div {...commonProps} title={error || field.tooltip || field.label}>
          <select
            id={inputId}
            value={selectValue}
            onChange={handleSelectChange}
            onFocus={handleFocus}
            disabled={field.readOnly}
            multiple={field.multiSelect}
            style={{
              ...inputBaseStyle,
              padding: 0,
              paddingLeft: 2,
              appearance: 'auto',
              WebkitAppearance: 'auto' as React.CSSProperties['WebkitAppearance'],
            }}
            aria-label={field.label || field.name}
            aria-required={field.required}
            aria-invalid={!!error}
            {...captureStopProps}
          >
            {!field.multiSelect && <option value="">— select —</option>}
            {(field.options || []).map((opt, idx) => (
              <option key={opt} value={opt}>
                {(field.displayOptions && field.displayOptions[idx]) || opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    case 'radio': {
      // Each radio widget has an exportValue set by the backend
      const optionValue = widget.exportValue || '';
      if (!optionValue) return null; // no export value, skip
      const isSelected = value === optionValue;
      return (
        <div
          {...commonProps}
          style={{
            ...commonStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: field.readOnly ? 'default' : 'pointer',
          }}
          title={error || field.tooltip || `${field.label}: ${optionValue}`}
          onClick={(e) => {
            if (field.readOnly || value === optionValue) return; // Don't deselect radio buttons
            handleFocus();
            onChange(field.name, optionValue);
            stopPropagation(e);
          }}
        >
          <span
            style={{
              width: Math.max(8, height * 0.5),
              height: Math.max(8, height * 0.5),
              borderRadius: '50%',
              border: '2px solid #666',
              background: isSelected ? '#2196F3' : 'transparent',
              display: 'block',
            }}
          />
        </div>
      );
    }

    case 'signature':
    case 'button':
      // Just render a highlighted area — not editable
      return (
        <div
          {...commonProps}
          style={{
            ...commonStyle,
            background: 'rgba(200,200,200,0.3)',
            border: '1px dashed #999',
            cursor: 'default',
          }}
          title={field.tooltip || `${field.type}: ${field.label}`}
          onClick={handleFocus}
        />
      );

    default:
      return (
        <div {...commonProps} title={field.tooltip || field.label}>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            onFocus={handleFocus}
            disabled={field.readOnly}
            style={inputBaseStyle}
            {...captureStopProps}
          />
        </div>
      );
  }
}

const WidgetInput = memo(WidgetInputInner);

interface FormFieldOverlayProps {
  documentId: string;
  pageIndex: number;
  pageWidth: number;  // rendered CSS pixel width (from renderPage callback)
  pageHeight: number; // rendered CSS pixel height
  /** File identity — if provided, overlay only renders when context fields match this file */
  fileId?: string | null;
}

export function FormFieldOverlay({
  documentId,
  pageIndex,
  pageWidth,
  pageHeight,
  fileId,
}: FormFieldOverlayProps) {
  const { setValue, setActiveField, fieldsByPage, state, forFileId } = useFormFill();
  const { activeFieldName, validationErrors } = state;

  // Get scale from EmbedPDF document state — same pattern as LinkLayer
  // NOTE: All hooks must be called unconditionally (before any early returns)
  const documentState = useDocumentState(documentId);

  const { scaleX, scaleY } = useMemo(() => {
    const pdfPage = documentState?.document?.pages?.[pageIndex];
    if (!pdfPage || !pdfPage.size || !pageWidth || !pageHeight) {
      const s = documentState?.scale ?? 1;
      return { scaleX: s, scaleY: s };
    }

    // pdfPage.size contains un-rotated (MediaBox) dimensions;
    // pageWidth/pageHeight from Scroller also use these un-rotated dims * scale
    return {
      scaleX: pageWidth / pdfPage.size.width,
      scaleY: pageHeight / pdfPage.size.height,
    };
  }, [documentState, pageIndex, pageWidth, pageHeight]);

  const pageFields = useMemo(
    () => fieldsByPage.get(pageIndex) || [],
    [fieldsByPage, pageIndex]
  );

  const handleFocus = useCallback(
    (fieldName: string) => setActiveField(fieldName),
    [setActiveField]
  );

  const handleChange = useCallback(
    (fieldName: string, value: string) => setValue(fieldName, value),
    [setValue]
  );

  // Guard: don't render fields from a previous document.
  // If fileId is provided and doesn't match what the context fetched for, render nothing.
  if (fileId != null && forFileId != null && fileId !== forFileId) {
    return null;
  }
  // Also guard: if fields exist but no forFileId is set (reset happened), don't render stale fields
  if (fileId != null && forFileId == null && state.fields.length > 0) {
    return null;
  }

  if (pageFields.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none', // allow click-through except on widgets
        zIndex: 5, // above TilingLayer, below LinkLayer
      }}
      data-form-overlay-page={pageIndex}
    >
      {pageFields.map((field: FormField) =>
        (field.widgets || [])
          .filter((w: WidgetCoordinates) => w.pageIndex === pageIndex)
          .map((widget: WidgetCoordinates, widgetIdx: number) => {
            // Coordinates are in un-rotated PDF space (y-flipped to CSS TL origin).
            // The <Rotate> CSS wrapper handles visual rotation for us,
            // just like it does for TilingLayer, LinkLayer, etc.
            return (
              <WidgetInput
                key={`${field.name}-${widgetIdx}`}
                field={field}
                widget={widget}
                isActive={activeFieldName === field.name}
                error={validationErrors[field.name]}
                scaleX={scaleX}
                scaleY={scaleY}
                onFocus={handleFocus}
                onChange={handleChange}
              />
            );
          })
      )}
    </div>
  );
}

export default FormFieldOverlay;
