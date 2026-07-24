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
import { connectionTypeOf } from "@portal/components/sources/connectionTypes";

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
  /**
   * The specific vendor this slot wants (e.g. "jira"). Seventeen presets share the "API" backend
   * type, so filtering on `integrationType` alone offers a Jira step your Slack webhook. When set,
   * only connections that resolve to this preset are shown - plus any free-form custom API
   * connection, which can point anywhere and so fits any API operation.
   */
  presetId?: string;
  /**
   * When the picker already sits inside a modal, stacking the shared connection
   * modal on top reads badly. A host that can offer its own create surface (the
   * source modal swaps to a connection stage) passes this; "New connection..."
   * then delegates instead of opening the nested modal.
   */
  onCreateNew?: () => void;
}

export function ConnectionPicker({
  value,
  onChange,
  integrationType,
  createTypeId,
  presetId,
  onCreateNew,
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
        if (!mounted) return;
        // A connection fits this slot when the backend type matches and, if a vendor is named,
        // when it is that vendor - or a free-form custom API connection, which points wherever
        // its base URL says and so serves any API operation.
        setConnections(
          list.filter((c) => {
            if (c.integrationType !== integrationType) return false;
            if (!presetId) return true;
            const resolved = connectionTypeOf(c.integrationType, c.config);
            return resolved?.id === presetId || resolved?.kind === "custom";
          }),
        );
      })
      .catch((e) => {
        if (mounted) setError(errorMessage(e));
      });
    return () => {
      mounted = false;
    };
  }, [integrationType, presetId]);

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
      <Button
        variant="tertiary"
        size="sm"
        onClick={() => (onCreateNew ? onCreateNew() : setModalOpen(true))}
      >
        {t("portal.connections.picker.createNew")}
      </Button>
      {error && <Banner tone="danger" description={error} />}
      {!onCreateNew && (
        <ConnectionModal
          open={modalOpen}
          fixedTypeId={createTypeId}
          onClose={() => setModalOpen(false)}
          onSaved={(created) => {
            setConnections((list) => [...(list ?? []), created]);
            onChange(String(created.id));
          }}
        />
      )}
    </div>
  );
}
