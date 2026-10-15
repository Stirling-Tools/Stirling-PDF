import { useTranslation } from "react-i18next";
import {
  FieldGroup,
  TextField,
  type SetupStepProps,
} from "@app/components/serverSetup/SetupFields";

export function AddressesStep({ draft, update, errors }: SetupStepProps) {
  const { t } = useTranslation();
  return (
    <>
      <FieldGroup>
        <TextField
          required
          type="url"
          label={t("serverSetup.addresses.frontendUrl", "Web address")}
          info={t(
            "serverSetup.addresses.frontendUrlHelp",
            "Where people open Stirling PDF. Used in emails, share links and QR codes.",
          )}
          placeholder="https://pdf.example.com"
          value={draft.frontendUrl}
          onChange={(frontendUrl) => update({ frontendUrl })}
          error={errors.frontendUrl}
        />
        <TextField
          required
          type="url"
          label={t("serverSetup.addresses.backendUrl", "Server address")}
          info={t(
            "serverSetup.addresses.backendUrlHelp",
            "Where sign-in providers send people back. Usually the same as the web address.",
          )}
          placeholder="https://pdf.example.com"
          value={draft.backendUrl}
          onChange={(backendUrl) => update({ backendUrl })}
          error={errors.backendUrl}
        />
      </FieldGroup>
    </>
  );
}
