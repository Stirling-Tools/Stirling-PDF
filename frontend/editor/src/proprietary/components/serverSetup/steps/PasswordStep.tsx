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
