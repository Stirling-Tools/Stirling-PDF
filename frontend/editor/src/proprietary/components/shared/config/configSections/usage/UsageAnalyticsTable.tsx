import { useMemo, type FC } from "react";
import { Card, Text, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { column, DataTable, type DataTableColumn } from "@app/ui";
import { type EndpointStatistic } from "@app/services/usageAnalyticsService";

interface UsageAnalyticsTableProps {
  data: EndpointStatistic[];
}

interface RankedEndpointStatistic extends EndpointStatistic {
  rank: number;
}

const UsageAnalyticsTable: FC<UsageAnalyticsTableProps> = ({ data }) => {
  const { t } = useTranslation();

  const rows = useMemo<RankedEndpointStatistic[]>(
    () =>
      data.map((stat, index) => ({
        ...stat,
        rank: index + 1,
      })),
    [data],
  );

  const columns = useMemo<DataTableColumn<RankedEndpointStatistic>[]>(
    () => [
      column.muted({
        key: "rank",
        header: "#",
        get: (r) => String(r.rank),
        sortable: true,
      }),
      column.text({
        key: "endpoint",
        header: t("usage.table.endpoint", "Endpoint"),
        get: (r) => r.endpoint,
        sortable: true,
      }),
      column.number({
        key: "visits",
        header: t("usage.table.visits", "Visits"),
        get: (r) => r.visits,
        format: (n) => n.toLocaleString(),
        sortable: true,
      }),
      column.text({
        key: "percentage",
        header: t("usage.table.percentage", "Percentage"),
        get: (r) => `${r.percentage.toFixed(2)}%`,
        sortBy: (r) => r.percentage,
        sortable: true,
      }),
    ],
    [t],
  );

  return (
    <Card padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Text size="lg" fw={600}>
          {t("usage.table.title", "Detailed Statistics")}
        </Text>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.endpoint}
          empty={t("usage.table.noData", "No data available")}
          defaultSort={{ key: "visits", direction: "desc" }}
        />
      </Stack>
    </Card>
  );
};

export default UsageAnalyticsTable;
