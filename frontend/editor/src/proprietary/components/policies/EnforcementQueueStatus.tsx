/**
 * Compact status row for the {@link enforcementQueue}, shown in the Policies
 * panel whenever enforcement jobs are pending or running. The queue is serial,
 * so a slow policy run would otherwise be invisible — this surfaces what's being
 * enforced (before export, print, convert, …) and how many jobs are waiting.
 */
import { Group, Text, Loader } from "@mantine/core";
import { useEnforcementQueue } from "@app/components/policies/enforcementQueue";

const TRIGGER_VERB: Record<string, string> = {
  export: "Enforcing before export",
  print: "Enforcing before print",
  convert: "Enforcing before convert",
  input: "Enforcing on import",
};

export function EnforcementQueueStatus() {
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
        {TRIGGER_VERB[lead.trigger] ?? "Enforcing"}: {lead.label}
        {queued > 0 ? ` · +${queued} queued` : "…"}
      </Text>
    </Group>
  );
}

export default EnforcementQueueStatus;
