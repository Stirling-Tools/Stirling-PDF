import { lazy, type ComponentProps } from "react";
import { Stack } from "@mantine/core";
import { LoginLandingSetting } from "@app/components/shared/config/LoginLandingSetting";

const GeneralSection = lazy(
  () => import("@app/components/shared/config/configSections/GeneralSection"),
);

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
