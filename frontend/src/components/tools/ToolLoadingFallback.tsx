import { Center, Stack, Loader, Text } from "@mantine/core";

export default function ToolLoadingFallback({ toolName }: { toolName?: string }) {
  return (
    <Center h="100%" w="100%">
      <Stack align="center" gap="md">
        <Loader size="lg" />
        <Text c="dimmed" size="sm">
          {toolName ? `Loading ${toolName}...` : "Loading tool..."}
        </Text>
      </Stack>
    </Center>
