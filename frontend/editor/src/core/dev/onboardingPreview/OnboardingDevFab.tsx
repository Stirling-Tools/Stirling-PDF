import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Affix, Paper, Stack, Group, Text } from "@mantine/core";
import { Button } from "@app/ui";
import { ActionIcon } from "@app/ui/ActionIcon";
import LocalIcon from "@app/components/shared/LocalIcon";
import { requestStartTour } from "@app/constants/events";
import { resetOnboardingProgress } from "@app/components/onboarding/orchestrator/onboardingStorage";

const ENABLED = import.meta.env.VITE_DEV_ONBOARDING_PREVIEW === "true";

/**
 * Dev-only floating button for exercising onboarding paths inside the running
 * app — so the spotlight tours run against the real editor DOM (which the
 * standalone /dev/onboarding preview page can't do). Gated by
 * VITE_DEV_ONBOARDING_PREVIEW; renders nothing otherwise.
 */
export default function OnboardingDevFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (!ENABLED) return null;

  const replayOnboarding = () => {
    resetOnboardingProgress();
    window.location.reload();
  };

  return (
    <Affix position={{ bottom: 20, right: 20 }} zIndex={99999}>
      {open ? (
        <Paper withBorder shadow="md" radius="md" p="sm" style={{ width: 240 }}>
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text fw={500} size="sm">
                Onboarding (dev)
              </Text>
              <ActionIcon
                variant="tertiary"
                size="sm"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
              </ActionIcon>
            </Group>

            <Text size="xs" c="dimmed">
              Run a tour against the live app:
            </Text>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => requestStartTour("admin")}
            >
              Admin tour
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => requestStartTour("tools")}
            >
              User tour
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => requestStartTour("whatsnew")}
            >
              What's new tour
            </Button>

            <Button size="sm" variant="tertiary" onClick={replayOnboarding}>
              Replay onboarding (reload)
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => navigate("/dev/onboarding")}
            >
              Slide + tour preview page
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          leftSection={
            <LocalIcon icon="rocket-launch" width="1rem" height="1rem" />
          }
        >
          Onboarding
        </Button>
      )}
    </Affix>
  );
}
