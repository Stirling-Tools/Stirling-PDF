export interface DocumentStyleSelection {
  primaryColor?: string;
  backgroundColor?: string;
  bodyTextColor?: string;
}

interface DocumentStylePickerProps {
  value: DocumentStyleSelection;
  onChange: (value: DocumentStyleSelection) => void;
}

export function DocumentStylePicker(_props: DocumentStylePickerProps) {
  return null;
}
