import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Select } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  createIntegration,
  fetchS3Connections,
  type IntegrationConfig,
} from "@portal/api/integrations";
import {
  EMPTY_S3_CONNECTION,
  S3ConnectionForm,
  s3ConnectionFormValid,
  s3ConnectionRequestConfig,
  type S3ConnectionFormValues,
} from "@portal/components/sources/S3ConnectionForm";

/**
 * Selects a stored S3 connection by id, with an inline "create new" path that
 * saves the connection immediately (so validation - schema, SSRF, credentials -
 * fails here in the form, and the parent only ever sees a real connection id).
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
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<S3ConnectionFormValues>(EMPTY_S3_CONNECTION);
  const [saving, setSaving] = useState(false);
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

  async function saveNewConnection() {
    if (saving || !s3ConnectionFormValid(form)) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createIntegration({
        integrationType: "S3",
        name: form.name.trim(),
        scope: "TEAM",
        config: s3ConnectionRequestConfig(form),
      });
      setConnections((list) => [...(list ?? []), created]);
      onChange(String(created.id));
      setCreating(false);
      setForm(EMPTY_S3_CONNECTION);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

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
      {!creating && (
        <Button variant="tertiary" size="sm" onClick={() => setCreating(true)}>
          {t("portal.connections.picker.createNew")}
        </Button>
      )}
      {creating && (
        <div className="portal-sources__connection-create">
          <S3ConnectionForm values={form} onChange={setForm} />
          {error && <Banner tone="danger" description={error} />}
          <div className="portal-sources__connection-create-actions">
            <Button
              variant="tertiary"
              size="sm"
              disabled={saving}
              onClick={() => setCreating(false)}
            >
              {t("portal.connections.picker.cancel")}
            </Button>
            <Button
              size="sm"
              loading={saving}
              disabled={!s3ConnectionFormValid(form)}
              onClick={() => void saveNewConnection()}
            >
              {t("portal.connections.picker.save")}
            </Button>
          </div>
        </div>
      )}
      {!creating && error && <Banner tone="danger" description={error} />}
    </div>
  );
}
