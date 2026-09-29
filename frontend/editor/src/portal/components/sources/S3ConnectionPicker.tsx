import { ConnectionPicker } from "@portal/components/sources/ConnectionPicker";

/**
 * The S3 slot on a source or pipeline output. A thin alias over {@link ConnectionPicker} so the
 * `control: "s3Connection"` field descriptor keeps its name and call sites stay untouched.
 */
interface S3ConnectionPickerProps {
  value: string;
  onChange: (connectionId: string) => void;
  /** Forwarded to {@link ConnectionPicker}: hosts inside a modal create in-place. */
  onCreateNew?: () => void;
}

export function S3ConnectionPicker({
  value,
  onChange,
  onCreateNew,
}: S3ConnectionPickerProps) {
  return (
    <ConnectionPicker
      value={value}
      onChange={onChange}
      integrationType="S3"
      createTypeId="s3"
      onCreateNew={onCreateNew}
    />
  );
}
