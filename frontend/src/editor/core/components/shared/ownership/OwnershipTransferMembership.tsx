import { Trans, useTranslation } from "react-i18next";
import type { OwnershipTransferFlow } from "@app/components/shared/ownership/useOwnershipTransfer";
import { Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

/** Describes invitation readiness without implying that entering an email sends an invitation. */
export function OwnershipTransferMembership({
  flow,
}: {
  flow: OwnershipTransferFlow;
}) {
  const { t } = useTranslation();
  const {
    editing,
    emailValid,
    matchingMember,
    email,
    teamName,
    needsMember,
    invited,
    cloudEmail,
  } = flow;
  return (
    <>
      {editing && (
        <>
          {emailValid && !matchingMember ? (
            <p>
              <Trans
                t={t}
                i18nKey="ownership.inviteAddress"
                defaults="Invite <account>{{email}}</account> to {{team}}."
                values={{ email, team: teamName }}
                components={{
                  account: <strong className="ownership-flow__username" />,
                }}
              />
            </p>
          ) : (
            <p>
              {t(
                "ownership.chooseEmail",
                "Choose their account in {{team}}, or enter an email to invite them.",
                { team: teamName },
              )}
            </p>
          )}
          <p className="ownership-flow__muted">
            {t(
              "ownership.membershipFirst",
              "They must join the team before you can confirm the transfer.",
            )}
          </p>
        </>
      )}
      {needsMember && !editing && (
        <>
          {invited ? (
            <div role="status">
              <strong>
                {t("ownership.invitationSent", "Invitation sent")}
              </strong>
              <p>
                {t(
                  "ownership.waitingForEmail",
                  "Waiting for {{email}} to join {{team}}.",
                  { email: cloudEmail, team: teamName },
                )}
              </p>
            </div>
          ) : (
            <p>
              <Trans
                t={t}
                i18nKey="ownership.inviteAddress"
                defaults="Invite <account>{{email}}</account> to {{team}}."
                values={{ email: cloudEmail, team: teamName }}
                components={{
                  account: <strong className="ownership-flow__username" />,
                }}
              />
            </p>
          )}
          <p className="ownership-flow__muted">
            {t(
              "ownership.acceptInvite",
              "They can create an account or sign in, then accept the invitation.",
            )}
          </p>
        </>
      )}
      {(needsMember || (editing && emailValid && !matchingMember)) && (
        <div className="ownership-flow__detail">
          <span>{t("ownership.anotherTeam", "Already on another team?")}</span>
          <Tooltip
            multiline
            w={300}
            zIndex={Z_INDEX_OVER_CONFIG_MODAL + 2}
            events={{ hover: true, focus: true, touch: true }}
            label={t(
              "ownership.otherTeam",
              "If they belong to another team, accepting may move their account. A paid account or ownership of another team may need resolving first. We won't move their subscription or merge teams.",
            )}
          >
            <ActionIcon
              variant="quiet"
              size="sm"
              aria-label={t(
                "ownership.membershipDetails",
                "Team membership details",
              )}
            >
              <Icon name="info" size={16} />
            </ActionIcon>
          </Tooltip>
        </div>
      )}
    </>
  );
}
