import { MetricCard, MetricStrip } from "@shared/components";
import type { UsersResponse } from "@portal/api/users";
import { seatsLabel } from "@portal/components/users/format";

/**
 * KPI labels are product copy — they describe what each metric IS, not its
 * value. They stay client-side so the strip's structure is stable across
 * loading / empty / ready states; only the values flow from the API.
 */
const KPI_LABELS = ["Members", "Pending invites", "Seats used"] as const;

interface UsersSummaryStripProps {
  data: UsersResponse | null;
  loading: boolean;
}

export function UsersSummaryStrip({ data, loading }: UsersSummaryStripProps) {
  const summary = loading ? undefined : data?.summary;

  const values: Record<(typeof KPI_LABELS)[number], string | number> = {
    Members: summary?.totalMembers ?? "—",
    "Pending invites": summary?.pendingInvites ?? "—",
    "Seats used": summary
      ? seatsLabel(summary.seatsUsed, summary.seatLimit)
      : "—",
  };

  return (
    <MetricStrip>
      {KPI_LABELS.map((label) => (
        <MetricCard key={label} label={label} value={values[label]} />
      ))}
    </MetricStrip>
  );
}
