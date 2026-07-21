import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Button, Checkbox } from "@app/ui";

/**
 * Picks the saved sources a pipeline delivers its output to. A destination is just
 * a source used as a write target, and a pipeline may write to several, so this is
 * a checklist over the same locations the builder loaded (filtered to writable
 * types by the caller) - mirroring the input-sources checklist. Creating a new one
 * is delegated to {@code onCreateNew} (the builder navigates to the source builder,
 * prompting about unsaved edits first).
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

  function toggle(id: string, checked: boolean) {
    onChange(
      checked ? [...value, id] : value.filter((existing) => existing !== id),
    );
  }

  return (
    <>
      <div className="portal-pipelines__source-list">
        {sources.map((source) => (
          <Checkbox
            key={source.id}
            checked={value.includes(source.id)}
            onChange={(e) => toggle(source.id, e.target.checked)}
            label={source.name}
          />
        ))}
      </div>
      <Button
        variant="tertiary"
        size="sm"
        onClick={onCreateNew}
        leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
      >
        {t("portal.pipelines.composer.outputCreateNew")}
      </Button>
    </>
  );
}
