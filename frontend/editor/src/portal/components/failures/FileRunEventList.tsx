import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  column,
  DataTable,
  type DataTableColumn,
  DataTableFilterBar,
  EmptyState,
  Modal,
  SegmentedControl,
  type SegmentedOption,
  useDataTableFilters,
} from "@app/ui";
import { formatRelativeTime } from "@app/utils/timeUtils";
import type {
  FileRunEvent,
  FailureSeverity,
  FileRunEventScope,
} from "@portal/api/fileRunEvents";
import {
  useFileRunEvents,
  useFileRunEventActions,
} from "@portal/queries/fileRunEvents";
import { useSources } from "@portal/queries/sources";
import { buildFailureActionCells } from "@portal/components/failures/failureActionCells";
import { causeOf } from "@portal/components/failures/failureCauses";
import { outcomeOf } from "@portal/components/failures/failureOutcomes";

/** Recorded policy-run and editor-tool failures, sharing the notification bell's copy. */

const SEVERITY_TONE: Record<FailureSeverity, "danger" | "warning" | "info"> = {
  ERROR: "danger",
  WARNING: "warning",
  INFO: "info",
};

export function FileRunEventList() {
  const { t } = useTranslation();
  const [scope, setScope] = useState<FileRunEventScope>("open");
  const { data: events, error } = useFileRunEvents(scope);
  const { apply } = useFileRunEventActions();
  const [busy, setBusy] = useState<{ id: string; action: string } | null>(null);
  /** The row whose raw log is open in the modal. */
  const [logOf, setLogOf] = useState<FileRunEvent | null>(null);

  // Server keys, with the English fallbacks that carry a kind this build has no copy for.
  const titleFor = (event: FileRunEvent) =>
    t(event.titleKey, { defaultValue: event.defaultTitle });
  const descriptionFor = (event: FileRunEvent) =>
    t(event.descriptionKey, { defaultValue: "" }) || null;
  // From the directory, never the server's stage: "INTERNAL" reads as a verdict on fault.
  const causeFor = (event: FileRunEvent) => {
    const cause = causeOf(event.kindId);
    return t(cause.labelKey, cause.defaultLabel);
  };
  const originFor = (event: FileRunEvent) =>
    t(`portal.failures.origin.${event.origin.toLowerCase()}`, event.origin);
  // The record stores an id; falls back to it while the list loads, or for a deleted source.
  const sources = useSources();
  const sourceNames = useMemo(
    () =>
      new Map(
        (sources.data?.sources ?? []).map((source) => [source.id, source.name]),
      ),
    [sources.data],
  );
  // A null sourceId means a person fed the file in, so the editor is the source.
  const sourceFor = (event: FileRunEvent) =>
    event.sourceId
      ? (sourceNames.get(event.sourceId) ?? event.sourceId)
      : t("portal.failures.source.editor", "Editor");

  // A build without the proprietary module has no such route, and a caller who is
  // not a team leader gets a 403. Both mean there is nothing to show.
  const unavailable = error !== null;

  const filters = useDataTableFilters<FileRunEvent>({
    rows: events ?? [],
    facets: [
      {
        key: "type",
        label: t("portal.failures.filters.type", "Type"),
        getValue: titleFor,
      },
      {
        key: "user",
        label: t("portal.failures.filters.user", "User"),
        getValue: (event) => event.actor,
      },
      {
        key: "source",
        label: t("portal.failures.filters.source", "Source"),
        getValue: sourceFor,
      },
      {
        key: "cause",
        label: t("portal.failures.filters.cause", "Cause"),
        getValue: causeFor,
      },
      {
        key: "origin",
        label: t("portal.failures.filters.origin", "Failed in"),
        getValue: originFor,
      },
    ],
    searchText: (event) =>
      [
        titleFor(event),
        descriptionFor(event) ?? "",
        event.detail ?? "",
        event.runId ?? "",
        event.actor ?? "",
        // Both forms: the name a reviewer types, the id a log shows.
        event.sourceId ?? "",
        sourceFor(event),
      ].join(" "),
    searchPlaceholder: t(
      "portal.failures.searchPlaceholder",
      "Search failures, users and logs",
    ),
  });

  const runAction = async (event: FileRunEvent, actionId: string) => {
    setBusy({ id: event.id, action: actionId });
    try {
      await apply(event.id, actionId);
    } finally {
      setBusy(null);
    }
  };

  const copyLog = (event: FileRunEvent) => {
    if (!event.detail) return;
    void navigator.clipboard.writeText(event.detail).catch(() => {
      // No clipboard permission. Nothing worth an error of its own.
    });
  };

  const columns: DataTableColumn<FileRunEvent>[] = [
    column.entity({
      key: "failure",
      header: t("portal.failures.columns.failure", "Failure"),
      sortable: true,
      primary: titleFor,
      // A folded repeat is one row; the count rides the title.
      suffix: (event) =>
        event.occurrences > 1
          ? t("portal.failures.occurrences", "{{count}} occurrences", {
              count: event.occurrences,
            })
          : null,
      // The kind's own sentence, not the raw log: that stays behind the eye.
      note: descriptionFor,
      peek: (event) =>
        event.detail
          ? {
              label: t("portal.failures.log.view", "View log"),
              onClick: () => setLogOf(event),
            }
          : null,
    }),
    column.badge({
      key: "cause",
      header: t("portal.failures.columns.cause", "Cause"),
      sortable: true,
      get: (event) => ({
        tone: SEVERITY_TONE[event.severity],
        label: causeFor(event),
      }),
    }),
    // What kind of work failed: a policy run, a pipeline, or someone's editor tool.
    column.text({
      key: "origin",
      header: t("portal.failures.columns.origin", "Failed in"),
      sortable: true,
      get: originFor,
    }),
    // An unattended file has no user, so its source is the only attribution.
    column.muted({
      key: "user",
      header: t("portal.failures.columns.user", "User"),
      sortable: true,
      get: (event) => event.actor,
      placeholder: "-",
    }),
    column.muted({
      key: "source",
      header: t("portal.failures.columns.source", "Source"),
      sortable: true,
      get: sourceFor,
    }),
    // Relative in the row; the log modal carries the full timestamp.
    column.muted({
      key: "date",
      header: t("portal.failures.columns.date", "Date"),
      sortable: true,
      get: (event) => formatRelativeTime(event.lastSeenAt, t),
      sortBy: (event) => event.lastSeenAt,
    }),
    // How it was settled, and by whom. Only closed rows have an answer.
    ...(scope === "closed"
      ? [
          column.badge<FileRunEvent>({
            key: "outcome",
            header: t("portal.failures.columns.outcome", "Outcome"),
            sortable: true,
            get: (event) => {
              const outcome = outcomeOf(event.status);
              return {
                tone: outcome.tone,
                label: t(outcome.labelKey, outcome.defaultLabel),
              };
            },
          }),
          column.muted<FileRunEvent>({
            key: "closedBy",
            header: t("portal.failures.columns.closedBy", "Closed by"),
            sortable: true,
            get: (event) => event.statusActor,
            placeholder: t("portal.failures.closedBySystem", "Stirling"),
          }),
        ]
      : []),
    column.actions({
      key: "actions",
      get: (event) =>
        buildFailureActionCells({
          event,
          t,
          busyActionId: busy?.id === event.id ? busy.action : null,
          onAction: (actionId) => runAction(event, actionId),
          onCopyLog: () => copyLog(event),
        }),
    }),
  ];

  const scopeOptions: SegmentedOption<FileRunEventScope>[] = [
    { value: "open", label: t("portal.failures.scope.open", "Open") },
    { value: "closed", label: t("portal.failures.scope.closed", "Closed") },
  ];

  return (
    <div className="portal-failures">
      {unavailable ? (
        <EmptyState
          title={t("portal.failures.unavailable.title", "Nothing to review")}
          description={t(
            "portal.failures.unavailable.description",
            "Recorded failures are visible to team leaders on workspaces that run policies.",
          )}
        />
      ) : (
        <DataTable<FileRunEvent>
          columns={columns}
          rows={filters.rows}
          rowKey={(event) => event.id}
          defaultSort={{ key: "date", direction: "desc" }}
          loading={events === null}
          empty={
            (events?.length ?? 0) === 0 ? (
              <EmptyState
                title={
                  scope === "closed"
                    ? t(
                        "portal.failures.emptyClosed.title",
                        "Nothing closed yet",
                      )
                    : t("portal.failures.empty.title", "No failures recorded")
                }
                description={
                  scope === "closed"
                    ? t(
                        "portal.failures.emptyClosed.description",
                        "Failures you dismiss or resolve are kept here with their outcome.",
                      )
                    : t(
                        "portal.failures.empty.description",
                        "Policy runs that fail will appear here with the actions you can take.",
                      )
                }
              />
            ) : (
              t(
                "portal.failures.noMatches",
                "No failures match the current filters",
              )
            )
          }
          toolbar={
            <DataTableFilterBar
              {...filters.filterBar}
              trailing={
                <SegmentedControl<FileRunEventScope>
                  options={scopeOptions}
                  value={scope}
                  onChange={setScope}
                  ariaLabel={t(
                    "portal.failures.scope.ariaLabel",
                    "Failure state",
                  )}
                />
              }
            />
          }
        />
      )}

      <Modal
        open={logOf !== null}
        onClose={() => setLogOf(null)}
        width="lg"
        title={logOf ? titleFor(logOf) : undefined}
        // The row shows a relative time, so the full moment lives here.
        subtitle={
          logOf ? new Date(logOf.lastSeenAt).toLocaleString() : undefined
        }
        footer={
          <Button variant="secondary" onClick={() => logOf && copyLog(logOf)}>
            {t("portal.failures.log.copy", "Copy log")}
          </Button>
        }
      >
        <pre className="portal-failures__log">{logOf?.detail}</pre>
      </Modal>
    </div>
  );
}
