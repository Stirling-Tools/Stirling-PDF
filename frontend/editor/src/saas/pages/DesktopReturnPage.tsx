import { useEffect, useMemo } from "react";
import { Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { DESKTOP_BILLING_RETURN } from "@app/constants/billingEvents";

/** Only what desktop needs to finish a purchase reaches the app's own scheme. */
const FORWARDED = [
  "payment_status",
  "session_id",
  "checkout_kind",
  "team_quantity",
];

/**
 * Where Stripe sends a desktop user back to. Stripe returns only to http(s)
 * pages, so this one opens the app through its scheme with the result. The
 * button covers browsers that ask before opening another app.
 */
export default function DesktopReturnPage() {
  const { t } = useTranslation();
  const target = useMemo(() => {
    const incoming = new URLSearchParams(window.location.search);
    const forwarded = new URLSearchParams();
    for (const key of FORWARDED) {
      const value = incoming.get(key);
      if (value !== null) forwarded.set(key, value);
    }
    const query = forwarded.toString();
    return query
      ? `${DESKTOP_BILLING_RETURN}?${query}`
      : DESKTOP_BILLING_RETURN;
  }, []);

  useEffect(() => {
    window.location.assign(target);
  }, [target]);

  return (
    <Stack
      align="center"
      justify="center"
      gap="md"
      style={{ minHeight: "100dvh", padding: "1rem", textAlign: "center" }}
    >
      <Title order={3}>
        {t("desktopReturn.title", "Returning to Stirling PDF")}
      </Title>
      <Text c="dimmed">
        {t(
          "desktopReturn.body",
          "You can close this tab once Stirling PDF opens.",
        )}
      </Text>
      <Button onClick={() => window.location.assign(target)}>
        {t("desktopReturn.open", "Open Stirling PDF")}
      </Button>
    </Stack>
  );
}
