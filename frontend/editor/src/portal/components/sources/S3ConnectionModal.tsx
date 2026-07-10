import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  createIntegration,
  updateIntegration,
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
 * The one place S3 connections are created and edited. Launched from the
 * Connections tab, the source builder's connection picker, and the pipeline
 * builder output - so connection setup is always a modal, never inline splat.
 * Saving validates backend-side (schema, SSRF, credentials); on edit the secret
 * arrives masked and round-trips unchanged to keep the stored value.
 */
interface S3ConnectionModalProps {
  open: boolean;
  /** When set, edit this connection; otherwise create a new one. */
  connection?: IntegrationConfig | null;
  onClose: () => void;
  /** The saved connection, so callers can select or refresh it. */
  onSaved: (connection: IntegrationConfig) => void;
}

export function S3ConnectionModal({
  open,
  connection,
  onClose,
  onSaved,
}: S3ConnectionModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<S3ConnectionFormValues>(EMPTY_S3_CONNECTION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(connection);

  // Seed the form each time the modal opens (or its target changes).
  useEffect(() => {
    if (!open) return;
    if (connection) {
      const config = connection.config ?? {};
      setForm({
        name: connection.name,
        bucket: String(config.bucket ?? ""),
        region: String(config.region ?? "us-east-1"),
        endpoint: String(config.endpoint ?? ""),
        accessKeyId: String(config.accessKeyId ?? ""),
        secretAccessKey: String(config.secretAccessKey ?? ""),
      });
    } else {
      setForm(EMPTY_S3_CONNECTION);
    }
    setError(null);
  }, [open, connection]);

  async function save() {
    if (saving || !s3ConnectionFormValid(form)) return;
    setSaving(true);
    setError(null);
    try {
      const saved = connection
        ? await updateIntegration(connection.id, {
            name: form.name.trim(),
            config: s3ConnectionRequestConfig(form),
          })
        : await createIntegration({
            integrationType: "S3",
            name: form.name.trim(),
            scope: "TEAM",
            config: s3ConnectionRequestConfig(form),
          });
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(
        isEdit
          ? "portal.connections.editTitle"
          : "portal.connections.createTitle",
      )}
      footer={
        <div className="portal-sources__connection-create-actions">
          <Button
            variant="tertiary"
            size="sm"
            disabled={saving}
            onClick={onClose}
          >
            {t("portal.connections.picker.cancel")}
          </Button>
          <Button
            size="sm"
            loading={saving}
            disabled={!s3ConnectionFormValid(form)}
            onClick={() => void save()}
          >
            {t("portal.connections.picker.save")}
          </Button>
        </div>
      }
    >
      <S3ConnectionForm values={form} onChange={setForm} />
      {error && <Banner tone="danger" description={error} />}
    </Modal>
  );
}
