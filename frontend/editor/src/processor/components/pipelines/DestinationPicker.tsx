import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { ActionIcon, Button, FormField, Select } from "@app/ui";

/**
 * Picks the saved source a pipeline delivers its output to. A destination is just a
 * source used as a write target. The value stays a list ({@code outputIds}) because
 * the model supports several, but the product caps a pipeline at one destination
 * today, so this renders a single dropdown over the same locations the builder
 * loaded (filtered to writable types by the caller). Creating and editing one are
 * delegated to {@code onCreateNew} / {@code onEdit}, which open the source modal
 * over the builder - mirroring the input row.
 */
interface DestinationOption {
  id: string;
  name: string;
}

interface DestinationPickerProps {
  sources: DestinationOption[];
  value: string[];
  onChange: (outputIds: string[]) => void;
  /** Create a new source location to write to (opens the source modal). */
  onCreateNew: () => void;
  /** Edit the chosen destination's own settings (opens the source modal on it). */
  onEdit: (sourceId: string) => void;
}

export function DestinationPicker({
  sources,
  value,
  onChange,
  onCreateNew,
  onEdit,
}: DestinationPickerProps) {
  const { t } = useTranslation();
  const chosen = value[0] ?? "";
  const hasSources = sources.length > 0;

  // Mirrors the input row: the dropdown-plus-edit sits in a field, and "Connect source" lives on its
  // own line below rather than inline. With nowhere to write to yet, only the connect button shows.
  return (
    <>
      {hasSources && (
        <FormField label={t("processor.pipelines.composer.output")}>
          <div className="processor-builder__input-row">
            <div className="processor-builder__input-field">
              <Select
                inputSize="sm"
                aria-label={t("processor.pipelines.composer.output")}
                placeholder={t("processor.pipelines.builder.chooseDestination")}
                value={value[0] ?? null}
                invalid={value.length !== 1}
                onChange={(id) => onChange(id ? [id] : [])}
                options={sources.map((source) => ({
                  value: source.id,
                  label: source.name,
                }))}
              />
            </div>
            <ActionIcon
              variant="tertiary"
              className="processor-builder__source-edit"
              aria-label={t("processor.pipelines.composer.editSource")}
              disabled={chosen === ""}
              onClick={() => onEdit(chosen)}
            >
              <EditOutlinedIcon style={{ fontSize: "1rem" }} />
            </ActionIcon>
          </div>
        </FormField>
      )}
      <Button
        variant="tertiary"
        size="sm"
        onClick={onCreateNew}
        leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
      >
        {t("processor.sources.actions.connectSource")}
      </Button>
    </>
  );
}
