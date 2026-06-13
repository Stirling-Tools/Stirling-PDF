import { Text, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";

export function OverviewHeader() {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      window.location.assign("/login");
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <div>
          <Text fw={600} size="lg">
            {t("config.overview.title", "Application Configuration")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "config.overview.description",
              "Current application settings and configuration details.",
            )}
          </Text>
          {user?.email && (
            <Text size="xs" c="dimmed" mt="0.25rem">
              {t("account.overview.signedInAs", "Signed in as: {{email}}", {
                email: user.email,
              })}
            </Text>
          )}
        </div>
        {user && (
          <Button color="red" variant="filled" onClick={handleLogout}>
            {t("account.overview.logOut", "Log out")}
          </Button>
        )}
      </div>
    </div>
  );
}
