import { Card, Skeleton } from "@shared/components";

/** Placeholder fleet while the deployed pipelines load. */
export function PipelineListSkeleton() {
  return (
    <div className="portal-pipelines__list" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} padding="loose" className="portal-pipelines__card">
          <div className="portal-pipelines__card-head">
            <Skeleton width="11rem" height="1.1rem" />
            <Skeleton width="5rem" height="1.1rem" />
          </div>
          <Skeleton width="80%" height="0.75rem" />
          <Skeleton height="3rem" />
        </Card>
      ))}
    </div>
  );
}
