import { Center, Stack, Loader, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

export default function ToolLoadingFallback({
  toolName,
}: {
  toolName?: string;
}) {
  const { t } = useTranslation();
  return (
    <Center h="100%" w="100%">
      <Stack align="center" gap="md">
        <Loader size="lg" />
        <Text c="dimmed" size="sm">
          {toolName
            ? t("toolLoading.named", "Loading {{toolName}}...", { toolName })
            : t("toolLoading.generic", "Loading tool...")}
        </Text>
      </Stack>
    </Center>
  );
}
