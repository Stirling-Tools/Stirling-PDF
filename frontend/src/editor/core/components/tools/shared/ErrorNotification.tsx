import { Notification, Text, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";

export interface ErrorNotificationProps {
  error: string | null;
  onClose: () => void;
  title?: string;
  color?: string;
  mb?: string;
}

const ErrorNotification = ({
  error,
  onClose,
  title,
  color = "red",
  mb = "md",
}: ErrorNotificationProps) => {
  const { t } = useTranslation();

  if (!error) return null;

  const isStrictModeError =
    typeof error === "string" && error.includes("Strict PDF/A mode enabled");

  return (
    <Notification
      color={color}
      title={title || t("error._value", "Error")}
      onClose={onClose}
      mb={mb}
    >
      <Stack gap={6}>
        <Text size="sm">{error}</Text>
        {isStrictModeError && (
          <Text size="xs" c="dimmed">
            {t(
              "convert.strictModeAdvice",
              "If conversion fails, disable Strict Mode for standard PDF/A compatibility or choose PDF/A-2b.",
            )}
          </Text>
        )}
      </Stack>
    </Notification>
  );
};

export default ErrorNotification;
