import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InviteTeammateButtonProps } from "@core/components/shared/InviteTeammateButton";
import { useAuth } from "@app/auth/UseSession";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";
import { Button, Modal } from "@app/ui";
import { Icon } from "@app/ui/Icon";

const InviteTeammateFlow = lazy(
  () => import("@portal/components/users/InviteTeammateFlow"),
);

/** Keeps the signing draft mounted while the deployment's account flow is open. */
export function InviteTeammateButton({
  search,
  disabled,
  onInvited,
}: InviteTeammateButtonProps) {
  const { t } = useTranslation();
  const { isAdmin, isAnonymous, loading } = useAuth();
  const { isTeamLeader } = useSaaSTeam();
  const [inviteValue, setInviteValue] = useState<string | null>(null);
  if (loading || isAnonymous || (!isAdmin && !isTeamLeader)) return null;

  const close = () => setInviteValue(null);
  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        overflow="wrap"
        disabled={disabled}
        leftSection={<Icon name="user-plus" size={18} />}
        onClick={() => setInviteValue(search.trim())}
      >
        {search.trim()
          ? t("signWorkspace.invitePerson", "Add teammate: {{name}}", {
              name: search.trim(),
            })
          : t("signWorkspace.inviteTeammate", "Add a teammate")}
      </Button>
      {inviteValue !== null && (
        <Suspense
          fallback={
            <Modal
              open
              onClose={close}
              title={t("signWorkspace.inviteTeammate", "Add a teammate")}
            >
              <p role="status">{t("common.loading", "Loading...")}</p>
            </Modal>
          }
        >
          <InviteTeammateFlow
            initialValue={inviteValue}
            onClose={close}
            onInvited={onInvited}
          />
        </Suspense>
      )}
    </>
  );
}
