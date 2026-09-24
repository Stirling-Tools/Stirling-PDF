import { useState } from "react";
import { Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Banner } from "@app/ui/Banner";
import { openExternal } from "@app/platform/openExternal";

/** Billing runs on the web because desktop does not ship the processor's billing UI. */
export function BillingSettingsSection() {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openBilling() {
    setOpening(true);
    setFailed(false);
    try {
      const base = import.meta.env.VITE_SAAS_FRONTEND_URL;
      await openExternal(
        new URL("settings/billing", `${base.replace(/\/+$/, "")}/`).href,
      );
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <Stack align="flex-start">
      <Text>
        {t(
          "desktopBilling.description",
          "Manage usage and billing in your browser. Sign in with the same Stirling account you use here.",
        )}
      </Text>
      {failed && (
        <Banner tone="danger">
          {t(
            "desktopBilling.openFailed",
            "Could not open your browser. Try again, or open Usage & Billing on the Stirling website.",
          )}
        </Banner>
      )}
      <Button loading={opening} onClick={() => void openBilling()}>
        {t("desktopBilling.open", "Open Usage & Billing in browser")}
      </Button>
    </Stack>
  );
}
