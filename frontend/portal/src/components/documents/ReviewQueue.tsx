import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, Skeleton, Tabs, type TabItem } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchDocuments,
  type DocumentStatus,
  type DocumentsResponse,
  type ReviewDocument,
} from "@portal/api/documents";
import { DocumentsSummaryStrip } from "@portal/components/documents/DocumentsSummaryStrip";
import { ReviewQueueTable } from "@portal/components/documents/ReviewQueueTable";
import { DocumentDrawer } from "@portal/components/documents/DocumentDrawer";

type QueueFilter = "all" | "needs-review" | "processed" | "archived";

/** Which document statuses each filter pill admits. */
const FILTER_STATUSES: Record<QueueFilter, DocumentStatus[] | null> = {
  all: null,
  // "Needs review" surfaces both routed-for-review and flagged docs — the two
  // states that demand a human decision.
  "needs-review": ["needs-review", "flagged"],
  processed: ["processed"],
  archived: ["archived"],
};

function countFor(docs: ReviewDocument[], filter: QueueFilter): number {
  const statuses = FILTER_STATUSES[filter];
  if (statuses === null) return docs.length;
  return docs.filter((d) => statuses.includes(d.status)).length;
}

/**
 * The review/approval queue: KPI strip, status filter pills, the document
 * stream table, and a detail drawer. The primary Documents surface.
 */
export function ReviewQueue() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<DocumentsResponse>(() => fetchDocuments(tier), [tier]);
  const { data, loading } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const [filter, setFilter] = useState<QueueFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const documents = useMemo(() => data?.documents ?? [], [data]);

  const rows = useMemo(() => {
    const statuses = FILTER_STATUSES[filter];
    if (statuses === null) return documents;
    return documents.filter((d) => statuses.includes(d.status));
  }, [documents, filter]);

  const selected = documents.find((d) => d.id === selectedId) ?? null;

  const filterItems: TabItem<QueueFilter>[] = [
    {
      key: "all",
      label: t("documents.filters.all"),
      count: countFor(documents, "all"),
    },
    {
      key: "needs-review",
      label: t("documents.filters.needsReview"),
      count: countFor(documents, "needs-review"),
    },
    {
      key: "processed",
      label: t("documents.filters.processed"),
      count: countFor(documents, "processed"),
    },
    {
      key: "archived",
      label: t("documents.filters.archived"),
      count: countFor(documents, "archived"),
    },
  ];

  return (
    <div className="portal-documents__queue">
      <DocumentsSummaryStrip
        summary={data?.summary ?? null}
        loading={loading}
      />

      <Tabs<QueueFilter>
        items={filterItems}
        activeKey={filter}
        onChange={setFilter}
        variant="pill"
        ariaLabel={t("documents.filters.ariaLabel")}
      />

      {isLoading && (
        <div className="portal-documents__table-skeleton" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title={t("documents.queue.empty.title")}
          description={t("documents.queue.empty.description")}
        />
      )}

      {!isLoading && !isEmpty && (
        <ReviewQueueTable
          documents={rows}
          onRowClick={(d) => setSelectedId(d.id)}
        />
      )}

      <DocumentDrawer doc={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
