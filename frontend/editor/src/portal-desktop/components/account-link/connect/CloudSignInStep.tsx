import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  FormField,
  Input,
  SectionDivider,
  Spinner,
  Stack,
} from "@app/ui";
import { oauthIconUrl } from "@app/auth/ui/oauthIcons";
import "@app/components/account-link/connect.css";
import "@app/portal/components/account-link/connect/CloudSignInStep.css";

export type CloudSignInStage = "choose" | "browser" | "password" | "connecting";

interface Props {
  reauth: boolean;
  stage: CloudSignInStage;
  error: string | null;
  onProvider: (provider: string) => void;
  onPassword: (email: string, password: string) => void;
}

// The providers the app's own Stirling Cloud sign-in offers.
const PROVIDERS = [
  { id: "google", label: "Google", icon: "google.svg" },
  { id: "github", label: "GitHub", icon: "github.svg" },
] as const;

/** Desktop signs in here, where the web sends the admin to Stirling's approval page. */
export function CloudSignInStep({
  reauth,
  stage,
  error,
  onProvider,
  onPassword,
}: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (stage === "connecting") {
    return (
      <div className="portal-connect__ghost" role="status">
        <Spinner size="sm" />
        <p className="portal-connect__lede">
          {t(
            "portal.accountLink.connect.callback.working",
            "Finishing the connection.",
          )}
        </p>
      </div>
    );
  }

  const waiting = stage !== "choose";
  const canSubmit = !waiting && email.trim() !== "" && password !== "";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) onPassword(email.trim(), password);
  };

  return (
    <Stack gap="4">
      <p className="portal-connect__lede">
        {reauth
          ? t(
              "portal.accountLink.desktopSignIn.reauthLede",
              "Sign in with the Stirling account this server is connected to.",
            )
          : t(
              "portal.accountLink.desktopSignIn.connectLede",
              "Sign in with the Stirling account to connect this server to. Only a team owner can connect a server.",
            )}
      </p>
      <Stack gap="2">
        {PROVIDERS.map((provider) => (
          <Button
            key={provider.id}
            variant="secondary"
            fullWidth
            disabled={waiting}
            leftSection={
              <img
                src={oauthIconUrl(provider.icon)}
                alt=""
                className="portal-cloud-sign-in__icon"
              />
            }
            onClick={() => onProvider(provider.id)}
          >
            {provider.label}
          </Button>
        ))}
        {stage === "browser" && (
          <p className="portal-connect__lede" role="status">
            {t(
              "portal.accountLink.desktopSignIn.browser",
              "Finish signing in in your browser, then come back here.",
            )}
          </p>
        )}
      </Stack>
      <SectionDivider spacing={0} />
      <form onSubmit={submit}>
        <Stack gap="3">
          <FormField
            label={t("portal.accountLink.desktopSignIn.email", "Email")}
          >
            <Input
              type="email"
              autoComplete="email"
              value={email}
              disabled={waiting}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </FormField>
          <FormField
            label={t("portal.accountLink.desktopSignIn.password", "Password")}
          >
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={waiting}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </FormField>
          <Button
            type="submit"
            variant="primary"
            loading={stage === "password"}
            disabled={!canSubmit}
          >
            {t("portal.accountLink.desktopSignIn.submit", "Sign in")}
          </Button>
        </Stack>
      </form>
      {error && <Banner tone="danger">{error}</Banner>}
    </Stack>
  );
}
