import { useTranslation } from "react-i18next";
import { Button, Select } from "@app/ui";

/**
 * Picks the saved source a pipeline delivers its output to. A destination is just
 * a source used as a write target, so this selects from the same locations the
 * builder already loaded (filtered to writable types by the caller). Creating a
 * new one is delegated to {@code onCreateNew} (the builder navigates to the source
 * builder, prompting about unsaved edits first), mirroring "Connect source".
 */
interface DestinationOption {
  id: string;
  name: string;
}

interface DestinationPickerProps {
  sources: DestinationOption[];
  value: string;
  onChange: (sourceId: string) => void;
  /** Leave the builder to create a new source location (navigate-away, like inputs). */
  onCreateNew: () => void;
}

export function DestinationPicker({
  sources,
  value,
  onChange,
  onCreateNew,
}: DestinationPickerProps) {
  const { t } = useTranslation();
  return (
    <div className="portal-sources__connection-picker">
      <Select
        value={value || null}
        placeholder={t("portal.pipelines.composer.outputPlaceholder")}
        options={sources.map((source) => ({
          value: source.id,
          label: source.name,
        }))}
        onChange={(selected) => onChange(selected ?? "")}
      />
      <Button variant="tertiary" size="sm" onClick={onCreateNew}>
        {t("portal.pipelines.composer.outputCreateNew")}
      </Button>
    </div>
  );
}
