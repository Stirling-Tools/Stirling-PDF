import { Stack } from "@mantine/core";
import GeneralSection from "@app/components/shared/config/configSections/GeneralSection";
import { SaasLoginLandingSetting } from "@app/components/shared/config/SaasLoginLandingSetting";

/**
 * SaaS General settings: the shared General section (update checker + admin
 * banner suppressed, as before) plus the team-lead-only login-landing control.
 */
export default function SaasGeneralSection() {
  return (
    <Stack gap="lg">
      <GeneralSection hideUpdateSection hideAdminBanner />
      <SaasLoginLandingSetting />
    </Stack>
  );
}
