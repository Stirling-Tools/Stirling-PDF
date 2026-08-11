import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Skeleton, StatusBadge } from "@app/ui";
import type {
  FileRunEvent,
  FailureSeverity,
} from "@processor/api/fileRunEvents";
import {
  useFileRunEvents,
  useFileRunEventActions,
} from "@processor/queries/fileRunEvents";
import { FailureActionButtons } from "@processor/components/failures/FailureActionButtons";

/**
 * Recorded policy and pipeline failures, with the triage actions the server offered
 * for each. Renders the section including its heading, or nothing at all, so one
 * place decides whether the block exists; reviewing is leader-only and a refused
 * read yields no section. Covers policy runs only, since the older watched-folder
 * pipeline is not instrumented.
 */

const SEVERITY_TONE: Record<FailureSeverity, "danger" | "warning" | "info"> = {
  ERROR: "danger",
  WARNING: "warning",
  INFO: "info",
};

export function FileRunEventList() {
  const { t } = useTranslation();
  const { data: events, error } = useFileRunEvents();
  const { apply, refresh } = useFileRunEventActions();
  const [busy, setBusy] = useState<{ id: string; action: string } | null>(null);
  const [showJson, setShowJson] = useState(false);

  // A build without the proprietary module has no such route, and a caller who is
  // not a team leader gets a 403. Both mean there is nothing to show.
  const unavailable = error !== null;

  const act = async (event: FileRunEvent, actionId: string) => {
    setBusy({ id: event.id, action: actionId });
    try {
      await apply(event.id, actionId);
    } finally {
      setBusy(null);
    }
  };

  // Dev-only inspector for hand-checking classification against real uploads.
  // Vite folds `import.meta.env.DEV` to false, so builds drop this entirely.
  const debugPanel = !import.meta.env.DEV ? null : (
    <div className="processor-failures__debug">
      <Button variant="secondary" size="sm" onClick={() => void refresh()}>
        Refresh failures
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowJson((shown) => !shown)}
      >
        {showJson ? "Hide" : "Show"} raw JSON ({events?.length ?? 0})
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          void navigator.clipboard.writeText(
            JSON.stringify(events ?? [], null, 2),
          )
        }
      >
        Copy JSON
      </Button>
      {showJson && (
        <pre className="processor-failures__debug-json">
          {JSON.stringify(events ?? [], null, 2)}
        </pre>
      )}
    </div>
  );

  // Nothing to show and no dev panel to frame, so skip the heading too rather
  // than leaving an empty "Failures" section.
  if (unavailable && debugPanel === null) {
    return null;
  }

  return (
    <section className="processor-failures">
      <h2 className="processor-failures__heading">
        {t("processor.failures.title", "Failures")}
      </h2>
      <p className="processor-failures__sub">
        {t(
          "processor.failures.subtitle",
          "Failures recorded from your policy runs, with the actions you can take.",
        )}
      </p>
      {debugPanel}
      {unavailable ? null : (
        <FailureBody events={events} busy={busy} onAction={act} />
      )}
    </section>
  );
}

/** What fills the section: loading, empty, or the rows. */
function FailureBody({
  events,
  busy,
  onAction,
}: {
  events: FileRunEvent[] | null;
  busy: { id: string; action: string } | null;
  onAction: (event: FileRunEvent, actionId: string) => void;
}) {
  const { t } = useTranslation();

  if (events === null) {
    return (
      <div className="processor-failures__skeleton" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height="4rem" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        title={t("processor.failures.empty.title", "No failures recorded")}
        description={t(
          "processor.failures.empty.description",
          "Policy runs that fail will appear here with the actions you can take.",
        )}
      />
    );
  }

  return (
    <ul className="processor-failures__list">
      {events.map((event) => (
        <li key={event.id} className="processor-failures__row">
          <div className="processor-failures__meta">
            <StatusBadge tone={SEVERITY_TONE[event.severity]}>
              {t(
                `processor.failures.stage.${event.stage.toLowerCase()}`,
                event.stage,
              )}
            </StatusBadge>
            <span className="processor-failures__title">
              {/* The server's key, with its English fallback for kinds this
                build has no copy for. */}
              {t(event.titleKey, { defaultValue: event.defaultTitle })}
            </span>
            {event.occurrences > 1 && (
              <span className="processor-failures__count">
                {t("processor.failures.occurrences", "{{count}} occurrences", {
                  count: event.occurrences,
                })}
              </span>
            )}
          </div>

          {/* A reference, not a name. The record deliberately holds no document
            identity, so a reviewer sees which run failed, never which file. */}
          {event.runId && (
            <div className="processor-failures__file">
              {t("processor.failures.runReference", "Run {{runId}}", {
                runId: event.runId,
              })}
            </div>
          )}
          {event.detail && (
            <p className="processor-failures__detail">{event.detail}</p>
          )}

          <FailureActionButtons
            event={event}
            busyActionId={busy?.id === event.id ? busy.action : null}
            onAction={(actionId) => onAction(event, actionId)}
          />
        </li>
      ))}
    </ul>
  );
}
