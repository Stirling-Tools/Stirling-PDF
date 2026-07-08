import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Skeleton } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  changeMemberRole,
  disableMemberMfa,
  fetchAuthConfig,
  fetchUsers,
  removeMember,
  setMemberSuspended,
  unlockMember,
  type AdminAuthConfig,
  type Member,
  type PortalAccessState,
  type RoleId,
  type UsersResponse,
} from "@portal/api/users";
import {
  createGrant,
  fetchGrants,
  revokeGrant,
  type ResourceGrant,
} from "@portal/api/access";
import {
  deleteTeam as apiDeleteTeam,
  fetchTeams,
  type Team,
} from "@portal/api/teams";
import { errorMessage } from "@portal/api/http";
import { usersCapabilities as caps } from "@app/portal/usersCapabilities";
import { UsersDirectory } from "@portal/components/users/UsersDirectory";
import { InviteMemberModal } from "@portal/components/users/InviteMemberModal";
import { NewTeamModal } from "@portal/components/users/NewTeamModal";
import { ResetPasswordModal } from "@portal/components/users/ResetPasswordModal";
import { MoveToTeamModal } from "@portal/components/users/MoveToTeamModal";
import { RenameTeamModal } from "@portal/components/users/RenameTeamModal";
import { ConfirmModal } from "@portal/components/users/ConfirmModal";
import type { TeamGroup } from "@portal/components/users/directory";

interface Confirm {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => Promise<unknown>;
}

