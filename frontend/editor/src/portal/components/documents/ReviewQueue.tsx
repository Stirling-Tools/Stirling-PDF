import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import {
  Button,
  type DataTableFilter,
  EmptyState,
  Input,
  Skeleton,
} from "@app/ui";
import type { DocumentStatus, ReviewDocument } from "@portal/api/documents";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { DocumentsIcon } from "@portal/components/icons";
import { ReviewQueueTable } from "@portal/components/documents/ReviewQueueTable";
import { DocumentDrawer } from "@portal/components/documents/DocumentDrawer";

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
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Search pre-filters the rows; the status filter is owned + applied by the
  // table via its `filters` prop, so both controls live in the table frame.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q),
    );
  }, [documents, query]);

  const countFor = (f: QueueFilter): number => {
    const statuses = FILTER_STATUSES[f];
    if (statuses === null) return documents.length;
    return documents.filter((d) => statuses.includes(d.status)).length;
  };

  const selected = documents.find((d) => d.id === selectedId) ?? null;

  const statusFilters: DataTableFilter<ReviewDocument>[] = [
    {
      key: "status",
      ariaLabel: t("portal.documents.filters.ariaLabel"),
      options: [
        {
          value: "all",
          label: t("portal.documents.filters.all"),
          count: countFor("all"),
        },
        {
          value: "flagged",
          label: t("portal.documents.filters.flagged"),
          count: countFor("flagged"),
        },
        {
          value: "processed",
          label: t("portal.documents.filters.processed"),
          count: countFor("processed"),
        },
        {
          value: "in-review",
          label: t("portal.documents.filters.inReview"),
          count: countFor("in-review"),
        },
      ],
      predicate: (d, value) => {
        const statuses = FILTER_STATUSES[value as QueueFilter];
        return statuses == null || statuses.includes(d.status);
      },
    },
  ];

  const search = (
    <Input
      className="portal-documents__search"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder={t("portal.documents.search")}
      aria-label={t("portal.documents.search")}
      leadingIcon={<SearchIcon />}
      inputSize="sm"
    />
  );

  const isLoading = loading && documents.length === 0;
  const isEmpty = !loading && documents.length === 0;

  return (
    <div className="portal-documents__queue">
      {isLoading && (
        <div className="portal-documents__table-skeleton" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon={<DocumentsIcon size={28} />}
          title={t("portal.documents.queue.empty.title")}
          description={t("portal.documents.queue.empty.description")}
          actions={
            <>
              <Button
                onClick={() =>
                  navigate(`${toPortalPath(VIEW_PATHS.pipelines)}/new`)
                }
                leftSection={
                  <AddRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
              >
                {t("portal.documents.queue.empty.createPipeline")}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(`${toPortalPath(VIEW_PATHS.sources)}/new`)
                }
              >
                {t("portal.documents.queue.empty.connectSource")}
              </Button>
            </>
          }
        />
      )}

      {!isLoading && !isEmpty && (
        <ReviewQueueTable
          documents={searched}
          onRowClick={(d) => setSelectedId(d.id)}
          filters={statusFilters}
          toolbar={search}
        />
      )}

      <DocumentDrawer doc={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
