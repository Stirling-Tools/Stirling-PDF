import { useRef } from "react";
import { FileButton, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface FileUploadButtonProps {
  file?: File;
  onChange: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
  placeholder?: string;
  variant?: "outline" | "filled" | "light" | "default" | "subtle" | "gradient";
  fullWidth?: boolean;
}

const FileUploadButton = ({
  file,
  onChange,
  accept,
  disabled = false,
  placeholder,
  variant = "outline",
  fullWidth = true
}: FileUploadButtonProps) => {
  const { t } = useTranslation();
  const resetRef = useRef<() => void>(null);

  const defaultPlaceholder = t('chooseFile', 'Choose File');

  return (
    <FileButton
      resetRef={resetRef}
      onChange={onChange}
      accept={accept}
      disabled={disabled}

    >
      {(props) => (
        <Button {...props} variant={variant} fullWidth={fullWidth} color="blue">
          {file ? file.name : (placeholder || defaultPlaceholder)}
        </Button>
      )}
    </FileButton>
  );
};

export default FileUploadButton;
