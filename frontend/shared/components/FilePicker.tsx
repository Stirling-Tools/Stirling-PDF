import { FileButton as MantineFileButton } from "@mantine/core";
import type { ForwardedRef, ReactNode } from "react";
import { Button } from "@shared/components/Button";
import type { ButtonProps } from "@shared/components/Button";

type TriggerButtonProps = Omit<ButtonProps, "onClick" | "onChange" | "children">;

export interface FilePickerProps<Multiple extends boolean = false>
  extends TriggerButtonProps {
  /** Called with the picked file(s); null when the dialog is dismissed. */
  onChange: (payload: Multiple extends true ? File[] : File | null) => void;
  accept?: string;
  multiple?: Multiple;
  /** Ref to a function that clears the current selection (Mantine resetRef). */
  resetRef?: ForwardedRef<() => void>;
  name?: string;
  capture?: boolean | "user" | "environment";
  /** Trigger label. */
  children?: ReactNode;
}

/** A file-picker button: a shared Button trigger wired to a hidden file input
 * (Mantine FileButton under the hood). Use this instead of Mantine FileButton
 * so app code stays on the shared design system. Takes all Button styling props
 * (variant/accent/size/leftSection/fullWidth/…). */
export function FilePicker<Multiple extends boolean = false>({
  onChange,
  accept,
  multiple,
  resetRef,
  name,
  capture,
  disabled,
  children,
  ...buttonProps
}: FilePickerProps<Multiple>) {
  return (
    <MantineFileButton<Multiple>
      onChange={onChange}
      accept={accept}
      multiple={multiple}
      resetRef={resetRef}
      name={name}
      capture={capture}
      disabled={disabled}
    >
      {(props) => (
        <Button {...buttonProps} {...props} disabled={disabled}>
          {children}
        </Button>
      )}
    </MantineFileButton>
  );
}
