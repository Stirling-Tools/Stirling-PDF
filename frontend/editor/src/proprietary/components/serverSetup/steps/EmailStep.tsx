import { useTranslation } from "react-i18next";
import {
  OnOffControl,
  sectionToggle,
  SettingRow,
  TextField,
  type SetupStepProps,
} from "@app/components/serverSetup/SetupFields";

export function EmailStep(props: SetupStepProps) {
  const { draft, update, errors, setOpenSection } = props;
  const { t } = useTranslation();
  const label = t("serverSetup.email.label", "Send email");
  return (
    <>
      <SettingRow
        label={label}
        expand={draft.emailEnabled ? sectionToggle(props, "email") : undefined}
        details={
          <>
            <TextField
              required
              label={t("serverSetup.email.host", "SMTP host")}
              placeholder="smtp.example.com"
              value={draft.smtpHost}
              onChange={(smtpHost) => update({ smtpHost })}
              error={errors.smtpHost}
            />
            <TextField
              required
              label={t("serverSetup.email.port", "Port")}
              placeholder="587"
              value={draft.smtpPort}
              onChange={(smtpPort) => update({ smtpPort })}
              error={errors.smtpPort}
            />
            <TextField
              label={t("serverSetup.email.username", "Username")}
              value={draft.smtpUsername}
              onChange={(smtpUsername) => update({ smtpUsername })}
            />
            <TextField
              type="password"
              label={t("serverSetup.email.password", "Password")}
              value={draft.smtpPassword}
              onChange={(smtpPassword) => update({ smtpPassword })}
            />
            <TextField
              required
              type="email"
              label={t("serverSetup.email.from", "From address")}
              placeholder="pdf@example.com"
              value={draft.smtpFrom}
              onChange={(smtpFrom) => update({ smtpFrom })}
              error={errors.smtpFrom}
            />
          </>
        }
      >
        {() => (
          <OnOffControl
            ariaLabel={label}
            value={draft.emailEnabled}
            onChange={(emailEnabled) => {
              update({ emailEnabled });
              if (emailEnabled) setOpenSection("email");
            }}
          />
        )}
      </SettingRow>
    </>
  );
}
