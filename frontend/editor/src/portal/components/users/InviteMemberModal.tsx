import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, FormField, Input, Modal, Select } from "@app/ui";
import {
  createMember,
  fetchUsers,
  ROLE_LABEL,
  type AuthType,
} from "@portal/api/users";
import {
  generateInviteLink,
  type GeneratedInviteLink,
} from "@portal/api/inviteLinks";
import { usersBackend } from "@app/portal/usersBackend";
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
  /** Whether "Invite by email" is offered. Off when SMTP/invites aren't configured
   * (self-hosted); always on for SaaS. */
  canEmailInvite?: boolean;
  /** Whether "Share an invite link" is offered (self-hosted with mail.enableInvites). */
  canInviteLink?: boolean;
  hasOauth?: boolean;
  hasSaml?: boolean;
  /** Whether the "admin" (Org Owner) role can be assigned. Off on SaaS. */
  adminRole?: boolean;
  /** Whether portal-access grants can be created (ADMIN-only). Gates the Processor option. */
  manageGrants?: boolean;
  /** Non-blocking notice back to the parent (e.g. a deferred Processor grant). */
  onNotice?: (message: string) => void;
  /** Force the initial mode (mainly for Storybook). Defaults to "direct" when account
   * creation is available, else "email". */
  initialMode?: Mode;
}

type InviteRole = "member" | "admin";
type Mode = "email" | "direct" | "link";

/** Backend default; the field is free-form so an admin can shorten or extend it. */
const DEFAULT_EXPIRY_HOURS = 72;

