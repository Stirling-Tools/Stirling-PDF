import type { ComponentProps } from "react";
import { Stack } from "@mantine/core";
import GeneralSection from "@app/components/shared/config/configSections/GeneralSection";
import { LoginLandingSetting } from "@app/components/shared/config/LoginLandingSetting";

type GeneralSectionProps = ComponentProps<typeof GeneralSection>;

/**
 * Core General settings plus the shared login-landing control. Used by every
 * flavor's config nav so the setting is not duplicated per flavor.
 */
export default function GeneralWithLoginLanding(props: GeneralSectionProps) {
  return (
    <Stack gap="lg">
      <GeneralSection {...props} />
      <LoginLandingSetting />
    </Stack>
  );
}
