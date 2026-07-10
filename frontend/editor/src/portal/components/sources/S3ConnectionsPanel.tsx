import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  deleteIntegration,
  fetchS3Connections,
  updateIntegration,
  type IntegrationConfig,
} from "@portal/api/integrations";
import {
  EMPTY_S3_CONNECTION,
  S3ConnectionForm,
  s3ConnectionRequestConfig,
  type S3ConnectionFormValues,
} from "@portal/components/sources/S3ConnectionForm";

/**
 * Compact management surface for stored S3 connections: rename, rotate
 * credentials (secrets round-trip masked; leaving the mask untouched keeps the
 * stored value), and delete - which the backend refuses with the referencing
 * sources/pipelines while the connection is in use.
 */
export function S3ConnectionsPanel() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<IntegrationConfig[]>([]);
  const [editing, setEditing] = useState<IntegrationConfig | null>(null);
  const [form, setForm] = useState<S3ConnectionFormValues>(EMPTY_S3_CONNECTION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setConnections(await fetchS3Connections());
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function openEdit(connection: IntegrationConfig) {
    const config = connection.config ?? {};
    setForm({
      name: connection.name,
      bucket: String(config.bucket ?? ""),
      region: String(config.region ?? ""),
      endpoint: String(config.endpoint ?? ""),
      accessKeyId: String(config.accessKeyId ?? ""),
      secretAccessKey: String(config.secretAccessKey ?? ""),
    });
    setError(null);
    setEditing(connection);
  }

  async function saveEdit() {
    if (!editing || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateIntegration(editing.id, {
        name: form.name.trim(),
        config: s3ConnectionRequestConfig(form),
      });
      setEditing(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(connection: IntegrationConfig) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteIntegration(connection.id);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (connections.length === 0 && !error) {
    return null;
  }

  return (
    <section className="portal-sources__connections">
      <h3 className="portal-sources__connections-title">
        {t("portal.connections.title")}
      </h3>
      {error && !editing && <Banner tone="danger" description={error} />}
      <ul className="portal-sources__connections-list">
        {connections.map((connection) => (
          <li key={connection.id} className="portal-sources__connections-row">
            <span className="portal-sources__connections-name">
              {connection.name}
            </span>
            <span className="portal-sources__connections-bucket">
              {String(connection.config?.bucket ?? "")}
            </span>
            {connection.canManage && (
              <span className="portal-sources__connections-actions">
                <Button
                  variant="tertiary"
                  size="sm"
                  disabled={busy}
                  onClick={() => openEdit(connection)}
                >
                  {t("portal.connections.edit")}
                </Button>
                <Button
                  variant="tertiary"
                  size="sm"
                  accent="danger"
                  disabled={busy}
                  onClick={() => void remove(connection)}
                >
                  {t("portal.connections.delete")}
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t("portal.connections.editTitle")}
        footer={
          <div className="portal-pipelines__composer-footer">
            <Button
              variant="tertiary"
              size="sm"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              {t("portal.connections.picker.cancel")}
            </Button>
            <Button size="sm" loading={busy} onClick={() => void saveEdit()}>
              {t("portal.connections.picker.save")}
            </Button>
          </div>
        }
      >
        <S3ConnectionForm values={form} onChange={setForm} />
        {error && editing && <Banner tone="danger" description={error} />}
      </Modal>
    </section>
  );
}
