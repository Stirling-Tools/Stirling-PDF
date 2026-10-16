import type { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";

export interface MacKeychainPickerProps {
  parameters: CertSignParameters;
  onParameterChange: <K extends keyof CertSignParameters>(
    key: K,
    value: CertSignParameters[K],
  ) => void;
  disabled?: boolean;
}

export function MacKeychainPicker(_props: MacKeychainPickerProps) {
  return null;
}
