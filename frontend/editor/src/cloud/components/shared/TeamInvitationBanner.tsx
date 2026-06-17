import { useState } from "react";
import { Button, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { InfoBanner } from "@app/components/shared/InfoBanner";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";

/**
 * SaaS-web team invitation banner. Shown at the top of the app when the
 * signed-in user has a pending invitation to join a team.
 *
 * Ported from the desktop banner, with two differences: there is no
 * {@code connectionMode} gate (web is always SaaS), and there is no explicit
 * billing refresh — {@link useSaaSTeam.acceptInvitation} already refreshes
 * credits and the session after the team membership changes.
 */
export function TeamInvitationBanner() {
  const { t } = useTranslation();
  const { receivedInvitations, acceptInvitation, rejectInvitation } =
    useSaaSTeam();

  const [processing, setProcessing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const invitation = receivedInvitations[0]; // Show first invitation

  const handleAccept = async () => {
    if (!invitation) return;
    setProcessing(true);
    try {
      await acceptInvitation(invitation.invitationToken);
      setDismissed(true);
    } catch (error) {
      console.error(
        "[TeamInvitationBanner] Failed to accept invitation:",
        error,
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!invitation) return;
    setProcessing(true);
    try {
      await rejectInvitation(invitation.invitationToken);
      setDismissed(true);
    } catch (error) {
      console.error(
        "[TeamInvitationBanner] Failed to reject invitation:",
        error,
      );
    } finally {
      setProcessing(false);
    }
  };

  const shouldShow = !dismissed && receivedInvitations.length > 0;
  if (!shouldShow) return null;

  const message = (
    <Text
      component="span"
      size="sm"
      fw={500}
      style={{ color: "rgba(255, 255, 255, 0.95)" }}
    >
      <strong>{invitation.inviterEmail}</strong>{" "}
      {t("team.invitationBanner.message", "has invited you to join")}{" "}
      <strong>{invitation.teamName}</strong>
    </Text>
  );

  const actionButtons = (
    <Group gap="xs" wrap="nowrap">
      <Button
        variant="white"
        color="gray"
        size="xs"
        onClick={handleAccept}
        loading={processing}
        leftSection={
          <LocalIcon
            icon="check"
            width="0.9rem"
            height="0.9rem"
            style={{ color: "var(--mantine-color-dark-9)" }}
          />
        }
        styles={{
          label: {
            color: "var(--mantine-color-dark-9)",
          },
        }}
      >
        {t("team.invitationBanner.acceptButton", "Accept")}
      </Button>
      <Button
        variant="subtle"
        size="xs"
        onClick={handleReject}
        loading={processing}
        style={{ color: "rgba(255, 255, 255, 0.7)" }}
      >
        {t("team.invitationBanner.rejectButton", "Decline")}
      </Button>
    </Group>
  );

  return (
    <InfoBanner
      icon="mail"
      message={
        <Group
          justify="space-between"
          align="center"
          wrap="nowrap"
          style={{ width: "100%" }}
        >
          {message}
          {actionButtons}
        </Group>
      }
      show={shouldShow}
      dismissible={false}
      background="var(--mantine-color-dark-7)"
      borderColor="var(--mantine-color-dark-5)"
      textColor="rgba(255, 255, 255, 0.95)"
      iconColor="rgba(255, 255, 255, 0.95)"
    />
  );
}
