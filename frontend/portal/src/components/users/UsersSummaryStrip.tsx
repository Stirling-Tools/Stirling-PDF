import { useTranslation } from "react-i18next";
import { MetricCard, MetricStrip } from "@shared/components";
import type { UsersResponse } from "@portal/api/users";
import { seatsLabel } from "@portal/components/users/format";

/**
 * Stable identifiers for the KPI tiles. They keep the strip's structure
 * constant across loading / empty / ready states; only the values flow from
 * the API and the displayed labels come from the locale.
 */
const KPI_KEYS = ["members", "pendingInvites", "seatsUsed"] as const;

interface UsersSummaryStripProps {
  data: UsersResponse | null;
  loading: boolean;
}

export function UsersSummaryStrip({ data, loading }: UsersSummaryStripProps) {
  const { t } = useTranslation();
  const summary = loading ? undefined : data?.summary;

  const values: Record<(typeof KPI_KEYS)[number], string | number> = {
    members: summary?.totalMembers ?? "—",
    pendingInvites: summary?.pendingInvites ?? "—",
    seatsUsed: summary ? seatsLabel(summary.seatsUsed, summary.seatLimit) : "—",
  };

  return (
    <MetricStrip>
      {KPI_KEYS.map((key) => (
        <MetricCard
          key={key}
          label={t(`users.summary.${key}`)}
          value={values[key]}
        />
      ))}
    </MetricStrip>
  );
}
