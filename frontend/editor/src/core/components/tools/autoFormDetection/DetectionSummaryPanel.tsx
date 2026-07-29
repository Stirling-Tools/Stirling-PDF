import { Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Banner } from "@app/ui/Banner";
import { DetectionSummary } from "@app/services/formDetection/progress";

const TYPE_META: Record<string, { icon: string; labelKey: string; fallback: string }> = {
  text: {
    icon: "text-fields-rounded",
    labelKey: "autoFormDetection.summary.textFields",
    fallback: "Text fields",
  },
  checkbox: {
    icon: "check-box-outline-rounded",
    labelKey: "autoFormDetection.summary.checkboxes",
    fallback: "Checkboxes",
  },
  radio: {
    icon: "radio-button-checked-outline",
    labelKey: "autoFormDetection.summary.radioButtons",
    fallback: "Radio buttons",
  },
  signature: {
    icon: "signature-rounded",
    labelKey: "autoFormDetection.summary.signatures",
    fallback: "Signatures",
  },
};

export default function DetectionSummaryPanel({
  summary,
}: {
  summary: DetectionSummary;
}) {
  const { t } = useTranslation();

  if (summary.total === 0) {
    return (
      <Banner
        tone="warning"
        icon={<LocalIcon icon="search-rounded" width="1.1rem" height="1.1rem" />}
        title={t("autoFormDetection.summary.noneTitle", "No form fields found")}
        description={t(
          "autoFormDetection.summary.noneBody",
          'The document may not contain form-like areas. Undo, switch sensitivity to "Thorough", and run again to look harder.',
        )}
      />
    );
  }

  const entries = Object.entries(summary.byType).sort((a, b) => b[1] - a[1]);

  return (
    <Stack gap="xs">
      <Group gap={6} wrap="nowrap">
        <LocalIcon
          icon="verified-outline-rounded"
          width="1.15rem"
          height="1.15rem"
          style={{ color: "var(--c-success)" }}
        />
        <Text size="sm" fw={600}>
          {t(
            "autoFormDetection.summary.title",
            "{{count}} fillable fields added",
            { count: summary.total },
          )}
        </Text>
      </Group>

      <Group gap="xs">
        {entries.map(([type, count]) => {
          const meta = TYPE_META[type] ?? {
            icon: "text-fields-rounded",
            labelKey: `autoFormDetection.summary.${type}`,
            fallback: type,
          };
          return (
            <Group
              key={type}
              gap={4}
              wrap="nowrap"
              style={{
                border: "1px solid var(--c-border-subtle)",
                background: "var(--c-surface-sunken)",
                borderRadius: "var(--mantine-radius-xl)",
                padding: "0.125rem 0.5rem",
              }}
            >
              <LocalIcon icon={meta.icon} width="0.9rem" height="0.9rem" />
              <Text size="xs">
                {t(meta.labelKey, meta.fallback)}: {count}
              </Text>
            </Group>
          );
        })}
      </Group>

      {summary.pagesWithFields > 1 ? (
        <Text size="xs" c="dimmed">
          {t("autoFormDetection.summary.pages", "Across {{count}} pages.", {
            count: summary.pagesWithFields,
          })}
        </Text>
      ) : null}
    </Stack>
  );
}
