import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Select } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  fetchS3Connections,
  type IntegrationConfig,
} from "@portal/api/integrations";
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
  const [connections, setConnections] = useState<IntegrationConfig[] | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchS3Connections()
      .then((list) => {
        if (mounted) setConnections(list);
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
          setConnections((list) => [...(list ?? []), created]);
          onChange(String(created.id));
        }}
      />
    </div>
  );
}
