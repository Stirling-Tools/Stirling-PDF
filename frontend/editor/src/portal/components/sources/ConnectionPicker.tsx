import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Select } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  fetchIntegrations,
  type IntegrationConfig,
  type IntegrationType,
} from "@portal/api/integrations";
import { ConnectionModal } from "@portal/components/sources/ConnectionModal";

/**
 * Selects a stored connection of one type by id — an S3 bucket for a source, a Purview tenant for a
 * labelling step. Creating a new one opens the shared modal (saved immediately and validated
 * backend-side), so the parent only ever sees a real connection id.
 *
 * The type is fixed by the slot rather than chosen here: a field that wants a Purview tenant is not
 * satisfied by an S3 bucket, so offering the choice would only invite an error the backend then has
 * to reject.
 */
interface ConnectionPickerProps {
  value: string;
  onChange: (connectionId: string) => void;
  /** The backend type this slot accepts. */
  integrationType: IntegrationType;
  /** The catalogue entry used when creating inline; defaults to the type's own. */
  createTypeId: string;
}

export function ConnectionPicker({
  value,
  onChange,
  integrationType,
  createTypeId,
}: ConnectionPickerProps) {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<IntegrationConfig[] | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchIntegrations()
      .then((list) => {
        if (mounted) {
          setConnections(
            list.filter((c) => c.integrationType === integrationType),
          );
        }
      })
      .catch((e) => {
        if (mounted) setError(errorMessage(e));
      });
    return () => {
      mounted = false;
    };
  }, [integrationType]);

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
      <ConnectionModal
        open={modalOpen}
        fixedTypeId={createTypeId}
        onClose={() => setModalOpen(false)}
        onSaved={(created) => {
          setConnections((list) => [...(list ?? []), created]);
          onChange(String(created.id));
        }}
      />
    </div>
  );
}