// Values hold i18n keys; resolved with t() where the select renders.
const ROLE_SELECT_OPTIONS: { value: InviteRole; labelKey: string }[] = [
  { value: "member", labelKey: ROLE_LABEL.member },
  { value: "admin", labelKey: ROLE_LABEL.admin },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMemberModal({
  open,
  onClose,
  onInvited,
  teams,
  defaultTeamId,
  canDirectCreate = false,
  canEmailInvite = true,
  canInviteLink = false,
  hasOauth = false,
  hasSaml = false,
  adminRole = true,
  manageGrants = false,
  onNotice,
  initialMode,
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
  const [expiryHours, setExpiryHours] = useState(String(DEFAULT_EXPIRY_HOURS));
  const [emailLink, setEmailLink] = useState(false);
  const [link, setLink] = useState<GeneratedInviteLink | null>(null);
  const [copied, setCopied] = useState(false);

  // Which add-user modes this flavor/config offers. Self-hosted offers direct create;
  // SaaS offers email; self-hosted also offers email once SMTP + invites are configured.
  const directAvailable = canDirectCreate;
  const emailAvailable = canEmailInvite;
  const linkAvailable = canInviteLink;
  // Email is also the terminal fallback: with nothing enabled the modal still
  // opens on the invite form rather than a link mode that cannot mint a link.
  const preferredMode: Mode = directAvailable
    ? "direct"
    : !emailAvailable && linkAvailable
      ? "link"
      : "email";
  const modeAvailable: Record<Mode, boolean> = {
    direct: directAvailable,
    email: emailAvailable,
    link: linkAvailable,
  };
  const modeCount = Object.values(modeAvailable).filter(Boolean).length;

  useEffect(() => {
    if (!open) return;
    // Honor an explicit initialMode only when that mode is actually available.
    const requested: Mode =
      initialMode && modeAvailable[initialMode] ? initialMode : preferredMode;
    setMode(requested);
    setTeamId(
      defaultTeamId != null
        ? String(defaultTeamId)
        : teams.length > 0
          ? String(teams[0].id)
          : "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- modeAvailable is derived
    // from the three flags already listed; depending on the object would re-run every render.
  }, [
    open,
    defaultTeamId,
    teams,
    directAvailable,
    emailAvailable,
    linkAvailable,
    preferredMode,
    initialMode,
  ]);

  // A server-side submit error must not outlive the input that caused it.
  useEffect(() => {
    setSubmitError(null);
  }, [email, username, password]);

  // Drop the "admin" (Org Owner) option where it can't be assigned (SaaS).
  const roleOptions = (
    adminRole
      ? ROLE_SELECT_OPTIONS
      : ROLE_SELECT_OPTIONS.filter((o) => o.value !== "admin")
  ).map((o) => ({ value: o.value, label: t(o.labelKey) }));

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
  // A link's email is optional: blank means anyone holding the link may redeem it.
  const linkEmailValid = email.trim() === "" || emailValid;
  const expiryValid =
    Number.isInteger(Number(expiryHours)) &&
    Number(expiryHours) >= 1 &&
    Number(expiryHours) <= 8760;
  const usernameValid = username.trim().length >= 3;
  const needsPassword = mode === "direct" && authType === "WEB";
  const passwordValid = !needsPassword || password.length >= 8;

  const error =
    (touched && mode === "email" && !emailValid
      ? t("users.invite.emailError", "Enter a valid email address")
      : undefined) ??
    (touched && mode === "link" && !linkEmailValid
      ? t("users.invite.emailError", "Enter a valid email address")
      : undefined) ??
    (touched && mode === "link" && !expiryValid
      ? t("users.invite.expiryError", "Expiry must be between 1 and 8760 hours")
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

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.inviteUrl);
      setCopied(true);
    } catch {
      setSubmitError(
        t(
          "users.invite.copyFailed",
          "Copying failed - select the link and copy it manually",
        ),
      );
    }
  }

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
      setExpiryHours(String(DEFAULT_EXPIRY_HOURS));
      setEmailLink(false);
      setLink(null);
      setCopied(false);
    }, 200);
  }

  // Grant Processor to the just-added user. Returns false when it couldn't be applied
  // (an email invitee usually isn't a resolvable user yet, or the grant call is denied).
  async function grantProcessor(
    match: (m: { email: string; username?: string }) => boolean,
  ): Promise<boolean> {
    const { members } = await fetchUsers(tier);
    const user = members.find(match);
    if (!user) return false;
    await createGrant({
      resourceType: "PORTAL",
      resourceId: "",
      principalType: "USER",
      principalId: Number(user.id),
      permission: "USE",
    });
    return true;
  }

  async function submit() {
    setTouched(true);
    setSubmitError(null);
    if (sending) return;
    const teamNum = teamId ? Number(teamId) : undefined;
    setSending(true);
    try {
      let processorApplied = true;
      if (mode === "link") {
        if (!linkEmailValid || !expiryValid) return;
        const generated = await generateInviteLink({
          email: email.trim() || undefined,
          role: role === "admin" ? "ROLE_ADMIN" : "ROLE_USER",
          teamId: teamNum,
          expiryHours: Number(expiryHours),
          sendEmail: emailLink && emailValid,
        });
        setLink(generated);
        setCopied(false);
        // The link is the deliverable: keep the modal open so it can be copied.
        onInvited?.();
        if (generated.emailSent === false) {
          onNotice?.(
            t(
              "users.invite.linkEmailFailed",
              "The link was created but could not be emailed: {{reason}}. Copy it and send it yourself.",
              {
                reason:
                  generated.emailError ??
                  t(
                    "users.invite.linkEmailUnknown",
                    "the mail server refused it",
                  ),
              },
            ),
          );
        }
        return;
      }
      if (mode === "email") {
        if (!emailValid) return;
        const result = await usersBackend.inviteMember(
          email.trim(),
          role,
          teamNum,
        );
        if (result?.error || result?.errors) {
          setSubmitError(result.error ?? result.errors ?? null);
          return;
        }
        if (processor)
          processorApplied = await grantProcessor(
            (m) => m.email === email.trim() || m.username === email.trim(),
          ).catch(() => false);
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
          processorApplied = await grantProcessor(
            (m) => m.username === created,
          ).catch(() => false);
      }
      if (processor && !processorApplied)
        onNotice?.(
          t(
            "users.invite.processorDeferred",
            "Invite sent, but Processor access couldn't be granted yet - set it from the roster once they've joined.",
          ),
        );
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
          : mode === "link"
            ? t("users.invite.linkTitle", "Share an invite link")
            : t("users.invite.title", "Invite people")
      }
      subtitle={
        mode === "direct"
          ? t(
              "users.invite.createSubtitle",
              "Create a self-hosted account with a password or SSO.",
            )
          : mode === "link"
            ? t(
                "users.invite.linkSubtitle",
                "They pick their own password when they open the link. No account exists until they do.",
              )
            : t(
                "users.invite.subtitle2",
                "They'll get an email to join your Stirling workspace.",
              )
      }
      footer={
        <div className="portal-users__modal-footer">
          <Button variant="tertiary" size="sm" onClick={close}>
            {link ? t("common.done", "Done") : t("common.cancel", "Cancel")}
          </Button>
          {!link && (
            <Button size="sm" onClick={() => void submit()} disabled={sending}>
              {mode === "direct"
                ? t("users.invite.create", "Create account")
                : mode === "link"
                  ? t("users.invite.createLink", "Create link")
                  : t("users.invite.send2", "Send invite")}
            </Button>
          )}
        </div>
      }
    >
      <div className="portal-users__invite-body">
        {modeCount > 1 && !link && (
          <FormField label={t("users.invite.method", "How to add them")}>
            <Select
              options={[
                ...(emailAvailable
                  ? [
                      {
                        value: "email",
                        label: t("users.invite.methodEmail", "Invite by email"),
                      },
                    ]
                  : []),
                ...(linkAvailable
                  ? [
                      {
                        value: "link",
                        label: t(
                          "users.invite.methodLink",
                          "Share an invite link",
                        ),
                      },
                    ]
                  : []),
                ...(directAvailable
                  ? [
                      {
                        value: "direct",
                        label: t(
                          "users.invite.methodDirect",
                          "Create account directly",
                        ),
                      },
                    ]
                  : []),
              ]}
              value={mode}
              onChange={(value) => setMode((value ?? "email") as Mode)}
            />
          </FormField>
        )}

        {link && (
          <div className="portal-users__invite-link">
            <FormField
              label={t("users.invite.linkReady", "Invite link")}
              helperText={t(
                "users.invite.linkExpiry",
                "Expires {{when}}. It can only be used once.",
                { when: new Date(link.expiresAt).toLocaleString() },
              )}
            >
              <div className="portal-users__invite-link-row">
                <Input readOnly value={link.inviteUrl} />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void copyLink()}
                >
                  {copied
                    ? t("common.copied", "Copied")
                    : t("common.copy", "Copy")}
                </Button>
              </div>
            </FormField>
            {link.email && link.emailSent && (
              <p className="portal-users__invite-hint">
                {t("users.invite.linkEmailed", "Also emailed to {{email}}.", {
                  email: link.email,
                })}
              </p>
            )}
            {submitError && (
              <p className="portal-users__error" role="alert">
                {submitError}
              </p>
            )}
          </div>
        )}

        {link ? null : mode === "link" ? (
          <>
            <FormField
              label={t("users.invite.linkEmail", "Email address (optional)")}
              helperText={t(
                "users.invite.linkEmailHint",
                "Bind the link to one person. Leave blank and anyone holding it can join.",
              )}
              error={error}
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
            <FormField label={t("users.invite.expiry", "Expires in (hours)")}>
              <Input
                type="number"
                min={1}
                max={8760}
                value={expiryHours}
                onChange={(e) => setExpiryHours(e.target.value)}
                onBlur={() => setTouched(true)}
              />
            </FormField>
            {canEmailInvite && emailValid && (
              <Checkbox
                checked={emailLink}
                onChange={(e) => setEmailLink(e.target.checked)}
                label={t("users.invite.emailTheLink", "Email the link to them")}
              />
            )}
          </>
        ) : mode === "email" ? (
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
                  onChange={(value) =>
                    setAuthType((value ?? "WEB") as AuthType)
                  }
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

        {!link && (
          <div className="portal-users__invite-grid">
            <FormField label={t("users.invite.role", "Role")}>
              <Select
                options={roleOptions}
                value={role}
                onChange={(value) => setRole((value ?? "member") as InviteRole)}
              />
            </FormField>
            <FormField label={t("users.invite.team", "Team")}>
              <Select
                options={teams.map((tm) => ({
                  value: String(tm.id),
                  label: tm.name,
                }))}
                value={teamId}
                onChange={(value) => setTeamId(value ?? "")}
              />
            </FormField>
          </div>
        )}

        {mode === "direct" && !link && (
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

        {!link && (
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
            {manageGrants && (
              <Checkbox
                checked={processor}
                onChange={(e) => setProcessor(e.target.checked)}
                label={t("users.cap.processor", "Processor")}
                description={t(
                  "users.invite.processorDesc",
                  "The governance surface, run pipelines, agents, and the API.",
                )}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
