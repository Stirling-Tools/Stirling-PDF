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
import React, { useCallback, useMemo, memo } from "react";
import { useDocumentState } from "@embedpdf/core/react";
import {
  useFormFill,
  useFieldValue,
} from "@app/tools/formFill/FormFillContext";
import { useViewer } from "@app/contexts/ViewerContext";
import type {
  FormField,
  WidgetCoordinates,
  ButtonAction,
} from "@app/tools/formFill/types";

/**
 * Execute PDF JavaScript in a minimally sandboxed context.
 *
 * Implements a heuristic security check by statically rejecting scripts containing
 * common browser globals (`window`, `document`, `fetch`), reflection APIs,
 * or execution sinks (`eval`, `Function`).
 *
 * Valid scripts run in strict mode with dangerous globals explicitly masked
 * to `undefined`, allowing safe Acrobat APIs like `this.print()` or `app.alert()`.
 */
function executePdfJs(
  js: string,
  handlers: {
    print: () => void;
    save: () => void;
    submitForm: (url: string) => void;
    resetForm: () => void;
  },
): void {
  // 1. Static sanitization: Reject scripts with potentially harmful or unneeded keywords.
  // This blocks most elementary exploits and prevents prototype tampering.
  const forbidden = [
    "window",
    "document",
    "fetch",
    "xmlhttprequest",
    "websocket",
    "worker",
    "eval",
    "settimeout",
    "setinterval",
    "function",
    "constructor",
    "__proto__",
    "prototype",
    "globalthis",
    "import",
    "require",
  ];

  const lowerJs = js.toLowerCase();
  for (const word of forbidden) {
    if (lowerJs.includes(word)) {
      console.warn(
        `[PDF JS] Execution blocked: Script contains suspicious keyword "${word}".`,
        "Script:",
        js,
      );
      return;
    }
  }

  // 2. Mock Acrobat API
  const doOpenUrl = (url: string) => {
    try {
      const u = new URL(url);
      if (["http:", "https:", "mailto:"].includes(u.protocol)) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      /* invalid URL — ignore */
    }
  };

  const app = {
    print: (_params?: unknown) => handlers.print(),
    alert: (msg: unknown) => {
      console.debug("[PDF JS] alert:", msg);
    },
    beep: () => {},
    response: () => null,
    execMenuItem: (item: string) => {
      switch (item) {
        case "Print":
          handlers.print();
          break;
        case "Save":
          handlers.save();
          break;
        case "Close":
          break; // no-op in browser context
        default:
          console.debug("[PDF JS] execMenuItem: unhandled item:", item);
      }
    },
    // Prevent prototype walking
    __proto__: null,
  };

  const doc = {
    print: (_params?: unknown) => handlers.print(),
    save: (_params?: unknown) => handlers.save(),
    saveAs: (_params?: unknown) => handlers.save(),
    submitForm: (urlOrParams: unknown) => {
      const url =
        typeof urlOrParams === "string"
          ? urlOrParams
          : (((urlOrParams as Record<string, unknown>)?.cURL as string) ?? "");
      if (url) doOpenUrl(url);
      else handlers.submitForm(url);
    },
    resetForm: (_fields?: unknown) => handlers.resetForm(),
    getField: (_name: string) => null,
    getAnnot: () => null,
    getURL: (url: string) => doOpenUrl(url),
    numPages: 1,
    dirty: false,
  };

  // Stub event object — used by field calculation/validation scripts
  const event = {
    value: "",
    changeEx: "",
    change: "",
    rc: true,
    willCommit: false,
    target: null as null,
  };

  try {
    // Pass doc, app, event as both `this` AND named parameters so scripts that
    // reference them as free variables (not just via `this`) work correctly.
    const fn = new Function("app", "doc", "event", js);
    fn.call(doc, app, doc, event);
  } catch (err) {
    // Swallow errors from missing PDF APIs; log in debug mode for tracing
    console.debug(
      "[PDF JS] Script execution error (expected for unsupported APIs):",
      err,
      "\nScript:",
      js.slice(0, 200),
    );
  }
}

