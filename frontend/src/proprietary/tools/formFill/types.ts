/**
 * Types for the Form Fill PDF Viewer feature.
 * These mirror the backend FormFieldWithCoordinates model.
 */

export interface WidgetCoordinates {
  pageIndex: number;
  x: number;      // PDF points, lower-left origin
  y: number;      // PDF points, lower-left origin
  width: number;  // PDF points
  height: number; // PDF points
  /** Export value for this specific widget (radio/checkbox only) */
  exportValue?: string;
  /** Font size in PDF points */
  fontSize?: number;
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
