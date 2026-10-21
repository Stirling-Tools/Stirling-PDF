import { useTranslation } from "react-i18next";
import {
  FieldGroup,
  TextField,
  type SetupStepProps,
} from "@app/components/serverSetup/SetupFields";

export function PasswordStep({
  draft,
  update,
  errors,
  usingDefaultCredentials,
}: SetupStepProps) {
  const { t } = useTranslation();
  return (
    <>
      <FieldGroup>
        <TextField
          required
          autoComplete="username"
          label={t("serverSetup.account.username", "Username")}
          info={t(
            "serverSetup.account.usernameHelp",
            "What you'll sign in with. An email address works too.",
          )}
          value={draft.adminUsername}
          onChange={(adminUsername) => update({ adminUsername })}
          error={errors.adminUsername}
        />
        {(!usingDefaultCredentials || errors.currentPassword) && (
          <TextField
            required
            type="password"
            autoComplete="current-password"
            label={t("serverSetup.password.current", "Current password")}
            value={draft.currentPassword}
            onChange={(currentPassword) => update({ currentPassword })}
            error={errors.currentPassword}
          />
        )}
        <TextField
          required
          type="password"
          autoComplete="new-password"
          label={t("serverSetup.password.new", "New password")}
          value={draft.newPassword}
          onChange={(newPassword) => update({ newPassword })}
          error={errors.newPassword}
        />
        <TextField
          required
          type="password"
          autoComplete="new-password"
          label={t("serverSetup.password.confirm", "Confirm new password")}
          value={draft.confirmPassword}
          onChange={(confirmPassword) => update({ confirmPassword })}
          error={errors.confirmPassword}
        />
      </FieldGroup>
    </>
  );
}
