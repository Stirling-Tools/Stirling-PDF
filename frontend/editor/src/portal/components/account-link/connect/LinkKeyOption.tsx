import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, FormField, Input } from "@app/ui";
import {
  isLinkKey,
  linkKeyErrorMessage,
  redeemLinkKey,
} from "@app/services/linkKey";
import "@app/components/account-link/connect.css";

/**
 * The second way to connect: a key someone with the Stirling account created and sent over, so
 * whoever runs this server never has to sign in to it. Collapsed by default so signing in stays
 * the main path.
 */
export function LinkKeyOption({ onLinked }: { onLinked: () => void }) {
  const { t } = useTranslation();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
        {t(
          "portal.accountLink.connect.key.toggle",
          "Have a link key from Stirling Cloud?",
        )}
      </Button>
    );
  }

  const looksWrong = key.trim() !== "" && !isLinkKey(key);

  return (
    <form
      id={formId}
      className="portal-connect__key"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !isLinkKey(key)) return;
        setBusy(true);
        setError(null);
        try {
          await redeemLinkKey(key);
          onLinked();
        } catch (e) {
          setError(linkKeyErrorMessage(e, t));
        } finally {
          setBusy(false);
        }
      }}
    >
      <FormField
        label={t("portal.accountLink.connect.key.label", "Link key")}
        error={
          looksWrong
            ? t(
                "portal.accountLink.connect.key.notAKey",
                "Link keys start with stlk_. A license key goes under Usage & Billing instead.",
              )
            : undefined
        }
      >
        <Input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            setError(null);
          }}
          disabled={busy}
          placeholder="stlk_"
          data-autofocus
        />
      </FormField>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="portal-connect__key-actions">
        <Button type="submit" loading={busy} disabled={!isLinkKey(key)}>
          {t("portal.accountLink.connect.key.submit", "Connect with key")}
        </Button>
      </div>
    </form>
  );
}
