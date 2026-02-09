/**
 * FormFieldOverlay — Renders interactive HTML form widgets on top of a PDF page.
 *
 * This layer is placed inside the renderPage callback of the EmbedPDF Scroller,
 * similar to how AnnotationLayer, RedactionLayer, and LinkLayer work.
 *
 * It reads the form field coordinates (in PDF space, lower-left origin) and converts
 * them to CSS coordinates using the document scale from EmbedPDF, exactly like
 * LinkLayer does for link annotations.
 *
 * Each widget renders an appropriate HTML input (text, checkbox, dropdown, etc.)
 * that synchronises bidirectionally with FormFillContext values.
 *
 * Rotation handling:
 * The backend (FormUtils.java) transforms widget coordinates from the unrotated
 * MediaBox space into a rotated coordinate space (accounting for /Rotate).
 * However, the EmbedPDF <Rotate> component applies CSS rotation to the entire
 * page content (including this overlay). To avoid double-rotation, we inverse-
 * transform the backend coordinates back to the unrotated space and use uniform
 * scaling. The CSS <Rotate> transform then handles all visual rotation.
 */
import React, { useCallback, useMemo, memo } from 'react';
import { useDocumentState } from '@embedpdf/core/react';
import { useFormFill } from '@proprietary/tools/formFill/FormFillContext';
import type { FormField, WidgetCoordinates } from '@proprietary/tools/formFill/types';


function transformToUnrotated(
  bx: number, by: number, bw: number, bh: number,
  pageRotation: number, // 0=0°, 1=90°, 2=180°, 3=270° (quarter turns)
  pdfWidth: number,     // unrotated page width in PDF points
  pdfHeight: number,    // unrotated page height in PDF points
): { x: number; y: number; width: number; height: number } {
  switch (pageRotation) {
    case 1: // 90° — backend swapped coords and dimensions
      return {
        x: pdfWidth - by - bh,
        y: pdfHeight - bx - bw,
        width: bh,
        height: bw,
      };
    case 2: // 180° — backend reflected both axes
      return {
        x: pdfWidth - bx - bw,
        y: pdfHeight - by - bh,
        width: bw,
        height: bh,
      };
    case 3: // 270° — backend swapped coords and dimensions (opposite direction)
      return {
        x: by,
        y: bx,
        width: bh,
        height: bw,
      };
    default: // 0° — no transformation needed
      return { x: bx, y: by, width: bw, height: bh };
  }
}

interface WidgetInputProps {
  field: FormField;
  widget: WidgetCoordinates;
  value: string;
  isActive: boolean;
  error?: string;
  scaleX: number;
  scaleY: number;
  onFocus: (fieldName: string) => void;
  onChange: (fieldName: string, value: string) => void;
}

function WidgetInputInner({
  field,
  widget,
  value,
  isActive,
  error,
  scaleX,
  scaleY,
  onFocus,
  onChange,
}: WidgetInputProps) {
  // Coordinates are in PDF space (top-left origin relative to CropBox) from the backend.
  // Multiply by per-axis scale to get CSS coordinates.
  const left = widget.x * scaleX;
  const top = widget.y * scaleY;
  const width = widget.width * scaleX;
  const height = widget.height * scaleY;

  const borderColor = error ? '#f44336' : (isActive ? '#2196F3' : 'rgba(33, 150, 243, 0.4)');
  const bgColor = error
    ? 'rgba(244, 67, 54, 0.08)'
    : (isActive ? 'rgba(33, 150, 243, 0.08)' : 'rgba(255, 255, 255, 0.85)');

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

  // Scale font size with the widget height (using Y scale as a proxy for uniform font scaling)
  const fontSize = widget.fontSize
    ? widget.fontSize * scaleY
    : Math.max(8, Math.min(height * 0.65, 14));

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
        <div style={commonStyle} title={error || field.tooltip || field.label}>
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
          style={{
            ...commonStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: field.readOnly ? 'default' : 'pointer',
          }}
          title={error || field.tooltip || field.label}
          onClick={() => {
            if (field.readOnly) return;
            handleFocus();
            onChange(field.name, isChecked ? 'Off' : onValue);
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
      return (
        <div style={commonStyle} title={error || field.tooltip || field.label}>
          <select
            id={inputId}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            onFocus={handleFocus}
            disabled={field.readOnly}
            multiple={field.multiSelect}
            style={{
              ...inputBaseStyle,
              padding: 0,
              paddingLeft: 2,
              appearance: 'auto',
              WebkitAppearance: 'auto' as any,
            }}
            aria-label={field.label || field.name}
            aria-required={field.required}
            aria-invalid={!!error}
          >
            <option value="">— select —</option>
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
          style={{
            ...commonStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: field.readOnly ? 'default' : 'pointer',
          }}
          title={error || field.tooltip || `${field.label}: ${optionValue}`}
          onClick={() => {
            if (field.readOnly || value === optionValue) return; // Don't deselect radio buttons
            handleFocus();
            onChange(field.name, optionValue);
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
        <div style={commonStyle} title={field.tooltip || field.label}>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            onFocus={handleFocus}
            disabled={field.readOnly}
            style={inputBaseStyle}
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
}

export function FormFieldOverlay({
  documentId,
  pageIndex,
  pageWidth,
  pageHeight,
}: FormFieldOverlayProps) {
  const { state, setValue, setActiveField, fieldsByPage } = useFormFill();
  const { values, activeFieldName, validationErrors } = state;

  // Get scale from EmbedPDF document state — same pattern as LinkLayer
  const documentState = useDocumentState(documentId);

  const { scaleX, scaleY, pageRotation, pdfWidth, pdfHeight } = useMemo(() => {
    const pdfPage = documentState?.document?.pages?.[pageIndex];
    if (!pdfPage || !pdfPage.size || !pageWidth || !pageHeight) {
      const s = documentState?.scale ?? 1;
      return { scaleX: s, scaleY: s, pageRotation: 0, pdfWidth: 0, pdfHeight: 0 };
    }

    return {
      scaleX: pageWidth / pdfPage.size.width,
      scaleY: pageHeight / pdfPage.size.height,
      pageRotation: (pdfPage as any).rotation || 0,
      pdfWidth: pdfPage.size.width,
      pdfHeight: pdfPage.size.height,
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
            // Inverse-transform backend rotated coordinates back to unrotated space.
            // The CSS <Rotate> component handles the visual rotation.
            const unrotated = transformToUnrotated(
              widget.x, widget.y, widget.width, widget.height,
              pageRotation, pdfWidth, pdfHeight,
            );
            const adjustedWidget: WidgetCoordinates = {
              ...widget,
              x: unrotated.x,
              y: unrotated.y,
              width: unrotated.width,
              height: unrotated.height,
            };
            return (
              <WidgetInput
                key={`${field.name}-${widgetIdx}`}
                field={field}
                widget={adjustedWidget}
                value={values[field.name] ?? ''}
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
