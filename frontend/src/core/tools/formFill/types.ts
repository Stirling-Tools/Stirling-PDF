/**
 * Types for the Form Fill PDF Viewer feature.
 * These mirror the backend FormFieldWithCoordinates model.
 */

export interface WidgetCoordinates {
  pageIndex: number;
  x: number;      // PDF points, un-rotated, CSS upper-left origin
  y: number;      // PDF points, un-rotated, CSS upper-left origin
  width: number;  // PDF points
  height: number; // PDF points
  /** Export value for this specific widget (radio/checkbox only) */
  exportValue?: string;
  /** Font size in PDF points */
  fontSize?: number;
  /** CropBox height in PDF points (used for Y-flip) */
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
}

export type FormFieldType =
  | 'text'
  | 'checkbox'
  | 'combobox'
  | 'listbox'
  | 'radio'
  | 'button'
  | 'signature';

/** Mirrors backend NewFormFieldDefinition — used when creating fields */
export interface NewFieldDefinition {
  name: string;
  label?: string;
  type: FormFieldType;
  pageIndex: number;
  x: number;       // PDF lower-left origin
  y: number;       // PDF lower-left origin
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
}

/** Mirrors backend ModifyFormFieldDefinition — used when editing existing fields */
export interface ModifyFieldDefinition {
  targetName: string;
  name?: string;
  label?: string;
  type?: string;
  pageIndex?: number;
  x?: number;       // PDF lower-left origin
  y?: number;       // PDF lower-left origin
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
}

export type FormMode = 'fill' | 'make' | 'batch' | 'modify';

/** Tracks the state of field creation (Create mode) */
export interface FieldCreationState {
  /** Queue of fields pending backend commit */
  pendingFields: NewFieldDefinition[];
  /** The field type currently selected for placement (null = no placement active) */
  placingFieldType: FormFieldType | null;
  /** Rectangle being drawn (CSS coords, only non-null during drag) */
  dragRect: { x: number; y: number; width: number; height: number; pageIndex: number } | null;
}

/** Tracks the state of field editing (Modify mode) */
export interface FieldEditState {
  /** Name of the currently selected field */
  selectedFieldName: string | null;
  /** Interaction in progress */
  interaction: 'idle' | 'moving' | 'resizing';
  /** The pending rectangle during drag (CSS coords) — null when idle */
  pendingRect: { x: number; y: number; width: number; height: number } | null;
}

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
