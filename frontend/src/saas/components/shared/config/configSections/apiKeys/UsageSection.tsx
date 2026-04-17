import React from "react";
import { Paper, Stack, Group, Text, Divider } from "@mantine/core";
import StackedBarChart from "@app/components/shared/charts/StackedBarChart";
import { FractionData } from "@app/types/charts";
import { ApiCredits as ApiUsage } from "@app/types/credits";
import SkeletonLoader from "@app/components/shared/SkeletonLoader";
import { formatUTC } from "@app/components/shared/utils/date";
import { useTranslation } from "react-i18next";

// Using shared ApiCredits type as ApiUsage

interface UsageSectionProps {
  apiUsage: ApiUsage;
  obscured?: boolean;
  overlayMessage?: string;
  loading?: boolean;
}

export default function UsageSection({
  apiUsage,
  obscured,
  overlayMessage,
  loading,
}: UsageSectionProps) {
  const { t } = useTranslation();
  const weeklyUsed =
    apiUsage.weeklyCreditsAllocated - apiUsage.weeklyCreditsRemaining;
  const boughtUsed =
    apiUsage.totalBoughtCredits - apiUsage.boughtCreditsRemaining;

  // Totals for overall usage visualization
  const totalRemaining = Math.max(apiUsage.totalAvailableCredits, 0);

  const formatDate = (iso: string, withTime: boolean) =>
    formatUTC(iso, withTime);

  // Prepare data for the stacked bar chart
  const fractions: FractionData[] = [
    {
      name: t("config.apiKeys.includedCredits", "Included credits"),
      numerator: Math.max(0, weeklyUsed),
      denominator: Math.max(0, apiUsage.weeklyCreditsAllocated),
      numeratorLabel: t("common.used", "used"),
      denominatorLabel: t("common.available", "available"),
      color: "var(--usage-weekly-active)",
    },
    {
      name: t("config.apiKeys.purchasedCredits", "Purchased credits"),
      numerator: Math.max(0, boughtUsed),
      denominator: Math.max(0, apiUsage.totalBoughtCredits),
      numeratorLabel: t("common.used", "used"),
      denominatorLabel: t("common.available", "available"),
      color: "var(--usage-bought-active)",
    },
  ];

  return (
    <div style={{ position: "relative" }}>
      <Paper
        radius="md"
        p={18}
        style={{
          background: "var(--api-keys-card-bg)",
          border: "1px solid var(--api-keys-card-border)",
          boxShadow: "0 2px 8px var(--api-keys-card-shadow)",
        }}
      >
        <Stack
          gap={12}
          style={{
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
          }}
        >
          <Group justify="space-between">
            <Text fw={500}>
              {t("config.apiKeys.creditsRemaining", "Credits Remaining")}:{" "}
              {loading ? (
                <SkeletonLoader type="block" width={40} height={14} />
              ) : (
                totalRemaining
              )}
            </Text>
          </Group>

          <StackedBarChart
            fractions={fractions}
            width={640}
            height={22}
            showLegend={true}
            tooltipPosition="top"
            loading={Boolean(loading)}
            animate={!loading}
            animationDurationMs={900}
            ariaLabel={t("config.apiKeys.chartAriaLabel", {
              includedUsed: Math.max(0, weeklyUsed),
              includedTotal: Math.max(0, apiUsage.weeklyCreditsAllocated),
              purchasedUsed: Math.max(0, boughtUsed),
              purchasedTotal: Math.max(0, apiUsage.totalBoughtCredits),
              defaultValue:
                "Credits usage: included {{includedUsed}} of {{includedTotal}}, purchased {{purchasedUsed}} of {{purchasedTotal}}",
            })}
          />

          <Divider my={4} />

          <Group justify="space-between" wrap="wrap">
            <Group gap="lg">
              <Text size="sm" c="dimmed">
                {t("config.apiKeys.nextReset", "Next Reset")}:{" "}
                {loading ? (
                  <SkeletonLoader type="block" width={120} height={12} />
                ) : (
                  formatDate(apiUsage.weeklyResetDate, false)
                )}
              </Text>
              <Text size="sm" c="dimmed">
                {t("config.apiKeys.lastApiUse", "Last API Use")}:{" "}
                {loading ? (
                  <SkeletonLoader type="block" width={160} height={12} />
                ) : (
                  formatDate(apiUsage.lastApiUsage, true)
                )}
              </Text>
            </Group>
          </Group>
        </Stack>
      </Paper>

      {obscured && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 16,
            color: "var(--mantine-color-text)",
            background: "rgba(16, 18, 27, 0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Text size="sm" c="dimmed">
            {overlayMessage ||
              t(
                "config.apiKeys.overlayMessage",
                "Generate a key to see credits and available credits",
              )}
          </Text>
        </div>
      )}
    </div>
  );
}
