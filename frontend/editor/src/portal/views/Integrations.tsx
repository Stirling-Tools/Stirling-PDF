import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { Banner, Button, Skeleton } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  deleteIntegration,
  fetchIntegrationCapabilities,
  fetchIntegrations,
  type IntegrationCapabilities,
  type IntegrationConfig,
} from "@portal/api/integrations";
import { BrandMark } from "@portal/components/BrandMarks";
import { ConnectionModal } from "@portal/components/sources/ConnectionModal";
import {
  CONNECTION_CATEGORIES,
  CREATABLE_CONNECTION_TYPES,
  connectionTypeOf,
  presetConnectionTypes,
  type ConnectionCategory,
  type CreatableConnectionType,
} from "@portal/components/sources/connectionTypes";
import { STEP_OPERATIONS } from "@portal/components/policies/stepOperations";
import { COMING_SOON_SOURCE_TYPES } from "@portal/components/sources/sourceTypes";
import "@portal/views/Integrations.css";

/**
 * The integrations catalogue: everything Stirling can talk to, in one place.
 *
 * Three bands in one list. Connected first — stored connections grouped by
 * vendor, expandable when a vendor has several (two S3 buckets is normal, not
 * an error), each instance editable and one click from "add another". Then
 * Available — the supported vendors, each saying what it works with (sources,
 * policies, pipelines) so it's obvious whether a vendor feeds documents in or
 * receives them. Coming-soon source connectors close the list greyed out, so
 * "do you support X?" is answered honestly instead of hidden.
 *
 * Setup itself stays in the shared {@link ConnectionModal}; every entry point
 * here pins the vendor, so the modal opens straight on the right form.
 */

type Filter = "all" | "connected" | ConnectionCategory;
type WorksWith = "sources" | "policies" | "pipelines";

/** What a vendor plugs into, derived from the catalogues rather than declared. */
function worksWith(type: CreatableConnectionType): WorksWith[] {
  if (type.id === "s3") return ["sources", "pipelines"];
  if (type.kind === "custom") return ["policies", "pipelines"];
  const hasStep = STEP_OPERATIONS.some((op) => op.connectionTypeId === type.id);
  // Catalogue operations surface in both the policy step and pipeline pickers.
  return hasStep ? ["policies", "pipelines"] : ["policies"];
}

/** The one non-secret line that identifies a connection (bucket, tenant, URL). */
function connectionDetail(connection: IntegrationConfig): string {
  const config = connection.config ?? {};
  switch (connection.integrationType) {
    case "S3":
      return String(config.bucket ?? "");
    case "PURVIEW":
      return String(config.tenantId ?? "");
    default:
      return String(config.baseUrl ?? "");
  }
}

interface TypeGroup {
  type: CreatableConnectionType;
  connections: IntegrationConfig[];
}

