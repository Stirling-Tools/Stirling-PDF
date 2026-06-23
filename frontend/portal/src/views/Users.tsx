import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Skeleton } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchUsers,
  type Member,
  type RoleId,
  type UsersResponse,
} from "@portal/api/users";
import { UsersSummaryStrip } from "@portal/components/users/UsersSummaryStrip";
import { MembersTable } from "@portal/components/users/MembersTable";
import { RolesGrid } from "@portal/components/users/RolesGrid";
import { AccessControls } from "@portal/components/users/AccessControls";
import { InviteMemberModal } from "@portal/components/users/InviteMemberModal";
import "@portal/views/Users.css";

export function Users() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<UsersResponse>(() => fetchUsers(tier), [tier]);
  const { data, loading } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const [inviteOpen, setInviteOpen] = useState(false);

  const members = data?.members ?? [];

  // Row actions are non-functional shells until the backend exists; each logs
  // the intended request so the wiring point is obvious.
  function changeRole(member: Member, role: RoleId) {
    // TODO(backend): PATCH /v1/users/{id} { role }
    void member;
    void role;
  }
  function suspend(member: Member) {
    // TODO(backend): PATCH /v1/users/{id} { status: "suspended" }
    void member;
  }
  function remove(member: Member) {
    // TODO(backend): DELETE /v1/users/{id}
    void member;
  }

  return (
    <div className="portal-users">
      <header className="portal-users__head">
        <div>
          <h1 className="portal-users__title">{t("users.title")}</h1>
          <p className="portal-users__sub">{t("users.subtitle")}</p>
        </div>
        <Button
          onClick={() => setInviteOpen(true)}
          leadingIcon={<span aria-hidden>+</span>}
        >
          {t("common.inviteMember")}
        </Button>
      </header>

      <UsersSummaryStrip data={data} loading={loading} />

      {isLoading && (
        <div className="portal-users__table-skeleton" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title={t("users.empty.title")}
          description={t("users.empty.description")}
          actions={
            <Button onClick={() => setInviteOpen(true)}>
              {t("common.inviteMember")}
            </Button>
          }
        />
      )}

      {!isLoading && !isEmpty && members.length > 0 && (
        <MembersTable
          members={members}
          onChangeRole={changeRole}
          onSuspend={suspend}
          onRemove={remove}
        />
      )}

      {data && <RolesGrid roles={data.roles} />}
      {data && <AccessControls access={data.access} />}

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
}
