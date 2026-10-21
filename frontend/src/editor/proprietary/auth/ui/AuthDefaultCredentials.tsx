import { Alert, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { DEFAULT_ADMIN_CREDENTIALS } from "@app/auth/defaultCredentials";

/**
 * First-time-setup notice showing the default admin credentials. Rendered
 * beneath the login form when the backend reports a fresh install.
 */
export default function AuthDefaultCredentials() {
  const { t } = useTranslation();
  return (
    <Alert color="blue" variant="light" radius="md" mt="xl">
      <Stack gap="xs" align="center">
        <Text size="sm" fw={600} ta="center" style={{ color: "var(--c-text)" }}>
          {t("login.defaultCredentials", "Default Login Credentials")}
        </Text>
        <Text size="sm" ta="center" style={{ color: "var(--c-text)" }}>
          <Text component="span" fw={600} style={{ color: "var(--c-text)" }}>
            {t("login.username", "Username")}:
          </Text>{" "}
          {DEFAULT_ADMIN_CREDENTIALS.username}
        </Text>
        <Text size="sm" ta="center" style={{ color: "var(--c-text)" }}>
          <Text component="span" fw={600} style={{ color: "var(--c-text)" }}>
            {t("login.password", "Password")}:
          </Text>{" "}
          {DEFAULT_ADMIN_CREDENTIALS.password}
        </Text>
        <Text
          size="xs"
          ta="center"
          mt="xs"
          style={{ color: "var(--c-text-subtle)" }}
        >
          {t(
            "login.changePasswordWarning",
            "Please change your password after logging in for the first time",
          )}
        </Text>
      </Stack>
    </Alert>
  );
}
