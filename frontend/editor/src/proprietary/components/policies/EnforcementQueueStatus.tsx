/**
 * Compact status row for the {@link enforcementQueue}, shown in the Policies
 * panel whenever enforcement jobs are pending or running. The queue is serial,
 * so a slow policy run would otherwise be invisible — this surfaces what's being
 * enforced (before export, print, convert, …) and how many jobs are waiting.
 */
import { useTranslation } from "react-i18next";
import { Group, Text, Loader } from "@mantine/core";
import { useEnforcementQueue } from "@app/components/policies/enforcementQueue";

export function EnforcementQueueStatus() {
  const { t } = useTranslation();
  const jobs = useEnforcementQueue();
  const active = jobs.filter(
    (j) => j.status === "pending" || j.status === "running",
  );
  if (active.length === 0) return null;

  // The running job leads the row; everything else is still queued behind it.
  const lead = active.find((j) => j.status === "running") ?? active[0];
  const queued = active.length - 1;

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      px="sm"
      py={6}
      role="status"
      aria-live="polite"
    >
      <Loader size="xs" />
      <Text size="xs" c="dimmed" truncate>
        {t(`policies.enforcement.triggerVerb.${lead.trigger}`, {
          defaultValue: t("policies.enforcement.triggerVerb.default"),
        })}
        : {lead.label}
        {queued > 0
          ? ` · ${t("policies.enforcement.queued", { count: queued })}`
          : "…"}
      </Text>
    </Group>
  );
}

export default EnforcementQueueStatus;
