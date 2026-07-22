import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Banner, Button, Select } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { useS3Connections } from "@portal/queries/sources";
import { qk } from "@portal/queries/keys";
import { S3ConnectionModal } from "@portal/components/sources/S3ConnectionModal";

/**
 * Selects a stored S3 connection by id. Creating a new one opens the shared
 * connection modal (saved immediately and validated backend-side), so the
 * parent only ever sees a real connection id.
 */
interface S3ConnectionPickerProps {
  value: string;
  onChange: (connectionId: string) => void;
}

export function S3ConnectionPicker({
  value,
  onChange,
}: S3ConnectionPickerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: connections, error: fetchError } = useS3Connections();
  const [modalOpen, setModalOpen] = useState(false);
  const error = fetchError ? errorMessage(fetchError) : null;

  return (
    <div className="portal-sources__connection-picker">
      <Select
        value={value || null}
        placeholder={t("portal.connections.picker.placeholder")}
        options={(connections ?? []).map((connection) => ({
          value: String(connection.id),
          label: connection.name,
        }))}
        onChange={(selected) => onChange(selected ?? "")}
      />
      <Button variant="tertiary" size="sm" onClick={() => setModalOpen(true)}>
        {t("portal.connections.picker.createNew")}
      </Button>
      {error && <Banner tone="danger" description={error} />}
      <S3ConnectionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(created) => {
          // Refetch the shared connections cache (also refreshes the
          // Connections tab), then select the newly created one.
          queryClient.invalidateQueries({ queryKey: qk.s3Connections() });
          onChange(String(created.id));
        }}
      />
    </div>
  );
}
