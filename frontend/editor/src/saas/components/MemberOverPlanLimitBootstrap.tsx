import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import { useAuth } from "@app/auth/UseSession";
import apiClient from "@app/services/apiClient";
import {
  onMemberOverPlanLimit,
  type MemberOverPlanLimit,
} from "@app/services/memberOverPlanLimit";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";
import "@app/components/MemberOverPlanLimitBootstrap.css";

/**
 * The screen a member sees once their team's plan no longer covers them. It cannot be dismissed:
 * every request would fail behind it. Leaving the team is the way out the backend still allows; it
 * returns the member to their own free workspace.
 */
export default function MemberOverPlanLimitBootstrap() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [detail, setDetail] = useState<MemberOverPlanLimit | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);

  useEffect(
    () => onMemberOverPlanLimit((next) => setDetail((cur) => cur ?? next)),
    [],
  );

  async function leave() {
    if (!detail) return;
    setLeaving(true);
    setLeaveFailed(false);
    try {
      await apiClient.post(`/api/v1/team/${detail.teamId}/leave`);
      window.location.reload();
    } catch {
      setLeaveFailed(true);
      setLeaving(false);
    }
  }

  const title = t("memberOverPlanLimit.title", "Your account is disabled");
  return (
    <Modal
      open={detail !== null}
      onClose={() => {}}
      ariaLabel={title}
      width="sm"
      disableBackdropClose
      disableEscapeClose
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
    >
      {detail && (
        <div className="member-over-limit">
          <h2 className="member-over-limit__title">{title}</h2>
          <p>
            {detail.teamName
              ? t(
                  "memberOverPlanLimit.body",
                  "{{team}}'s plan doesn't cover your account right now. Ask a team leader to renew the plan or make your account active.",
                  { team: detail.teamName },
                )
              : t(
                  "memberOverPlanLimit.bodyNoName",
                  "Your team's plan doesn't cover your account right now. Ask a team leader to renew the plan or make your account active.",
                )}
          </p>
          {detail.leaders.length > 0 && (
            <div className="member-over-limit__leaders">
              <span className="member-over-limit__label">
                {t("memberOverPlanLimit.leaders", "Team leaders")}
              </span>
              <ul>
                {detail.leaders.map((email) => (
                  <li key={email}>
                    <a href={`mailto:${email}`}>{email}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="member-over-limit__muted">
            {t(
              "memberOverPlanLimit.kept",
              "Your files and settings are kept. Leaving the team takes you back to your own free workspace.",
            )}
          </p>
          {leaveFailed && (
            <Banner
              tone="danger"
              title={t(
                "memberOverPlanLimit.leaveFailed",
                "Couldn't leave the team. Please try again.",
              )}
            />
          )}
          <div className="member-over-limit__actions">
            <Button variant="secondary" onClick={() => void signOut()}>
              {t("memberOverPlanLimit.signOut", "Sign out")}
            </Button>
            <Button onClick={leave} loading={leaving}>
              {t("memberOverPlanLimit.leave", "Leave team")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
