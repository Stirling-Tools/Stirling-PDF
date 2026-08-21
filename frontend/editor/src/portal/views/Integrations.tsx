import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Banner,
  Button,
  column,
  DataTable,
  type DataTableColumn,
  type DataTableGroup,
  EmptyState,
} from "@app/ui";
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
import "@portal/theme/surface.css";
import "@portal/views/Integrations.css";

/**
 * The integrations catalogue: everything Stirling can talk to, in one place.
 *
 * Three bands, one grouped table. Connected first - stored connections grouped
 * by vendor (two S3 buckets is normal, not an error), every instance a row you
 * can edit or remove, with "add another" on the vendor's group header. Then
 * Available - the supported vendors, each saying what it works with (sources,
 * policies, pipelines). Coming-soon source connectors close the list so
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

/** One normalized row across the three bands, so a single grouped table renders
 *  connected instances, available vendors, and coming-soon vendors alike. */
type IntegrationRow = {
  key: string;
  brandId: string;
  title: string;
  subtitle: string;
  worksWith: WorksWith[];
} & (
  | { kind: "instance"; connection: IntegrationConfig; canManage: boolean }
  | { kind: "available"; typeId: string }
  | { kind: "soon" }
);

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
  const [modal, setModal] = useState<{
    open: boolean;
    editing: IntegrationConfig | null;
    fixedTypeId?: string;
  }>({ open: false, editing: null });
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
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

  const openCreate = useCallback((typeId: string) => {
    setModal({ open: true, editing: null, fixedTypeId: typeId });
  }, []);

  const openEdit = useCallback((connection: IntegrationConfig) => {
    setModal({ open: true, editing: connection });
  }, []);

  const remove = useCallback(
    async (connection: IntegrationConfig) => {
      if (busy) return;
      setBusy(true);
      setDeletingId(connection.id);
      setError(null);
      try {
        await deleteIntegration(connection.id);
        await refresh();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
        setDeletingId(null);
      }
    },
    [busy, refresh],
  );

  const isLoading = connections === null;

  const worksWithText = useCallback(
    (list: WorksWith[]) =>
      list.map((w) => t(`portal.integrations.worksWith.${w}`)).join(", "),
    [t],
  );

  const columns = useMemo<DataTableColumn<IntegrationRow>[]>(
    () => [
      column.entity({
        key: "integration",
        header: t("portal.integrations.table.integration"),
        icon: (r) => <BrandMark id={r.brandId} size={22} />,
        primary: (r) => r.title,
        note: (r) => r.subtitle || undefined,
      }),
      column.text({
        key: "worksWith",
        header: t("portal.integrations.table.worksWith"),
        get: (r) => worksWithText(r.worksWith),
      }),
      column.actions({
        key: "actions",
        get: (r) => {
          if (r.kind === "instance") {
            return r.canManage
              ? [
                  {
                    label: t("portal.connections.edit"),
                    disabled: busy,
                    onClick: () => openEdit(r.connection),
                  },
                  {
                    label: t("portal.connections.delete"),
                    tone: "danger",
                    loading: busy && deletingId === r.connection.id,
                    disabled: busy,
                    onClick: () => void remove(r.connection),
                  },
                ]
              : [];
          }
          if (r.kind === "available") {
            return [
              {
                label: t("portal.integrations.connect"),
                onClick: () => openCreate(r.typeId),
              },
            ];
          }
          return [];
        },
      }),
    ],
    [t, busy, deletingId, remove, openEdit, openCreate, worksWithText],
  );

  const tableGroups = useMemo<DataTableGroup<IntegrationRow>[]>(() => {
    const gs: DataTableGroup<IntegrationRow>[] = [];
    for (const { type, connections: list } of connectedGroups) {
      gs.push({
        key: `connected-${type.id}`,
        title: t(type.labelKey),
        meta:
          list.length > 1
            ? t("portal.integrations.connectionCount", { count: list.length })
            : t("portal.integrations.status.connected"),
        actions: [
          {
            label: t("portal.integrations.connect"),
            onClick: () => openCreate(type.id),
          },
        ],
        rows: list.map((c) => ({
          kind: "instance" as const,
          key: `i-${c.id}`,
          brandId: type.id,
          title: c.name,
          subtitle: connectionDetail(c),
          worksWith: worksWith(type),
          connection: c,
          canManage: !!c.canManage,
        })),
      });
    }
    if (availableTypes.length > 0) {
      gs.push({
        key: "available",
        title: t("portal.integrations.availableHeading"),
        rows: availableTypes.map((type) => ({
          kind: "available" as const,
          key: `a-${type.id}`,
          brandId: type.id,
          title: t(type.labelKey),
          subtitle: t(type.descriptionKey),
          worksWith: worksWith(type),
          typeId: type.id,
        })),
      });
    }
    if (comingSoon.length > 0) {
      gs.push({
        key: "soon",
        title: t("portal.integrations.comingSoonHeading"),
        muted: true,
        rows: comingSoon.map((entry) => ({
          kind: "soon" as const,
          key: `s-${entry.type}`,
          brandId: entry.type,
          title: t(entry.labelKey),
          subtitle: t(entry.descriptionKey),
          worksWith: ["sources"],
        })),
      });
    }
    return gs;
  }, [connectedGroups, availableTypes, comingSoon, t, openCreate]);

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
            fat
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

      {!isLoading && tableGroups.length === 0 ? (
        <EmptyState
          size="compact"
          title={t("portal.integrations.noResults.title", "No matches")}
          description={t(
            "portal.integrations.noResults.description",
            "No integrations match your filters. Try a different category or search.",
          )}
        />
      ) : (
        <DataTable<IntegrationRow>
          columns={columns}
          groups={tableGroups}
          rowKey={(r) => r.key}
          loading={isLoading}
          skeletonRows={5}
        />
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
