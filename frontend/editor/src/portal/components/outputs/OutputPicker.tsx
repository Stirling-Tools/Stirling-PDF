import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Select } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { fetchOutputs, type OutputView } from "@portal/api/outputs";
import { OutputModal } from "@portal/components/outputs/OutputModal";

/**
 * Selects a saved output destination by id for a pipeline. Creating a new one
 * opens the shared {@link OutputModal} (saved immediately and validated
 * backend-side), so the parent only ever sees a real output id - mirroring the
 * S3 connection picker.
 */
interface OutputPickerProps {
  value: string;
  onChange: (outputId: string) => void;
}

export function OutputPicker({ value, onChange }: OutputPickerProps) {
  const { t } = useTranslation();
  const [outputs, setOutputs] = useState<OutputView[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
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
      <Button variant="tertiary" size="sm" onClick={() => setModalOpen(true)}>
        {t("portal.outputs.picker.createNew")}
      </Button>
      {error && <Banner tone="danger" description={error} />}
      <OutputModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(created) => {
          // The picker lists overview rows; refetch so the new one appears with
          // its reference count, and select it immediately.
          if (created.id) onChange(created.id);
          void fetchOutputs()
            .then((response) => setOutputs(response.outputs))
            .catch(() => {});
        }}
      />
    </div>
  );
}
