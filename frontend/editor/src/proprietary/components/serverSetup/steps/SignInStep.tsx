import { useTranslation } from "react-i18next";
import { Select } from "@app/ui/Select";
import {
  sectionToggle,
  SETUP_DROPDOWN,
  SettingRow,
  TextField,
  type SetupStepProps,
} from "@app/components/serverSetup/SetupFields";
import {
  loginChange,
  loginNeedsIssuer,
  oauthRedirectUri,
  type LoginMethod,
} from "@app/components/serverSetup/serverSetupDraft";
import styles from "@app/components/shared/setupCard/SetupCard.module.css";

export function SignInStep(props: SetupStepProps) {
  const { draft, update, errors, setOpenSection } = props;
  const { t } = useTranslation();
  const methods: { value: LoginMethod; label: string }[] = [
    {
      value: "password",
      label: t("serverSetup.signIn.password", "Username and password"),
    },
    { value: "google", label: "Google" },
    { value: "github", label: "GitHub" },
    { value: "keycloak", label: "Keycloak" },
    {
      value: "oidc",
      label: t("serverSetup.signIn.oidc", "Other OpenID Connect"),
    },
  ];
  const oauth = draft.login !== "password";

  return (
    <>
      <SettingRow
        label={t("serverSetup.signIn.label", "Sign in with")}
        expand={oauth ? sectionToggle(props, "signIn") : undefined}
        details={
          oauth && (
            <>
              {draft.login === "oidc" && (
                <TextField
                  required
                  label={t("serverSetup.signIn.providerName", "Provider name")}
                  info={t(
                    "serverSetup.signIn.providerNameHelp",
                    "Shown on the sign-in button, for example okta or entra.",
                  )}
                  value={draft.oauthProviderName}
                  onChange={(oauthProviderName) =>
                    update({ oauthProviderName })
                  }
                  error={errors.oauthProviderName}
                />
              )}
              {loginNeedsIssuer(draft.login) && (
                <TextField
                  required
                  type="url"
                  label={t("serverSetup.signIn.issuer", "Issuer URL")}
                  placeholder="https://id.example.com/realms/main"
                  value={draft.oauthIssuer}
                  onChange={(oauthIssuer) => update({ oauthIssuer })}
                  error={errors.oauthIssuer}
                />
              )}
              <TextField
                required
                label={t("serverSetup.signIn.clientId", "Client ID")}
                value={draft.oauthClientId}
                onChange={(oauthClientId) => update({ oauthClientId })}
                error={errors.oauthClientId}
              />
              <TextField
                required
                type="password"
                label={t("serverSetup.signIn.clientSecret", "Client secret")}
                value={draft.oauthClientSecret}
                onChange={(oauthClientSecret) => update({ oauthClientSecret })}
                error={errors.oauthClientSecret}
              />
              <p className={styles.hint}>
                {t(
                  "serverSetup.signIn.redirectNote",
                  "Add this redirect URI in your provider:",
                )}{" "}
                <code
                  className={`${styles.inlineCode} ${styles.inlineCodeWrap}`}
                >
                  {oauthRedirectUri(draft)}
                </code>
              </p>
            </>
          )
        }
      >
        {(labelId) => (
          <Select
            comboboxProps={SETUP_DROPDOWN}
            aria-labelledby={labelId}
            options={methods}
            value={draft.login}
            onChange={(value) => {
              if (!value) return;
              update(loginChange(value as LoginMethod, props.initial));
              if (value !== "password") setOpenSection("signIn");
            }}
          />
        )}
      </SettingRow>
    </>
  );
}
