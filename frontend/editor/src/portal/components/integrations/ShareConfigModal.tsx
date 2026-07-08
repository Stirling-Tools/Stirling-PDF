import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Chip, EmptyState, FormField, Modal, Select } from "@app/ui";
import {
  createGrant,
  fetchGrants,
  revokeGrant,
  type AccessPermission,
  type ResourceGrant,
} from "@portal/api/access";
import { errorMessage } from "@portal/api/http";
import type { Member } from "@portal/api/users";
import type { IntegrationConfig } from "@portal/api/integrations";
import "@portal/views/Integrations.css";

interface ShareConfigModalProps {
  open: boolean;
  config: IntegrationConfig | null;
  /** People who can be granted access (the org roster). */
  members: Member[];
  onClose: () => void;
}

/** Share one API/MCP config with specific users at USE or MANAGE. */
export function ShareConfigModal({
  open,
  config,
  members,
  onClose,
}: ShareConfigModalProps) {
  const { t } = useTranslation();
  const [grants, setGrants] = useState<ResourceGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickUser, setPickUser] = useState("");
  const [permission, setPermission] = useState<AccessPermission>("USE");

  const resourceId = config ? String(config.id) : "";

  useEffect(() => {
    if (!open || !config) return;
    setError(null);
    setPickUser("");
    setPermission("USE");
    setLoading(true);
    fetchGrants("INTEGRATION_CONFIG", String(config.id))
      .then(setGrants)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [open, config]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const member of members) m.set(member.id, member.name);
    return m;
  }, [members]);

  // Only USER grants are managed here; a user already granted drops out of the picker.
  const userGrants = grants.filter((g) => g.principalType === "USER");
  const grantedIds = new Set(userGrants.map((g) => String(g.principalId)));
  const options = members
    .filter((m) => !m.isSelf && !grantedIds.has(m.id))
    .map((m) => ({ value: m.id, label: m.name }));

  async function refresh() {
    if (!config) return;
    setGrants(await fetchGrants("INTEGRATION_CONFIG", String(config.id)));
  }

  async function share() {
    if (!config || !pickUser) return;
    setProcessing(true);
    setError(null);
    try {
      await createGrant({
        resourceType: "INTEGRATION_CONFIG",
        resourceId,
        principalType: "USER",
        principalId: Number(pickUser),
        permission,
      });
      setPickUser("");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProcessing(false);
    }
  }

  async function unshare(grant: ResourceGrant) {
    setProcessing(true);
    setError(null);
    try {
      await revokeGrant(grant.id);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="sm"
      title={t("integrations.share.title", "Share access")}
      subtitle={config?.name}
      footer={
        <div className="portal-integrations__modal-footer">
          <Button variant="tertiary" size="sm" onClick={onClose}>
            {t("common.done", "Done")}
          </Button>
        </div>
      }
    >
      <div className="portal-integrations__share">
        <div className="portal-integrations__share-add">
          <FormField label={t("integrations.share.person", "Person")}>
            <Select
              options={[
                {
                  value: "",
                  label: t("integrations.share.pickPerson", "Select a person…"),
                },
                ...options,
              ]}
              value={pickUser}
              onChange={(value) => setPickUser(value ?? "")}
            />
          </FormField>
          <FormField label={t("integrations.share.permission", "Permission")}>
            <Select
              options={[
                { value: "USE", label: t("integrations.share.use", "Use") },
                {
                  value: "MANAGE",
                  label: t("integrations.share.manage", "Manage"),
                },
              ]}
              value={permission}
              onChange={(value) =>
                setPermission((value ?? "USE") as AccessPermission)
              }
            />
          </FormField>
          <Button
            size="sm"
            onClick={() => void share()}
            disabled={!pickUser || processing}
          >
            {t("integrations.share.add", "Share")}
          </Button>
        </div>

        {error && (
          <p className="portal-integrations__form-error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p className="portal-integrations__muted">
            {t("common.loading", "Loading…")}
          </p>
        ) : userGrants.length === 0 ? (
          <EmptyState
            title={t("integrations.share.emptyTitle", "Not shared yet")}
            description={t(
              "integrations.share.emptyDescription",
              "Share this config with people to let them use it.",
            )}
          />
        ) : (
          <ul className="portal-integrations__share-list">
            {userGrants.map((g) => (
              <li key={g.id} className="portal-integrations__share-row">
                <span className="portal-integrations__share-name">
                  {nameById.get(String(g.principalId)) ?? `#${g.principalId}`}
                </span>
                <Chip
                  accent={g.permission === "MANAGE" ? "warning" : "success"}
                  size="sm"
                >
                  {g.permission === "MANAGE"
                    ? t("integrations.share.manage", "Manage")
                    : t("integrations.share.use", "Use")}
                </Chip>
                <button
                  type="button"
                  className="portal-integrations__share-remove"
                  onClick={() => void unshare(g)}
                  disabled={processing}
                  aria-label={t("integrations.share.remove", "Remove")}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