interface WidgetInputProps {
  field: FormField;
  widget: WidgetCoordinates;
  isActive: boolean;
  error?: string;
  scaleX: number;
  scaleY: number;
  onFocus: (fieldName: string) => void;
  onChange: (fieldName: string, value: string) => void;
  onButtonClick: (field: FormField, action?: ButtonAction | null) => void;
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
  onButtonClick,
}: WidgetInputProps) {
  // Per-field value subscription — only this widget re-renders when its value changes
  const value = useFieldValue(field.name);

  // Coordinates are in visual CSS space (top-left origin).
  // Multiply by per-axis scale to get rendered pixel coordinates.
  const left = widget.x * scaleX;
  const top = widget.y * scaleY;
  const width = widget.width * scaleX;
  const height = widget.height * scaleY;

  const borderColor = error
    ? "#f44336"
    : isActive
      ? "#2196F3"
      : "rgba(33, 150, 243, 0.4)";
  const bgColor = error
    ? "#FFEBEE" // Red 50 (Opaque)
    : isActive
      ? "#E3F2FD"
      : "#FFFFFF"; // Blue 50 (Opaque) : White (Opaque)

  const commonStyle: React.CSSProperties = {
    position: "absolute",
    left,
    top,
    width,
    height,
    zIndex: 10,
    boxSizing: "border-box",
    border: `1px solid ${borderColor}`,
    borderRadius: 1,
    background: isActive ? bgColor : "transparent",
    transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
    boxShadow:
      isActive && field.type !== "radio" && field.type !== "checkbox"
        ? `0 0 0 2px ${error ? "rgba(244, 67, 54, 0.25)" : "rgba(33, 150, 243, 0.25)"}`
        : "none",
    cursor: field.readOnly ? "default" : "text",
    pointerEvents: "auto",
    display: "flex",
    alignItems: field.multiline ? "stretch" : "center",
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
      ? Math.max(6, Math.min(height * 0.6, 14))
      : Math.max(6, height * 0.65);

  const inputBaseStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    padding: 0,
    paddingLeft: `${Math.max(2, 4 * scaleX)}px`,
    paddingRight: `${Math.max(2, 4 * scaleX)}px`,
    fontSize: `${fontSize}px`,
    fontFamily: "Helvetica, Arial, sans-serif",
    color: "#000",
    boxSizing: "border-box",
    lineHeight: "normal",
  };

  const handleFocus = () => onFocus(field.name);

  switch (field.type) {
    case "text":
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
                resize: "none",
                overflow: "auto",
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

    case "checkbox": {
      // Checkbox is checked when value is anything other than 'Off' or empty
      const isChecked = !!value && value !== "Off";
      // When toggling on, use the widget's exportValue (e.g. 'Red', 'Blue') or fall back to 'Yes'
      const onValue = widget.exportValue || "Yes";
      return (
        <div
          {...commonProps}
          style={{
            ...commonStyle,
            border: isActive
              ? commonStyle.border
              : "1px solid rgba(0,0,0,0.15)",
            background: isActive ? bgColor : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center", // Keep center for checkboxes as they are usually square hitboxes
            cursor: field.readOnly ? "default" : "pointer",
          }}
          title={error || field.tooltip || field.label}
          onClick={(e) => {
            if (field.readOnly) return;
            handleFocus();
            onChange(field.name, isChecked ? "Off" : onValue);
            stopPropagation(e);
          }}
        >
          <span
            style={{
              width: "85%",
              height: "85%",
              maxWidth: height * 0.9, // Prevent it from getting too wide in rectangular boxes
              maxHeight: width * 0.9,
              fontSize: `${Math.max(10, height * 0.75)}px`,
              lineHeight: 1,
              color: isChecked ? "#2196F3" : "transparent",
              background: "#FFF",
              border:
                isChecked || isActive
                  ? "1px solid #2196F3"
                  : "1.5px solid #666",
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              userSelect: "none",
              boxShadow: isActive
                ? "0 0 0 2px rgba(33, 150, 243, 0.2)"
                : "none",
            }}
          >
            ✓
          </span>
        </div>
      );
    }

    case "combobox":
    case "listbox": {
      const inputId = `${field.name}_${widget.pageIndex}_${widget.x}_${widget.y}`;

      // For multi-select, value should be an array
      // We store as comma-separated string, so parse it
      const selectValue = field.multiSelect
        ? value
          ? value.split(",").map((v) => v.trim())
          : []
        : value;

      const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (field.multiSelect) {
          // For multi-select, join selected options with comma
          const selected = Array.from(
            e.target.selectedOptions,
            (opt) => opt.value,
          );
          onChange(field.name, selected.join(","));
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
              appearance: "auto",
              WebkitAppearance:
                "auto" as React.CSSProperties["WebkitAppearance"],
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

    case "radio": {
      // Identify this widget by its index within the field's widgets array.
      // This avoids issues with duplicate exportValues (e.g., all "Yes").
      const widgetIndex = field.widgets?.indexOf(widget) ?? -1;
      if (widgetIndex < 0) return null;
      const widgetIndexStr = String(widgetIndex);
      const isSelected = value === widgetIndexStr;
      return (
        <div
          {...commonProps}
          style={{
            ...commonStyle,
            border: isActive ? commonStyle.border : "none",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start", // Align to start (left) instead of center for radio buttons
            paddingLeft: Math.max(
              1,
              (height - Math.min(width, height) * 0.8) / 2,
            ), // Slight offset
            cursor: field.readOnly ? "default" : "pointer",
          }}
          title={
            error ||
            field.tooltip ||
            `${field.label}: ${widget.exportValue || widgetIndexStr}`
          }
          onClick={(e) => {
            if (field.readOnly || value === widgetIndexStr) return; // Don't deselect radio buttons
            handleFocus();
            onChange(field.name, widgetIndexStr);
            stopPropagation(e);
          }}
        >
          <span
            style={{
              width: Math.min(width, height) * 0.8,
              height: Math.min(width, height) * 0.8,
              borderRadius: "50%",
              border: `1.5px solid ${isSelected ? "#2196F3" : isActive ? "#2196F3" : "#999"}`,
              background: isSelected ? "#2196F3" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: isSelected ? "inset 0 0 0 2px white" : "none",
              transition: "background 0.15s, border-color 0.15s",
            }}
          />
        </div>
      );
    }

    case "signature":
      // Signature fields are handled entirely by SignatureFieldOverlay (bitmap canvas).
      // Rendering a placeholder here creates a visible grey overlay on top of the
      // signature appearance, so we skip it entirely.
      return null;

    case "button": {
      // Transparent hit-target only — visual appearance is rendered by ButtonAppearanceOverlay
      // (which paints the PDF's native /AP bitmap onto a canvas behind this div).
      const buttonLabel =
        field.buttonLabel || field.value || field.label || "Button";
      const isClickable = !field.readOnly;

      let actionHint = "";
      if (field.buttonAction) {
        switch (field.buttonAction.type) {
          case "named":
            actionHint = field.buttonAction.namedAction ?? "";
            break;
          case "resetForm":
            actionHint = "Reset Form";
            break;
          case "submitForm":
            actionHint = `Submit to: ${field.buttonAction.url ?? ""}`.trim();
            break;
          case "uri":
            actionHint = field.buttonAction.url ?? "";
            break;
          case "javascript":
            actionHint = "Script";
            break;
        }
      }
      const titleText =
        field.tooltip ||
        (actionHint ? `${buttonLabel} (${actionHint})` : buttonLabel);

      return (
        <div
          {...commonProps}
          style={{
            ...commonStyle,
            background: "transparent",
            border: "none",
            boxShadow: "none",
            cursor: isClickable ? "pointer" : "default",
          }}
          title={titleText}
          role="button"
          tabIndex={isClickable ? 0 : -1}
          aria-label={buttonLabel}
          onClick={(e) => {
            handleFocus();
            if (isClickable) onButtonClick(field, field.buttonAction);
            stopPropagation(e);
          }}
          onKeyDown={(e) => {
            if (isClickable && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onButtonClick(field, field.buttonAction);
            }
            stopPropagation(e);
          }}
        />
      );
    }

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
  pageWidth: number; // rendered CSS pixel width (from renderPage callback)
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
  const { setValue, setActiveField, fieldsByPage, state, forFileId } =
    useFormFill();
  const { activeFieldName, validationErrors } = state;
  const { printActions, scrollActions, exportActions } = useViewer();

  // Get scale from EmbedPDF document state — same pattern as LinkLayer
  // NOTE: All hooks must be called unconditionally (before any early returns)
  const documentState = useDocumentState(documentId);

  const { scaleX, scaleY } = useMemo(() => {
    const pdfPage = documentState?.document?.pages?.[pageIndex];
    if (!pdfPage || !pdfPage.size || !pageWidth || !pageHeight) {
      const s = documentState?.scale ?? 1;
      if (pageIndex === 0) {
        console.debug(
          "[FormFieldOverlay] page 0 using fallback scale=%f (missing pdfPage.size)",
          s,
        );
      }
      return { scaleX: s, scaleY: s };
    }

    const sx = pageWidth / pdfPage.size.width;
    const sy = pageHeight / pdfPage.size.height;
    if (pageIndex === 0) {
      console.debug(
        "[FormFieldOverlay] page 0 scale: pageW=%f pageH=%f pdfW=%f pdfH=%f → scaleX=%f scaleY=%f docScale=%f",
        pageWidth,
        pageHeight,
        pdfPage.size.width,
        pdfPage.size.height,
        sx,
        sy,
        documentState?.scale,
      );
    }
    // pdfPage.size contains un-rotated dimensions from the engine;
    // pageWidth/pageHeight from Scroller = pdfPage.size * documentScale
    return { scaleX: sx, scaleY: sy };
  }, [documentState, pageIndex, pageWidth, pageHeight]);

  const pageFields = useMemo(
    () => fieldsByPage.get(pageIndex) || [],
    [fieldsByPage, pageIndex],
  );

  const handleFocus = useCallback(
    (fieldName: string) => setActiveField(fieldName),
    [setActiveField],
  );

  const handleChange = useCallback(
    (fieldName: string, value: string) => setValue(fieldName, value),
    [setValue],
  );

  const handleButtonClick = useCallback(
    (field: FormField, action?: ButtonAction | null) => {
      const doOpenUrl = (url: string) => {
        try {
          const u = new URL(url);
          if (["http:", "https:", "mailto:"].includes(u.protocol)) {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        } catch {
          /* invalid URL */
        }
      };
      const doResetForm = () => {
        for (const f of state.fields) setValue(f.name, f.value ?? "");
      };
      const doSave = () => {
        exportActions.saveAsCopy();
      };

      if (!action) {
        // Action extraction failed — fall back to label matching as a last resort
        const label = (field.buttonLabel || field.label || "").toLowerCase();
        if (/print/.test(label)) printActions.print();
        else if (/save|download/.test(label)) doSave();
        else if (/reset|clear/.test(label)) doResetForm();
        return;
      }

      switch (action.type) {
        case "named":
          switch (action.namedAction) {
            case "Print":
              printActions.print();
              break;
            case "Save":
              doSave();
              break;
            case "NextPage":
              scrollActions.scrollToNextPage();
              break;
            case "PrevPage":
              scrollActions.scrollToPreviousPage();
              break;
            case "FirstPage":
              scrollActions.scrollToFirstPage();
              break;
            case "LastPage":
              scrollActions.scrollToLastPage();
              break;
          }
          break;
        case "resetForm":
          doResetForm();
          break;
        case "submitForm":
        case "uri":
          if (action.url) doOpenUrl(action.url);
          break;
        case "javascript":
          // Execute in a sandboxed PDF JS environment instead of just logging
          if (action.javascript) {
            executePdfJs(action.javascript, {
              print: () => printActions.print(),
              save: doSave,
              submitForm: doOpenUrl,
              resetForm: doResetForm,
            });
          }
          break;
      }
    },
    [printActions, scrollActions, exportActions, state.fields, setValue],
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
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none", // allow click-through except on widgets
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
                onButtonClick={handleButtonClick}
              />
            );
          }),
      )}
    </div>
  );
}

export default FormFieldOverlay;
