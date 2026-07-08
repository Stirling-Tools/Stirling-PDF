import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, FormField, Input, Modal, Select } from "@app/ui";
import {
  createMember,
  fetchUsers,
  inviteMember,
  ROLE_LABEL,
  type AuthType,
} from "@portal/api/users";
import { createGrant } from "@portal/api/access";
import { errorMessage } from "@portal/api/http";
import type { Team } from "@portal/api/teams";
import { useTier } from "@portal/contexts/TierContext";
import "@portal/views/Users.css";

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  onInvited?: () => void;
  teams: Team[];
  defaultTeamId?: number | null;
  /** Self-hosted with password login: enables the "Create account" mode. */
  canDirectCreate?: boolean;
  hasOauth?: boolean;
  hasSaml?: boolean;
  /** Whether the "admin" (Org Owner) role can be assigned. Off on SaaS. */
  adminRole?: boolean;
  /** Which mode to open in (mainly for Storybook); defaults to email. */
  initialMode?: "email" | "direct";
}

type InviteRole = "member" | "admin";
type Mode = "email" | "direct";

const ROLE_SELECT_OPTIONS: { value: InviteRole; label: string }[] = [
  { value: "member", label: ROLE_LABEL.member },
  { value: "admin", label: ROLE_LABEL.admin },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMemberModal({
  open,
  onClose,
  onInvited,
  teams,
  defaultTeamId,
  canDirectCreate = false,
  hasOauth = false,
  hasSaml = false,
  adminRole = true,
  initialMode = "email",
}: InviteMemberModalProps) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authType, setAuthType] = useState<AuthType>("WEB");
  const [forceChange, setForceChange] = useState(true);
  const [forceMFA, setForceMFA] = useState(false);
  const [role, setRole] = useState<InviteRole>("member");
  const [teamId, setTeamId] = useState<string>("");
  const [processor, setProcessor] = useState(false);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(canDirectCreate ? initialMode : "email");
    setTeamId(
      defaultTeamId != null
        ? String(defaultTeamId)
        : teams.length > 0
          ? String(teams[0].id)
          : "",
    );
  }, [open, defaultTeamId, teams, canDirectCreate, initialMode]);

  // A server-side submit error must not outlive the input that caused it.
  useEffect(() => {
    setSubmitError(null);
  }, [email, username, password]);

  // Drop the "admin" (Org Owner) option where it can't be assigned (SaaS).
  const roleOptions = adminRole
    ? ROLE_SELECT_OPTIONS
    : ROLE_SELECT_OPTIONS.filter((o) => o.value !== "admin");

  const authTypeOptions: { value: AuthType; label: string }[] = [
    { value: "WEB", label: t("users.invite.authWeb", "Password") },
    ...(hasOauth
      ? [
          {
            value: "OAUTH2" as AuthType,
            label: t("users.invite.authOauth", "OAuth2 / SSO"),
          },
        ]
      : []),
    ...(hasSaml
      ? [
          {
            value: "SAML2" as AuthType,
            label: t("users.invite.authSaml", "SAML 2.0"),
          },
        ]
      : []),
  ];

  const emailValid = EMAIL_RE.test(email.trim());
  const usernameValid = username.trim().length >= 3;
  const needsPassword = mode === "direct" && authType === "WEB";
  const passwordValid = !needsPassword || password.length >= 8;

  const error =
    (touched && mode === "email" && !emailValid
      ? t("users.invite.emailError", "Enter a valid email address")
      : undefined) ??
    (touched && mode === "direct" && !usernameValid
      ? t(
          "users.invite.usernameError",
          "Username must be at least 3 characters",
        )
      : undefined) ??
    (touched && mode === "direct" && !passwordValid
      ? t(
          "users.invite.passwordError",
          "Password must be at least 8 characters",
        )
      : undefined) ??
    submitError ??
    undefined;

  function close() {
    onClose();
    setTimeout(() => {
      setEmail("");
      setUsername("");
      setPassword("");
      setAuthType("WEB");
      setForceChange(true);
      setForceMFA(false);
      setRole("member");
      setProcessor(false);
      setTouched(false);
      setSubmitError(null);
    }, 200);
  }

  // Grant Processor to the just-added user (best-effort: needs the new id).
  async function grantProcessor(
    match: (m: { email: string; username?: string }) => boolean,
  ) {
    const { members } = await fetchUsers(tier);
    const user = members.find(match);
    if (user)
      await createGrant({
        resourceType: "PORTAL",
        resourceId: "",
        principalType: "USER",
        principalId: Number(user.id),
        permission: "USE",
      });
  }

  async function submit() {
    setTouched(true);
    setSubmitError(null);
    if (sending) return;
    const teamNum = teamId ? Number(teamId) : undefined;
    setSending(true);
    try {
      if (mode === "email") {
        if (!emailValid) return;
        const result = await inviteMember(email.trim(), role, teamNum);
        if (result?.error || result?.errors) {
          setSubmitError(result.error ?? result.errors ?? null);
          return;
        }
        if (processor)
          await grantProcessor(
            (m) => m.email === email.trim() || m.username === email.trim(),
          ).catch(() => {});
      } else {
        if (!usernameValid || !passwordValid) return;
        const created = await createMember({
          username: username.trim(),
          password: authType === "WEB" ? password : undefined,
          role,
          teamId: teamNum,
          authType,
          forceChange,
          forceMFA,
        });
        if (processor)
          await grantProcessor((m) => m.username === created).catch(() => {});
      }
      onInvited?.();
      close();
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width="sm"
      title={
        mode === "direct"
          ? t("users.invite.createTitle", "Create account")
          : t("users.invite.title", "Invite people")
      }
      subtitle={
        mode === "direct"
          ? t(
              "users.invite.createSubtitle",
              "Create a self-hosted account with a password or SSO.",
            )
          : t(
              "users.invite.subtitle2",
              "They'll get an email to join your Stirling workspace.",
            )
      }
      footer={
        <div className="portal-users__modal-footer">
          <Button variant="ghost" size="sm" onClick={close}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={sending}>
            {mode === "direct"
              ? t("users.invite.create", "Create account")
              : t("users.invite.send2", "Send invite")}
          </Button>
        </div>
      }
    >
      <div className="portal-users__invite-body">
        {canDirectCreate && (
          <FormField label={t("users.invite.method", "How to add them")}>
            <Select
              options={[
                {
                  value: "email",
                  label: t("users.invite.methodEmail", "Invite by email"),
                },
                {
                  value: "direct",
                  label: t(
                    "users.invite.methodDirect",
                    "Create account directly",
                  ),
                },
              ]}
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            />
          </FormField>
        )}

        {mode === "email" ? (
          <FormField
            label={t("users.invite.email", "Email address")}
            error={error}
            required
          >
            <Input
              type="email"
              placeholder={t(
                "users.invite.emailPlaceholder2",
                "name@company.com",
              )}
              value={email}
              invalid={!!error}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
            />
          </FormField>
        ) : (
          <>
            <FormField
              label={t("users.invite.username", "Username")}
              error={error}
              required
            >
              <Input
                placeholder={t("users.invite.usernamePlaceholder", "jsmith")}
                value={username}
                invalid={!!error}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => setTouched(true)}
              />
            </FormField>
            {authTypeOptions.length > 1 && (
              <FormField label={t("users.invite.authType", "Sign-in method")}>
                <Select
                  options={authTypeOptions}
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as AuthType)}
                />
              </FormField>
            )}
            {authType === "WEB" && (
              <FormField
                label={t("users.invite.password", "Password")}
                required
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </FormField>
            )}
          </>
        )}

        <div className="portal-users__invite-grid">
          <FormField label={t("users.invite.role", "Role")}>
            <Select
              options={roleOptions}
              value={role}
              onChange={(e) => setRole(e.target.value as InviteRole)}
            />
          </FormField>
          <FormField label={t("users.invite.team", "Team")}>
            <Select
              options={teams.map((tm) => ({
                value: String(tm.id),
                label: tm.name,
              }))}
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            />
          </FormField>
        </div>

        {mode === "direct" && (
          <div className="portal-users__invite-access">
            <Checkbox
              checked={forceChange}
              onChange={(e) => setForceChange(e.target.checked)}
              label={t(
                "users.invite.forceChange",
                "Require a password change on first login",
              )}
              disabled={authType !== "WEB"}
            />
            <Checkbox
              checked={forceMFA}
              onChange={(e) => setForceMFA(e.target.checked)}
              label={t(
                "users.invite.forceMfa",
                "Require MFA setup on first login",
              )}
            />
          </div>
        )}

        <div className="portal-users__invite-access">
          <span className="portal-users__invite-access-label">
            {t("users.invite.access", "Access")}
          </span>
          <Checkbox
            checked
            disabled
            label={t("users.cap.editor", "Editor")}
            description={t(
              "users.invite.editorDesc",
              "Edit PDFs in the Stirling PDF Editor. Everyone gets this.",
            )}
          />
          <Checkbox
            checked={processor}
            onChange={(e) => setProcessor(e.target.checked)}
            label={t("users.cap.processor", "Processor")}
            description={t(
              "users.invite.processorDesc",
              "The governance surface, run pipelines, agents, and the API.",
            )}
          />
        </div>
      </div>
    </Modal>
  );
}