export function Integrations() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<IntegrationConfig[] | null>(
    null,
  );
  const [capabilities, setCapabilities] = useState<
    IntegrationCapabilities | undefined
  >(undefined);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{
    open: boolean;
    editing: IntegrationConfig | null;
    fixedTypeId?: string;
  }>({ open: false, editing: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConnections(await fetchIntegrations());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    fetchIntegrationCapabilities().then(setCapabilities, () => undefined);
  }, []);

  // The supported vendors, plus the free-form Custom API entry when the server
  // allows this caller to author one (same gate as the header button).
  const catalogue = useMemo(() => {
    const presets = presetConnectionTypes();
    if (!capabilities?.customApi) return presets;
    const custom = CREATABLE_CONNECTION_TYPES.find((t) => t.kind === "custom");
    return custom ? [...presets, custom] : presets;
  }, [capabilities]);

  // Stored connections grouped under their vendor. Unknown types (an MCP row,
  // or a vendor this build no longer ships) group under the custom entry via
  // connectionTypeOf's fallback so nothing stored ever disappears from view.
  const groups = useMemo(() => {
    const byType = new Map<string, TypeGroup>();
    for (const connection of connections ?? []) {
      const type = connectionTypeOf(
        connection.integrationType,
        connection.config,
      );
      if (!type) continue;
      const group = byType.get(type.id) ?? { type, connections: [] };
      group.connections.push(connection);
      byType.set(type.id, group);
    }
    return byType;
  }, [connections]);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (label: string, extra: string[] = []) =>
      q === "" ||
      [label, ...extra].join(" ").toLowerCase().includes(q) ||
      q
        .split(/\s+/)
        .every((word) =>
          [label, ...extra].join(" ").toLowerCase().includes(word),
        ),
    [q],
  );

  const connectedGroups = useMemo(
    () =>
      [...groups.values()].filter(
        (group) =>
          (filter === "all" ||
            filter === "connected" ||
            group.type.category === filter) &&
          matches(t(group.type.labelKey), [
            group.type.id,
            ...group.connections.map((c) => c.name),
          ]),
      ),
    [groups, filter, matches, t],
  );

  const availableTypes = useMemo(
    () =>
      catalogue.filter(
        (type) =>
          !groups.has(type.id) &&
          filter !== "connected" &&
          (filter === "all" || type.category === filter) &&
          matches(t(type.labelKey), [type.id, ...(type.searchTerms ?? [])]),
      ),
    [catalogue, groups, filter, matches, t],
  );

  const comingSoon = useMemo(
    () =>
      (filter === "all" || filter === "storage"
        ? COMING_SOON_SOURCE_TYPES
        : []
      ).filter((entry) => matches(t(entry.labelKey), [entry.type])),
    [filter, matches, t],
  );

  // Filter chips: only categories that actually contain something.
  const categoryCounts = useMemo(() => {
    const counts = new Map<ConnectionCategory, number>();
    for (const type of catalogue) {
      counts.set(type.category, (counts.get(type.category) ?? 0) + 1);
    }
    return counts;
  }, [catalogue]);

  function toggleExpand(typeId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }

  function openCreate(typeId: string) {
    setModal({ open: true, editing: null, fixedTypeId: typeId });
  }

  function openEdit(connection: IntegrationConfig) {
    setModal({ open: true, editing: connection });
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

  const isLoading = connections === null;

  const chip = (kind: WorksWith) => (
    <span key={kind} className="portal-integrations__chip">
      {t(`portal.integrations.worksWith.${kind}`)}
    </span>
  );

  return (
    <div className="portal-integrations">
      <header className="portal-integrations__head">
        <div>
          <h1 className="portal-integrations__title">
            {t("portal.integrations.title")}
          </h1>
          <p className="portal-integrations__sub">
            {t("portal.integrations.subtitle")}
          </p>
        </div>
        {capabilities?.customApi && (
          <Button
            onClick={() => openCreate("api")}
            leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
          >
            {t("portal.integrations.customApi")}
          </Button>
        )}
      </header>

      <div className="portal-integrations__toolbar">
        <div
          className="portal-integrations__filters"
          role="tablist"
          aria-label={t("portal.integrations.title")}
        >
          <FilterChip
            active={filter === "all"}
            label={t("portal.integrations.filters.all")}
            count={catalogue.length}
            onClick={() => setFilter("all")}
          />
          <FilterChip
            active={filter === "connected"}
            label={t("portal.integrations.filters.connected")}
            count={groups.size}
            onClick={() => setFilter("connected")}
          />
          {CONNECTION_CATEGORIES.filter(
            (category) =>
              category !== "advanced" &&
              (categoryCounts.get(category) ?? 0) > 0,
          ).map((category) => (
            <FilterChip
              key={category}
              active={filter === category}
              label={t(`portal.integrations.filters.${category}`)}
              count={categoryCounts.get(category) ?? 0}
              onClick={() => setFilter(category)}
            />
          ))}
        </div>
        <div className="portal-integrations__toolbar-side">
          <label className="portal-integrations__search">
            <SearchRoundedIcon fontSize="inherit" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("portal.integrations.searchPlaceholder")}
              aria-label={t("portal.integrations.searchPlaceholder")}
            />
          </label>
        </div>
      </div>

      {error && <Banner tone="danger" description={error} />}

      {isLoading ? (
        <div className="portal-integrations__skeleton" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height="3.25rem" />
          ))}
        </div>
      ) : (
        <div className="portal-integrations__table">
          <div className="portal-integrations__cols" aria-hidden>
            <span>{t("portal.integrations.table.integration")}</span>
            <span>{t("portal.integrations.table.worksWith")}</span>
            <span />
          </div>

          {connectedGroups.length > 0 && (
            <div className="portal-integrations__section">
              {t("portal.integrations.connectedHeading")} ·{" "}
              {connectedGroups.length}
            </div>
          )}
          {connectedGroups.map(({ type, connections: list }) => {
            const open = expanded.has(type.id);
            return (
              <div key={type.id} className="portal-integrations__group">
                <button
                  type="button"
                  className="portal-integrations__row portal-integrations__row--connected"
                  aria-expanded={open}
                  onClick={() => toggleExpand(type.id)}
                >
                  <span className="portal-integrations__name">
                    <BrandMark id={type.id} size={22} />
                    <span className="portal-integrations__name-text">
                      <span className="portal-integrations__label">
                        {t(type.labelKey)}
                      </span>
                      <span className="portal-integrations__detail">
                        {list.length === 1
                          ? list[0].name
                          : t("portal.integrations.connectionCount", {
                              count: list.length,
                            })}
                      </span>
                    </span>
                  </span>
                  <span className="portal-integrations__chips">
                    {worksWith(type).map(chip)}
                  </span>
                  <span className="portal-integrations__status">
                    <span className="portal-integrations__status-dot" />
                    {t("portal.integrations.status.connected")}
                    <ExpandMoreRoundedIcon
                      fontSize="inherit"
                      className={
                        "portal-integrations__chevron" +
                        (open ? " is-open" : "")
                      }
                    />
                  </span>
                </button>
                {open && (
                  <div className="portal-integrations__instances">
                    {list.map((connection) => (
                      <div
                        key={connection.id}
                        className="portal-integrations__instance"
                      >
                        <span className="portal-integrations__instance-name">
                          {connection.name}
                        </span>
                        <span className="portal-integrations__instance-detail">
                          {connectionDetail(connection)}
                        </span>
                        {connection.canManage && (
                          <span className="portal-integrations__instance-actions">
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
                      </div>
                    ))}
                    <div className="portal-integrations__instance portal-integrations__instance--add">
                      <Button
                        variant="tertiary"
                        size="sm"
                        onClick={() => openCreate(type.id)}
                        leftSection={
                          <AddRoundedIcon style={{ fontSize: "1rem" }} />
                        }
                      >
                        {t("portal.integrations.addAnother")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {availableTypes.length > 0 && (
            <div className="portal-integrations__section">
              {t("portal.integrations.availableHeading")} ·{" "}
              {availableTypes.length}
            </div>
          )}
          {availableTypes.map((type) => (
            <div key={type.id} className="portal-integrations__row">
              <span className="portal-integrations__name">
                <BrandMark id={type.id} size={22} />
                <span className="portal-integrations__name-text">
                  <span className="portal-integrations__label">
                    {t(type.labelKey)}
                  </span>
                  <span className="portal-integrations__detail">
                    {t(type.descriptionKey)}
                  </span>
                </span>
              </span>
              <span className="portal-integrations__chips">
                {worksWith(type).map(chip)}
              </span>
              <span className="portal-integrations__status">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openCreate(type.id)}
                >
                  {t("portal.integrations.connect")}
                </Button>
              </span>
            </div>
          ))}

          {comingSoon.length > 0 && (
            <div className="portal-integrations__section">
              {t("portal.integrations.comingSoonHeading")} · {comingSoon.length}
            </div>
          )}
          {comingSoon.map((entry) => (
            <div
              key={entry.type}
              className="portal-integrations__row portal-integrations__row--soon"
              aria-disabled
            >
              <span className="portal-integrations__name">
                <BrandMark id={entry.type} size={22} />
                <span className="portal-integrations__name-text">
                  <span className="portal-integrations__label">
                    {t(entry.labelKey)}
                  </span>
                  <span className="portal-integrations__detail">
                    {t(entry.descriptionKey)}
                  </span>
                </span>
              </span>
              <span className="portal-integrations__chips">
                {chip("sources")}
              </span>
              <span className="portal-integrations__status">
                <span className="portal-integrations__soon-badge">
                  {t("portal.sources.builder.comingSoon")}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <ConnectionModal
        open={modal.open}
        connection={modal.editing}
        fixedTypeId={modal.fixedTypeId}
        capabilities={capabilities}
        onClose={() => setModal({ open: false, editing: null })}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={"portal-integrations__filter" + (active ? " is-active" : "")}
      onClick={onClick}
    >
      {label}
      <span className="portal-integrations__filter-count">{count}</span>
    </button>
  );
}
