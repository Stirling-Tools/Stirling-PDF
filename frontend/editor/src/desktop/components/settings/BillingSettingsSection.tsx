import { useState } from "react";
import { Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Banner } from "@app/ui/Banner";
import { openExternal } from "@app/platform/openExternal";
import { connectionModeService } from "@app/services/connectionModeService";

/** Billing runs on the web because desktop does not ship the processor's billing UI. */
export function BillingSettingsSection({
  mode,
}: {
  mode: "saas" | "selfhosted";
}) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openBilling() {
    setOpening(true);
    setFailed(false);
    try {
      const connection = await connectionModeService.getCurrentConfig();
      if (connection.mode !== mode) throw new Error("Connection changed");
      const base =
        mode === "saas"
          ? import.meta.env.VITE_SAAS_FRONTEND_URL
          : connection.server_config?.url;
      if (!base) throw new Error("Billing destination unavailable");
      const url = new URL(base);
      if (url.protocol !== "https:" && url.protocol !== "http:")
        throw new Error("Invalid billing destination");
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/settings/billing`;
      url.search = "";
      url.hash = "";
      url.username = "";
      url.password = "";
      await openExternal(url.href);
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <Stack align="flex-start">
      <Text>
        {mode === "selfhosted"
          ? t(
              "desktopBilling.selfHostedDescription",
              "Manage usage and billing on your connected server in your browser. Sign in with your server owner account.",
            )
          : t(
              "desktopBilling.description",
              "Manage usage and billing in your browser. Sign in with the same Stirling account you use here.",
            )}
      </Text>
      {failed && (
        <Banner tone="danger">
          {t(
            "desktopBilling.openFailed",
            "Could not open Usage & Billing. Check your connection and try again.",
          )}
        </Banner>
      )}
      <Button loading={opening} onClick={() => void openBilling()}>
        {t("desktopBilling.open", "Open Usage & Billing in browser")}
      </Button>
    </Stack>
  );
}
