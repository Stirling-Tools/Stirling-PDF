import { useMemo } from "react";
import { StatusBadge, Table, type TableColumn } from "@shared/components";
import type { Pipeline } from "@portal/api/pipelines";
import { compact, goldenTone, pct } from "@portal/components/pipelines/format";

interface DeployedPipelinesTableProps {
  pipelines: Pipeline[];
  onRowClick: (p: Pipeline) => void;
}

/**
 * Dense roster of the deployed fleet that puts golden-set reliability up front.
 * The card list below it carries the full per-pipeline story; this table is the
 * scannable "is anything below its bound?" view across the whole fleet.
 */
export function DeployedPipelinesTable({
  pipelines,
  onRowClick,
}: DeployedPipelinesTableProps) {
  const columns = useMemo<TableColumn<Pipeline>[]>(
    () => [
      {
        key: "name",
        header: "Pipeline",
        render: (p) => (
          <div className="portal-pipelines__roster-name">
            <strong>{p.name}</strong>
            <span className="portal-pipelines__roster-route">
              {p.source} → {p.destination}
            </span>
          </div>
        ),
      },
      {
        key: "status",
        header: "Health",
        render: (p) => (
          <StatusBadge
            tone={p.status === "degraded" ? "warning" : "success"}
            size="sm"
            pulse={p.status === "degraded"}
          >
            {p.status === "degraded" ? "Degraded" : "Healthy"}
          </StatusBadge>
        ),
      },
      {
        key: "golden",
        header: "Golden set",
        width: "11rem",
        render: (p) => {
          const tone = goldenTone(p.golden);
          const rate = p.golden.total ? p.golden.passing / p.golden.total : 0;
          return (
            <div className="portal-pipelines__roster-golden">
              <StatusBadge tone={tone} size="sm">
                {p.golden.passing}/{p.golden.total}
              </StatusBadge>
              <span
                className="portal-pipelines__roster-rate"
                title={`Bound: ${pct(p.golden.threshold, 0)}`}
              >
                {pct(rate, 1)}
              </span>
            </div>
          );
        },
      },
      {
        key: "docs",
        header: "Docs / 24h",
        align: "right",
        render: (p) => (
          <span className="portal-pipelines__roster-num">
            {compact(p.metrics.docs24h)}
          </span>
        ),
      },
      {
        key: "version",
        header: "Version",
        align: "right",
        render: (p) => (
          <span className="portal-pipelines__roster-version">{p.version}</span>
        ),
      },
    ],
    [],
  );

  return (
    <Table<Pipeline>
      className="portal-pipelines__roster"
      columns={columns}
      rows={pipelines}
      rowKey={(p) => p.id}
      onRowClick={onRowClick}
    />
  );
}
