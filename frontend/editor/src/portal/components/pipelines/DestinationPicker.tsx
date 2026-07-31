import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Button, Select } from "@app/ui";

/**
 * Picks the saved source a pipeline delivers its output to. A destination is just a
 * source used as a write target. The value stays a list ({@code outputIds}) because
 * the model supports several, but the product caps a pipeline at one destination
 * today, so this renders a single dropdown over the same locations the builder
 * loaded (filtered to writable types by the caller). Creating a new one is delegated
 * to {@code onCreateNew} (the builder navigates to the source builder, prompting
 * about unsaved edits first).
 */
interface DestinationOption {
  id: string;
  name: string;
}

interface DestinationPickerProps {
  sources: DestinationOption[];
  value: string[];
  onChange: (outputIds: string[]) => void;
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
    <div className="portal-builder__input-row">
      <div className="portal-builder__input-field">
        <Select
          inputSize="sm"
          aria-label={t("portal.pipelines.composer.output")}
          placeholder={t("portal.pipelines.builder.chooseDestination")}
          value={value[0] ?? null}
          invalid={value.length !== 1}
          onChange={(id) => onChange(id ? [id] : [])}
          options={sources.map((source) => ({
            value: source.id,
            label: source.name,
          }))}
        />
      </div>
      <Button
        variant="tertiary"
        size="sm"
        onClick={onCreateNew}
        leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
      >
        {t("portal.sources.actions.connectSource")}
      </Button>
    </div>
  );
}
