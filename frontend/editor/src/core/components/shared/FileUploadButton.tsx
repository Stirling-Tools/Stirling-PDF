import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { FilePicker } from "@app/ui/FilePicker";
import type { ButtonVariant } from "@app/ui/Button";

// Accept both shared DS variants and the legacy Mantine variant names that
// existing callers still pass, mapping the latter onto the DS equivalents.
type LegacyVariant =
  | "outline"
  | "filled"
  | "light"
  | "default"
  | "subtle"
  | "gradient";

const VARIANT_MAP: Record<LegacyVariant, ButtonVariant> = {
  filled: "primary",
  outline: "secondary",
  default: "secondary",
  light: "tertiary",
  subtle: "tertiary",
  gradient: "primary",
};

function resolveVariant(variant: ButtonVariant | LegacyVariant): ButtonVariant {
  return variant in VARIANT_MAP
    ? VARIANT_MAP[variant as LegacyVariant]
    : (variant as ButtonVariant);
}

interface FileUploadButtonProps {
  file?: File;
  onChange: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
  placeholder?: string;
  variant?: ButtonVariant | LegacyVariant;
  fullWidth?: boolean;
}
const FileUploadButton = ({
  file,
  onChange,
  accept,
  disabled = false,
  placeholder,
  variant = "secondary",
  fullWidth = true,
}: FileUploadButtonProps) => {
  const { t } = useTranslation();
  const resetRef = useRef<() => void>(null);
  const defaultPlaceholder = t("chooseFile", "Choose File");
  return (
    <FilePicker
      resetRef={resetRef}
      onChange={onChange}
      accept={accept}
      disabled={disabled}
      variant={resolveVariant(variant)}
      fullWidth={fullWidth}
    >
      {file ? file.name : placeholder || defaultPlaceholder}
    </FilePicker>
  );
};
export default FileUploadButton;
