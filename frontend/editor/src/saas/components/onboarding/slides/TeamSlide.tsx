import React, { useEffect, useState } from "react";
import { Badge, Button, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SlideConfig } from "@app/types/types";
import { createLightSlideBackground } from "@app/components/onboarding/slides/unifiedBackgroundConfig";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";
import styles from "@app/components/onboarding/slides/SaasOnboardingSlides.module.css";

const TEAM_BACKGROUND = createLightSlideBackground([79, 70, 229], "#E0E7FF");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function useHasTeamMembers(): boolean {
  const { teamMembers, teamInvitations } = useSaaSTeam();
  const pendingInvitations = teamInvitations.filter(
    (invitation) => invitation.status === "PENDING",
  );
  // The leader themselves is always in teamMembers, so "has a team" means
  // anyone beyond them, or an invite already on its way.
  return teamMembers.length > 1 || pendingInvitations.length > 0;
}

function TeamSlideTitle() {
  const { t } = useTranslation();
  const hasTeam = useHasTeamMembers();

  return hasTeam
    ? t("onboarding.saas.team.inviteTitle", "Invite members to your team")
    : t("onboarding.saas.team.createTitle", "Create your team");
}

function InviteForm() {
  const { t } = useTranslation();
  const { inviteUser } = useSaaSTeam();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const emailValid = EMAIL_PATTERN.test(email);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid) return;

    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      await inviteUser(email);
      setSuccess(
        t("team.inviteSent", "Invitation sent to {{email}}", { email }),
      );
      setEmail("");
    } catch (err) {
      const inviteError = err as { response?: { data?: { error?: string } } };
      setError(
        inviteError.response?.data?.error ||
          t("team.inviteError", "Failed to send invitation"),
      );
    } finally {
      setInviting(false);
    }
  };

  return (
    <form onSubmit={handleInvite}>
      <span className={styles.inviteRow}>
        <TextInput
          type="email"
          placeholder={t("team.invite.placeholder", "email@example.com")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={
            email && !emailValid
              ? t("team.invite.invalidEmail", "Invalid email format")
              : undefined
          }
        />
        <Button type="submit" loading={inviting} disabled={!emailValid}>
          {t("onboarding.saas.team.addButton", "Add")}
        </Button>
      </span>
      {error && (
        <span
          className={styles.inviteFeedback}
          style={{ color: "var(--mantine-color-red-6)", display: "block" }}
        >
          {error}
        </span>
      )}
      {success && (
        <span
          className={styles.inviteFeedback}
          style={{ color: "var(--mantine-color-green-7)", display: "block" }}
        >
          {success}
        </span>
      )}
    </form>
  );
}

const TeamSlideBody = () => {
  const { t } = useTranslation();
  const { teamMembers, teamInvitations, refreshTeams } = useSaaSTeam();
  const hasTeam = useHasTeamMembers();
  const pendingInvitations = teamInvitations.filter(
    (invitation) => invitation.status === "PENDING",
  );

  // Onboarding shows right after first login, so make sure team data is fresh.
  useEffect(() => {
    refreshTeams();
  }, []);

  return (
    <span>
      {hasTeam
        ? t(
            "onboarding.saas.team.inviteBody",
            "Everyone on your team shares files, automations and your plan. Add teammates by email and they'll get an invite.",
          )
        : t(
            "onboarding.saas.team.createBody",
            "Work on documents together: teammates share files, automations and your plan. Add the first member by email to create your team.",
          )}
      <span className={styles.teamCard} style={{ display: "block" }}>
        {hasTeam && (
          <span className={styles.memberList} style={{ display: "flex" }}>
            {teamMembers.map((member) => (
              <span
                key={`member-${member.id}`}
                className={styles.memberRow}
                style={{ display: "flex" }}
              >
                <span
                  className={styles.memberIdentity}
                  style={{ display: "flex" }}
                >
                  <span className={styles.memberName}>{member.username}</span>
                  <span className={styles.memberEmail}>{member.email}</span>
                </span>
                <Badge
                  size="sm"
                  color={member.role === "LEADER" ? "blue" : "gray"}
                  variant="light"
                >
                  {member.role}
                </Badge>
              </span>
            ))}
            {pendingInvitations.map((invitation) => (
              <span
                key={`invitation-${invitation.invitationId}`}
                className={styles.memberRow}
                style={{ display: "flex" }}
              >
                <span
                  className={styles.memberIdentity}
                  style={{ display: "flex" }}
                >
                  <span className={styles.memberName}>
                    {invitation.inviteeEmail.split("@")[0]}
                  </span>
                  <span className={styles.memberEmail}>
                    {invitation.inviteeEmail}
                  </span>
                </span>
                <Badge size="sm" color="yellow" variant="light">
                  {t("team.members.pending", "PENDING")}
                </Badge>
              </span>
            ))}
          </span>
        )}
        <InviteForm />
      </span>
    </span>
  );
};

export default function TeamSlide(): SlideConfig {
  return {
    key: "team",
    title: <TeamSlideTitle />,
    body: <TeamSlideBody />,
    background: TEAM_BACKGROUND,
  };
}
