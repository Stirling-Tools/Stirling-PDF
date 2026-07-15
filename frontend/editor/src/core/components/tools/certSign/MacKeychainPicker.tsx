import type { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";

export interface MacKeychainPickerProps {
  parameters: CertSignParameters;
  onParameterChange: (key: keyof CertSignParameters, value: any) => void;
  disabled?: boolean;
}

export function MacKeychainPicker(_props: MacKeychainPickerProps) {
  return null;
}
