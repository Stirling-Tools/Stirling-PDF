import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Select } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { fetchOutputs, type OutputView } from "@portal/api/outputs";

/**
 * Selects a saved output destination by id for a pipeline. Creating a new one is
 * delegated to {@code onCreateNew} (the pipeline builder navigates to the
 * full-page output builder, prompting about unsaved edits first), mirroring how
 * "Connect source" works.
 */
interface OutputPickerProps {
  value: string;
  onChange: (outputId: string) => void;
  /** Leave the builder to create a new output (navigate-away, like sources). */
  onCreateNew: () => void;
}

export function OutputPicker({
  value,
  onChange,
  onCreateNew,
}: OutputPickerProps) {
  const { t } = useTranslation();
  const [outputs, setOutputs] = useState<OutputView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchOutputs()
      .then((response) => {
        if (mounted) setOutputs(response.outputs);
      })
      .catch((e) => {
        if (mounted) setError(errorMessage(e));
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="portal-sources__connection-picker">
      <Select
        value={value || null}
        placeholder={t("portal.outputs.picker.placeholder")}
        options={(outputs ?? []).map((output) => ({
          value: output.id,
          label: output.name,
        }))}
        onChange={(selected) => onChange(selected ?? "")}
      />
      <Button variant="tertiary" size="sm" onClick={onCreateNew}>
        {t("portal.outputs.picker.createNew")}
      </Button>
      {error && <Banner tone="danger" description={error} />}
    </div>
  );
}
