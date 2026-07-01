import { Skeleton } from "@shared/components";

/** Placeholder grid shown inside a table card while rows are loading. */
export function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="portal-infra__table-skel" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="portal-infra__table-skel-row">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height="0.75rem" />
          ))}
        </div>
      ))}
    </div>
  );
}