export function Users() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [refreshKey, setRefreshKey] = useState(0);

  const usersState = useAsync<UsersResponse>(
    () => fetchUsers(tier),
    [tier, refreshKey],
  );
  // Grants are ADMIN-only; skip the fetch entirely on flavors that can't manage them.
  const grantsState = useAsync<ResourceGrant[]>(
    () => (caps.manageGrants ? fetchGrants("PORTAL") : Promise.resolve([])),
    [tier, refreshKey],
  );
  const teamsState = useAsync<Team[]>(() => fetchTeams(), [tier, refreshKey]);
  const authState = useAsync<AdminAuthConfig>(() => fetchAuthConfig(), []);

  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState<number | null>(null);
  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [resetPwMember, setResetPwMember] = useState<Member | null>(null);
  const [moveMember, setMoveMember] = useState<Member | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("invite") === null) return;
    setInviteOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("invite");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // PORTAL grants held by a whole team (principalId = teamId); members inherit these.
  const grantByTeam = useMemo(() => {
    const m = new Map<number, ResourceGrant>();
    for (const g of grantsState.data ?? []) {
      if (g.principalType === "TEAM") m.set(g.principalId, g);
    }
    return m;
  }, [grantsState.data]);

  const members = useMemo<Member[]>(() => {
    const grantByUser = new Map<string, ResourceGrant>();
    for (const g of grantsState.data ?? []) {
      if (g.principalType === "USER") grantByUser.set(String(g.principalId), g);
    }
    return (usersState.data?.members ?? []).map((raw) => {
      // Enforce the no-ROLE_ADMIN-on-SaaS rule: clamp any stray admin to member.
      const m: Member =
        !caps.adminRole && raw.role === "admin"
          ? { ...raw, role: "member" }
          : raw;
      // Presence is the server's authoritative decision (roster DTO's portalAccess, the same
      // canAccessPortal /me uses), so a stricter/looser default policy can't drift. The grant
      // maps only pick the display sub-state: which source, and whether the chip is removable.
      let portalAccess: PortalAccessState;
      let portalGrantId: number | undefined;
      if (!m.canAccessPortal) portalAccess = "none";
      else if (m.role === "admin") portalAccess = "admin";
      else if (grantByUser.has(m.id)) {
        portalAccess = "granted"; // a per-user grant is the removable source
        portalGrantId = grantByUser.get(m.id)!.id;
      } else if (m.teamId != null && grantByTeam.has(m.teamId))
        portalAccess = "team";
      else portalAccess = "role"; // access via the default policy (e.g. team lead)
      return { ...m, portalAccess, portalGrantId };
    });
  }, [usersState.data?.members, grantsState.data, grantByTeam]);

  const processorTeamIds = useMemo(
    () => new Set(grantByTeam.keys()),
    [grantByTeam],
  );

  const teams = teamsState.data ?? [];
  const mailEnabled = usersState.data?.mailEnabled ?? false;
  const loading = usersState.loading && usersState.data === null;
  const loadError = !usersState.loading && usersState.error !== null;
  const isEmpty = !usersState.loading && !loadError && members.length === 0;

  function run(action: () => Promise<unknown>) {
    setActionError(null);
    action()
      .catch((error) => setActionError(errorMessage(error)))
      // Refetch on success AND failure: a multi-step mutation (e.g. changeMemberRole)
      // has no rollback, so a mid-sequence failure must resync the roster to real state.
      .finally(() => setRefreshKey((k) => k + 1));
  }
  const refresh = () => setRefreshKey((k) => k + 1);

  function changeRole(member: Member, role: RoleId) {
    run(() => changeMemberRole(member, role));
  }
  function grantProcessor(member: Member) {
    run(() =>
      createGrant({
        resourceType: "PORTAL",
        resourceId: "",
        principalType: "USER",
        principalId: Number(member.id),
        permission: "USE",
      }),
    );
  }
  function revokeProcessor(member: Member) {
    if (!member.portalGrantId) return;
    run(() => revokeGrant(member.portalGrantId!));
  }
  // Grant/revoke Processor for a whole team (a TEAM-principal PORTAL grant).
  function grantTeamProcessor(team: TeamGroup) {
    run(() =>
      createGrant({
        resourceType: "PORTAL",
        resourceId: "",
        principalType: "TEAM",
        principalId: team.id,
        permission: "USE",
      }),
    );
  }
  function revokeTeamProcessor(team: TeamGroup) {
    const grant = grantByTeam.get(team.id);
    if (!grant) return;
    run(() => revokeGrant(grant.id));
  }
  function openInvite(teamId: number | null) {
    setInviteTeamId(teamId);
    setInviteOpen(true);
  }

  // Kebab actions
  function toggleEnabled(member: Member) {
    run(() => setMemberSuspended(member, member.status !== "suspended"));
  }
  function unlock(member: Member) {
    run(() => unlockMember(member));
  }
  function disableMfa(member: Member) {
    setConfirm({
      title: t("users.confirm.disableMfaTitle", "Reset MFA"),
      body: t(
        "users.confirm.disableMfaBody",
        "Remove {{name}}'s MFA enrolment? They'll set it up again on next login if required.",
        { name: member.name },
      ),
      confirmLabel: t("users.action.disableMfa", "Reset MFA"),
      action: () => disableMemberMfa(member),
    });
  }
  function removeUser(member: Member) {
    setConfirm({
      title: t("users.confirm.removeTitle", "Remove member"),
      body: t(
        "users.confirm.removeBody",
        "Permanently remove {{name}} from the organization? This cannot be undone.",
        { name: member.name },
      ),
      confirmLabel: t("users.action.remove", "Remove from org"),
      danger: true,
      action: () => removeMember(member),
    });
  }
  function deleteTeamAction(team: TeamGroup) {
    setConfirm({
      title: t("users.confirm.deleteTeamTitle", "Delete team"),
      body: t(
        "users.confirm.deleteTeamBody",
        "Delete the {{name}} team? The team must be empty first - move its members to another team, and it can't still own any integration configs.",
        { name: team.name },
      ),
      confirmLabel: t("users.action.deleteTeam", "Delete team"),
      danger: true,
      action: () => apiDeleteTeam(team.id),
    });
  }

  return (
    <div className="portal-users">
      <header className="portal-users__head">
        <div>
          <h1 className="portal-users__title">{t("users.title", "Users")}</h1>
          <p className="portal-users__sub">
            {t("users.subtitle2", "Your people, teams, and access levels.")}{" "}
            <a className="portal-users__link" href="/docs">
              {t("users.learnMore", "Learn more about roles and access.")}
            </a>
          </p>
        </div>
        <div className="portal-users__head-actions">
          {caps.createTeam && (
            <Button variant="secondary" onClick={() => setNewTeamOpen(true)}>
              {t("users.newTeam.action", "+ New team")}
            </Button>
          )}
          <Button onClick={() => openInvite(null)}>
            {t("users.invite.action", "Invite people")}
          </Button>
        </div>
      </header>

      {actionError && (
        <p className="portal-users__error" role="alert">
          {actionError}
        </p>
      )}

      {loading && (
        <div className="portal-users__table-skeleton" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3.25rem" />
          ))}
        </div>
      )}

      {loadError && (
        <EmptyState
          title={t("users.loadError.title", "Couldn't load members")}
          description={t(
            "users.loadError.description",
            "Something went wrong reaching the backend, or you don't have access. Try again.",
          )}
          actions={
            <Button variant="secondary" onClick={refresh}>
              {t("common.retry", "Retry")}
            </Button>
          }
        />
      )}

      {isEmpty && (
        <EmptyState
          title={t("users.empty.title", "No members yet")}
          description={t(
            "users.empty.description",
            "Invite your team to start collaborating.",
          )}
          actions={
            <Button onClick={() => openInvite(null)}>
              {t("users.invite.action", "Invite people")}
            </Button>
          }
        />
      )}

      {!loading && members.length > 0 && (
        <UsersDirectory
          members={members}
          teams={teams}
          capabilities={caps}
          onChangeRole={changeRole}
          onGrantProcessor={grantProcessor}
          onRevokeProcessor={revokeProcessor}
          processorTeamIds={processorTeamIds}
          onGrantTeamProcessor={grantTeamProcessor}
          onRevokeTeamProcessor={revokeTeamProcessor}
          onAddToTeam={(team) => openInvite(team.id)}
          onResetPassword={setResetPwMember}
          onMoveToTeam={setMoveMember}
          onToggleEnabled={toggleEnabled}
          onUnlock={unlock}
          onDisableMfa={disableMfa}
          onRemove={removeUser}
          onRenameTeam={(team) =>
            setRenameTarget({ id: team.id, name: team.name })
          }
          onDeleteTeam={deleteTeamAction}
        />
      )}

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={refresh}
        teams={teams}
        defaultTeamId={inviteTeamId}
        canDirectCreate={caps.directCreate && authState.data?.canDirectCreate}
        hasOauth={authState.data?.hasOauth}
        hasSaml={authState.data?.hasSaml}
        adminRole={caps.adminRole}
        manageGrants={caps.manageGrants}
        onNotice={setActionError}
      />
      <NewTeamModal
        open={newTeamOpen}
        onClose={() => setNewTeamOpen(false)}
        onCreated={refresh}
      />
      <ResetPasswordModal
        open={resetPwMember !== null}
        member={resetPwMember}
        mailEnabled={mailEnabled}
        onClose={() => setResetPwMember(null)}
        onDone={refresh}
      />
      <MoveToTeamModal
        open={moveMember !== null}
        member={moveMember}
        teams={teams}
        onClose={() => setMoveMember(null)}
        onDone={refresh}
      />
      <RenameTeamModal
        open={renameTarget !== null}
        teamId={renameTarget?.id ?? null}
        currentName={renameTarget?.name ?? ""}
        onClose={() => setRenameTarget(null)}
        onDone={refresh}
      />
      <ConfirmModal
        open={confirm !== null}
        title={confirm?.title ?? ""}
        body={confirm?.body ?? ""}
        confirmLabel={confirm?.confirmLabel ?? t("common.confirm", "Confirm")}
        danger={confirm?.danger}
        onConfirm={() => {
          if (confirm) run(confirm.action);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
