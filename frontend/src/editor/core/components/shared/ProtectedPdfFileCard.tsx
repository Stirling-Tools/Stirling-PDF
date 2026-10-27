import { Group, Text } from "@mantine/core";
import { Icon } from "@editor/ui/Icon";

/** Shared file identity for opening and managing a protected PDF. */
export function ProtectedPdfFileCard({ fileName }: { fileName?: string }) {
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      p="sm"
      style={{
        background: "var(--c-surface-raised)",
        borderRadius: "var(--mantine-radius-md)",
      }}
    >
      <Icon
        name="lock"
        size={20}
        style={{ color: "var(--c-text-muted)", flexShrink: 0 }}
      />
      <Text size="sm" fw={500} style={{ overflowWrap: "anywhere" }}>
        {fileName}
      </Text>
    </Group>
  );
}
