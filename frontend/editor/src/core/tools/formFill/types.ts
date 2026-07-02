/**
 * Types for the Form Fill PDF Viewer feature.
 * These mirror the backend FormFieldWithCoordinates model.
 */

export interface WidgetCoordinates {
  pageIndex: number;
  x: number; // PDF points, un-rotated, CSS upper-left origin
  y: number; // PDF points, un-rotated, CSS upper-left origin
  width: number; // PDF points
  height: number; // PDF points
  /** Export value for this specific widget (radio/checkbox only) */
  exportValue?: string;
  /** Font size in PDF points */
  fontSize?: number;
  /**
   * CropBox height in PDF points for the page this widget sits on. Lets the
   * editor reverse the backend's Y-flip when sending new/changed coordinates
   * back for create/modify operations.
   */
  cropBoxHeight?: number;
}

export interface FormField {
  name: string;
  label: string;
  type: FormFieldType;
  value: string;
  /** Export values used for data binding (sent to backend) */
  options: string[] | null;
  /** Human-readable display labels parallel to options. Null when same as options. */
  displayOptions: string[] | null;
  required: boolean;
  readOnly: boolean;
  multiSelect: boolean;
  multiline: boolean;
  tooltip: string | null;
  widgets: WidgetCoordinates[] | null;
  /** Visual label for push buttons (from /MK/CA in the PDF appearance dict) */
  buttonLabel?: string | null;
  /** Action descriptor for push buttons */
  buttonAction?: ButtonAction | null;
  /** Pre-rendered appearance image for signed signature fields (data URL). */
  appearanceDataUrl?: string;
}

export type FormFieldType =
  | "text"
  | "checkbox"
  | "combobox"
  | "listbox"
  | "radio"
  | "button"
  | "signature";

export type ButtonActionType =
  | "named"
  | "javascript"
  | "submitForm"
  | "resetForm"
  | "uri"
  | "none";

export interface ButtonAction {
  type: ButtonActionType;
  /** For 'named' actions: the PDF action name (e.g. 'Print', 'NextPage', 'PrevPage') */
  namedAction?: string;
  /** For 'javascript' actions: the JavaScript source code */
  javascript?: string;
  /** For 'submitForm' / 'uri' actions: the target URL */
  url?: string;
  /** For 'submitForm' actions: submit flags bitmask */
  submitFlags?: number;
}

/**
 * Field types that can be created/edited structurally through the editor.
 */
export type CreatableFieldType =
  | "text"
  | "checkbox"
  | "combobox"
  | "listbox"
  | "radio"
  | "button"
  | "signature";

export const CREATABLE_FIELD_TYPES: CreatableFieldType[] = [
  "text",
  "checkbox",
  "combobox",
  "listbox",
  "radio",
  "button",
  "signature",
];

/**
 * A new field queued for creation. Coordinates are CropBox-relative,
 * lower-left-origin PDF points — the reverse of what the backend emits in
 * WidgetCoordinates, ready to POST to /api/v1/form/add-fields.
 */
export interface NewFieldDefinition {
  name: string;
  label?: string;
  type: CreatableFieldType;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required?: boolean;
  multiSelect?: boolean;
  options?: string[];
  defaultValue?: string;
  tooltip?: string;
  fontSize?: number;
  readOnly?: boolean;
  multiline?: boolean;
  maxLength?: number; // text only; >0 also makes it a comb field
  /** Push-button activation action: "reset" | "print" | "uri:<url>" | "submit:<url>" */
  buttonAction?: string;
}

/**
 * A change to an existing field. Only non-undefined properties are applied.
 * Coordinates (when present) are CropBox-relative, lower-left-origin PDF points.
 */
export interface ModifyFieldDefinition {
  targetName: string;
  name?: string;
  label?: string;
  type?: FormFieldType;
  pageIndex?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  required?: boolean;
  multiSelect?: boolean;
  options?: string[];
  defaultValue?: string;
  tooltip?: string;
  fontSize?: number;
  readOnly?: boolean;
  multiline?: boolean;
  maxLength?: number; // text only; >0 also makes it a comb field
}

/** A batch of field edits committed in one request via /api/v1/form/edit-fields. */
export interface FieldEditBatch {
  add?: NewFieldDefinition[];
  modify?: ModifyFieldDefinition[];
  delete?: string[];
}

/** The form tool's working mode. */
export type FormMode = "fill" | "create" | "modify";

export interface FormFillState {
  /** Fields fetched from backend with coordinates */
  fields: FormField[];
  /** Current user-entered values keyed by field name */
  values: Record<string, string>;
  /** Whether a backend fetch is in progress */
  loading: boolean;
  /** Error message from fetch */
  error: string | null;
  /** Currently focused/selected field name */
  activeFieldName: string | null;
  /** Whether the form has been modified */
  isDirty: boolean;
  /** Current validation errors keyed by field name */
  validationErrors: Record<string, string>;
}
