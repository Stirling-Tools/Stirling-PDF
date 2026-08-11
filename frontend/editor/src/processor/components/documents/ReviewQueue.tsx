import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import {
  Button,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  type TabItem,
} from "@app/ui";
import type { DocumentStatus, ReviewDocument } from "@processor/api/documents";
import { VIEW_PATHS, toProcessorPath } from "@processor/contexts/ViewContext";
import { DocumentsIcon } from "@processor/components/icons";
import { ReviewQueueTable } from "@processor/components/documents/ReviewQueueTable";
import { DocumentDrawer } from "@processor/components/documents/DocumentDrawer";

type QueueFilter = "all" | "flagged" | "processed" | "in-review";

/** Which document statuses each filter pill admits. */
const FILTER_STATUSES: Record<QueueFilter, DocumentStatus[] | null> = {
  all: null,
  flagged: ["flagged"],
  processed: ["processed"],
  "in-review": ["in-review"],
};

interface ReviewQueueProps {
  documents: ReviewDocument[];
  loading: boolean;
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path
        d="m20 20-3.5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The processing list: status filter pills, a filename search, the document
 * table, and a detail drawer. The primary Documents surface.
 */
export function ReviewQueue({ documents, loading }: ReviewQueueProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q),
    );
  }, [documents, query]);

  const rows = useMemo(() => {
    const statuses = FILTER_STATUSES[filter];
    if (statuses === null) return searched;
    return searched.filter((d) => statuses.includes(d.status));
  }, [searched, filter]);

  const countFor = (f: QueueFilter): number => {
    const statuses = FILTER_STATUSES[f];
    if (statuses === null) return documents.length;
    return documents.filter((d) => statuses.includes(d.status)).length;
  };

  const selected = documents.find((d) => d.id === selectedId) ?? null;

  const filterItems: TabItem<QueueFilter>[] = [
    {
      key: "all",
      label: t("processor.documents.filters.all"),
      count: countFor("all"),
    },
    {
      key: "flagged",
      label: t("processor.documents.filters.flagged"),
      count: countFor("flagged"),
    },
    {
      key: "processed",
      label: t("processor.documents.filters.processed"),
      count: countFor("processed"),
    },
    {
      key: "in-review",
      label: t("processor.documents.filters.inReview"),
      count: countFor("in-review"),
    },
  ];

  const isLoading = loading && documents.length === 0;
  const isEmpty = !loading && documents.length === 0;

  return (
    <div className="processor-documents__queue">
      {/* The filter pills + search are counters over the list, so hide them when
          the list is empty — the empty state stands alone. */}
      {!isLoading && !isEmpty && (
        <div className="processor-documents__toolbar">
          <Tabs<QueueFilter>
            items={filterItems}
            activeKey={filter}
            onChange={setFilter}
            variant="pill"
            ariaLabel={t("processor.documents.filters.ariaLabel")}
          />
          <Input
            className="processor-documents__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("processor.documents.search")}
            aria-label={t("processor.documents.search")}
            leadingIcon={<SearchIcon />}
            inputSize="sm"
          />
        </div>
      )}

      {isLoading && (
        <div className="processor-documents__table-skeleton" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon={<DocumentsIcon size={28} />}
          title={t("processor.documents.queue.empty.title")}
          description={t("processor.documents.queue.empty.description")}
          actions={
            <>
              <Button
                onClick={() =>
                  navigate(`${toProcessorPath(VIEW_PATHS.pipelines)}/new`)
                }
                leftSection={
                  <AddRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
              >
                {t("processor.documents.queue.empty.createPipeline")}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(`${toProcessorPath(VIEW_PATHS.sources)}/new`)
                }
              >
                {t("processor.documents.queue.empty.connectSource")}
              </Button>
            </>
          }
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
