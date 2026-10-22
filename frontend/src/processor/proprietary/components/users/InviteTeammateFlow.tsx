import { useTranslation } from "react-i18next";
import { Button, Modal } from "@app/ui";
import { InviteMemberModal } from "@portal/components/users/InviteMemberModal";
import { PortalRosterHost } from "@portal/components/settings/PortalRosterHost";
import { useUsersData } from "@portal/views/usersData";
import { usersCapabilities as caps } from "@app/portal/usersCapabilities";

interface InviteTeammateFlowProps {
  initialValue: string;
  onClose: () => void;
  onInvited: () => void;
}

/** Requires roster providers; only offers methods permitted by the loaded account and server. */
export function InviteTeammateForm({
  initialValue,
  onClose,
  onInvited,
}: InviteTeammateFlowProps) {
  const { t } = useTranslation();
  const { usersState, teamsState, authState, refresh } = useUsersData();
  const loading = usersState.loading || teamsState.loading || authState.loading;
  const error = usersState.error || teamsState.error || authState.error;
  const viewer = usersState.data?.members.find((member) => member.isSelf);
  const canManage =
    viewer?.role === "admin" ||
    (!caps.listingRequiresAdmin && viewer?.teamLead === true);
  const canDirectCreate =
    canManage && caps.directCreate && authState.data?.canDirectCreate === true;
  const canEmailInvite =
    canManage &&
    caps.emailInvite &&
    (!caps.directCreate || usersState.data?.emailInvitesEnabled === true);
  const summary = usersState.data?.summary;
  const seatsFull =
    summary?.seatLimit != null && summary.seatsUsed >= summary.seatLimit;

  if (loading || error || (!canDirectCreate && !canEmailInvite) || seatsFull) {
    return (
      <Modal
        open
        onClose={onClose}
        title={t("signWorkspace.inviteTeammate", "Add a teammate")}
      >
        {loading ? (
          <p role="status">{t("common.loading", "Loading...")}</p>
        ) : (
          <p role="alert">
            {error
              ? t(
                  "signWorkspace.inviteLoadError",
                  "Could not load invitation options. Close this dialog and try again.",
                )
              : seatsFull
                ? t(
                    "users.seats.full",
                    "Every licensed seat is in use. Free one up, or raise the seat count, to add anyone else.",
                  )
                : t(
                    "signWorkspace.inviteUnavailable",
                    "Adding teammates is not available for your account or server configuration.",
                  )}
          </p>
        )}
        <Button variant="secondary" onClick={onClose}>
          {t("common.close", "Close")}
        </Button>
      </Modal>
    );
  }

  return (
    <InviteMemberModal
      open
      onClose={onClose}
      onInvited={() => {
        refresh();
        onInvited();
      }}
      initialValue={initialValue}
      teams={teamsState.data ?? []}
      defaultTeamId={viewer?.teamId}
      canDirectCreate={canDirectCreate}
      canEmailInvite={canEmailInvite}
      hasOauth={authState.data?.hasOauth}
      hasSaml={authState.data?.hasSaml}
      adminRole={caps.adminRole}
    />
  );
}

/** Reuses the roster's deployment adapters without navigating away from the request. */
export default function InviteTeammateFlow(props: InviteTeammateFlowProps) {
  return (
    <PortalRosterHost>
      <InviteTeammateForm {...props} />
    </PortalRosterHost>
  );
}
