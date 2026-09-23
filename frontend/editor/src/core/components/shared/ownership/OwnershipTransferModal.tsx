import { useEffect, useRef, useState } from "react";
import { Checkbox, Tooltip } from "@mantine/core";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import { FlowModal } from "@app/components/shared/FlowModal";
import { StepModalHeader } from "@app/components/shared/StepModalHeader";
import { Icon } from "@app/ui/Icon";
import "@app/components/shared/ownership/OwnershipTransferModal.css";

export interface CloudOwnershipStatus {
  teamId: number;
  teamName: string;
  leaderUserId: number | null;
  targetUserId: number | null;
  linkedInstances: number;
  subscribed: boolean;
  state: "NEEDS_MEMBERSHIP" | "READY" | "TRANSFERRED";
}

export interface OwnershipStatus {
  targetId: number;
  targetName: string;
  targetEmail: string | null;
  cloud: CloudOwnershipStatus | null;
  cloudEmail?: string | null;
  candidates?: {
    teamId: number;
    teamName: string;
    members: { id: number; name: string | null; email: string }[];
  } | null;
}

/** Callbacks reject on failure; completion must enforce cloud readiness on the server. */
export interface OwnershipTransferAdapter {
  local: boolean;
  prepare: () => Promise<OwnershipStatus>;
  selectCloud?: (selection: {
    cloudUserId?: number;
    cloudEmail?: string;
  }) => Promise<OwnershipStatus>;
  invite?: () => Promise<OwnershipStatus>;
  transferCloud: (status: OwnershipStatus) => Promise<OwnershipStatus>;
  completeLocal?: (status: OwnershipStatus) => Promise<void>;
  cancel?: () => Promise<void>;
  signIn?: () => void;
}

interface Props {
  adapter: OwnershipTransferAdapter;
  onClose: () => void;
  /** Runs when the success screen is dismissed, so session refresh cannot hide the result. */
  onTransferred: () => void;
}

function ownershipError(cause: unknown): string {
  if (!cause || typeof cause !== "object") return "UNKNOWN";
  const error = cause as {
    body?: { detail?: string };
    response?: { data?: { detail?: string } };
    message?: string;
  };
  return (
    error.body?.detail ??
    error.response?.data?.detail ??
    error.message ??
    "UNKNOWN"
  );
}

/** Mounted for one recipient. Dismissal cancels preparation but preserves a committed cloud step. */
export function OwnershipTransferModal({
  adapter,
  onClose,
  onTransferred,
}: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<OwnershipStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [done, setDone] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const working = useRef(false);
  const dismissed = useRef(false);
  const initialAdapter = useRef(adapter);

  useEffect(() => {
    let active = true;
    initialAdapter.current
      .prepare()
      .then(
        (value) => {
          if (active) setStatus(value);
        },
        (cause) => {
          if (active) setError(ownershipError(cause));
        },
      )
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const needsMember = status?.cloud?.state === "NEEDS_MEMBERSHIP";
  const cloudDone = status?.cloud?.state === "TRANSFERRED";
  const partial = adapter.local && cloudDone && !done;
  const canCancel = Boolean(
    adapter.local &&
    adapter.cancel &&
    status &&
    !status.candidates &&
    !partial &&
    !done,
  );
  const startFromInstance =
    !adapter.local &&
    ((status?.cloud?.linkedInstances ?? 0) > 0 ||
      Boolean(error?.includes("START_TRANSFER_FROM_INSTANCE")));

  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(ownershipError(cause));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function transfer() {
    if (!status || status.candidates || startFromInstance) return;
    let next = status;
    try {
      if (next.cloud && next.cloud.state !== "TRANSFERRED") {
        next = await adapter.transferCloud(next);
        setStatus(next);
      }
      if (adapter.local) await adapter.completeLocal!(next);
      setDone(true);
    } catch (cause) {
      // A lost cloud response may have committed. Read its state before offering any retry.
      try {
        setStatus(await adapter.prepare());
      } catch {
        /* Keep the last confirmed state. */
      }
      throw cause;
    }
  }

  function close() {
    if (busy || working.current || dismissed.current) return;
    if (done) {
      dismissed.current = true;
      onTransferred();
      onClose();
      return;
    }
    if (canCancel) {
      void run(async () => {
        await adapter.cancel!();
        onClose();
      });
    } else {
      onClose();
    }
  }

  const choosing = Boolean(status?.candidates);
  const linked = Boolean(status?.cloud || choosing);
  const total = adapter.local && linked ? 3 : 2;
  const step = done ? total : choosing || needsMember ? 1 : total - 1;
  const cloudEmail = status?.cloudEmail ?? status?.targetEmail;
  const members =
    status?.candidates?.members.filter((member) =>
      `${member.name ?? ""} ${member.email}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim());
  const title = done
    ? t("ownership.done", "Ownership transferred")
    : startFromInstance
      ? t(
          "ownership.startFromInstanceTitle",
          "Start from your self-hosted server",
        )
      : choosing
        ? t("ownership.chooseCloud", "Choose their Stirling account")
        : needsMember
          ? invited
            ? t("ownership.waiting", "Waiting for them to join")
            : t("ownership.joinTitle", "Join the cloud team first")
          : partial
            ? t("ownership.finishTitle", "Finish the server transfer")
            : status
              ? t("ownership.review", "Review & transfer")
              : t("ownership.prepareTitle", "Prepare the transfer");

  function errorText() {
    if (partial || error?.includes("FINISH_LOCAL_TRANSFER"))
      return t(
        "ownership.partialError",
        "Cloud ownership has transferred. Finish the server transfer to keep both owners aligned.",
      );
    if (
      error?.includes("CLOUD_SIGN_IN_REQUIRED") ||
      error?.includes("CLOUD_OWNER_REQUIRED")
    )
      return t(
        "ownership.ownerRequired",
        "Sign in as the current cloud team owner, then try this step again.",
      );
    if (error?.includes("INVITATION_BLOCKED"))
      return t(
        "ownership.inviteBlocked",
        "The invitation could not be sent. Check available team seats and whether the recipient already has a paid subscription.",
      );
    if (error?.includes("CLOUD_OWNER_CHANGED"))
      return t(
        "ownership.ownerChanged",
        "Cloud ownership changed after this transfer started. Cancel this transfer and start again with the current cloud owner.",
      );
    if (
      error?.includes("CLOUD_TARGET_CHANGED") ||
      error?.includes("CHOOSE_ANOTHER_CLOUD_USER")
    )
      return t(
        "ownership.cloudTargetChanged",
        "Choose another cloud member. This account is no longer eligible for the handover.",
      );
    if (
      error?.includes("TARGET_CHANGED") ||
      error?.includes("TARGET_UNAVAILABLE")
    )
      return t(
        "ownership.targetChanged",
        "The recipient's account changed. Restore their access or cancel this transfer and choose them again.",
      );
    if (error?.includes("HANDOVER_IN_PROGRESS"))
      return t(
        "ownership.inProgress",
        "Another recipient already has a pending transfer. Close this dialog and resume it from Users.",
      );
    if (error?.includes("LINK_CHANGED"))
      return t(
        "ownership.linkChanged",
        "The server's cloud link changed. Ask the server operator to restore the original link before resuming.",
      );
    return t(
      "ownership.error",
      "We couldn't complete this step. Check the recipient is active and the server is connected, then check again. A pending transfer can be resumed here.",
    );
  }

  async function chooseCloud() {
    if (!adapter.selectCloud) return;
    const selection = inviteMode
      ? { cloudEmail: inviteEmail.trim() }
      : { cloudUserId: selectedId! };
    setStatus(await adapter.selectCloud(selection));
    setAccepted(false);
    setInvited(false);
  }

  async function changeAccount() {
    await adapter.cancel!();
    setStatus(await adapter.prepare());
    setAccepted(false);
    setInvited(false);
    setInviteMode(false);
    setSearch("");
    setSelectedId(null);
  }

  function primaryAction() {
    if (done)
      return <Button onClick={close}>{t("common.done", "Done")}</Button>;
    if (startFromInstance) return null;
    if (choosing && !inviteMode && status?.candidates?.members.length === 0)
      return (
        <Button disabled={busy} onClick={() => setInviteMode(true)}>
          {t("ownership.inviteNewOwner", "Invite new owner")}
        </Button>
      );
    if (choosing)
      return (
        <Button
          disabled={busy || (inviteMode ? !emailValid : selectedId === null)}
          onClick={() => void run(chooseCloud)}
        >
          {t("common.continue", "Continue")}
        </Button>
      );
    if (!status || (error && !partial) || (needsMember && invited))
      return (
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setStatus(await adapter.prepare());
            })
          }
        >
          {t("ownership.check", "Check again")}
        </Button>
      );
    if (needsMember)
      return (
        <Button
          disabled={busy || !adapter.invite}
          onClick={() =>
            void run(async () => {
              setStatus(await adapter.invite!());
              setInvited(true);
            })
          }
        >
          {t("ownership.invite", "Send invitation")}
        </Button>
      );
    return (
      <Button
        disabled={busy || (!accepted && !partial)}
        onClick={() => void run(transfer)}
      >
        {partial
          ? t("ownership.finish", "Finish server transfer")
          : t("ownership.transfer", "Transfer ownership")}
      </Button>
    );
  }

  return (
    <FlowModal
      open
      onClose={close}
      label={t("ownership.title", "Transfer ownership")}
      disableBackdropClose
      disableEscapeClose={busy}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL + 1}
      footer={
        <>
          {!done && (
            <Button variant="tertiary" disabled={busy} onClick={close}>
              {canCancel
                ? t("ownership.cancel", "Cancel transfer")
                : t("common.close", "Close")}
            </Button>
          )}
          {primaryAction()}
        </>
      }
    >
      <StepModalHeader
        brand={t("ownership.title", "Transfer ownership")}
        title={title}
        step={startFromInstance ? undefined : step}
        total={total}
        stepLabel={
          startFromInstance
            ? undefined
            : t("ownership.step", "Step {{current}} of {{total}}", {
                current: step,
                total,
              })
        }
        closeLabel={t("ownership.close", "Close transfer dialog")}
        onClose={busy ? undefined : close}
      />
      <div className="ownership-flow" aria-busy={busy}>
        {busy && (
          <p className="ownership-flow__muted" role="status">
            {t("ownership.working", "Checking and updating ownership…")}
          </p>
        )}
        {error && !startFromInstance && (
          <div
            className="ownership-flow__notice ownership-flow__notice--error"
            role="alert"
          >
            {errorText()}
          </div>
        )}
        {done ? (
          <div className="ownership-flow__success" role="status">
            <Icon name="circle-check" size={32} />
            <p>
              <Trans
                t={t}
                i18nKey="ownership.newOwnerStyled"
                defaults="<user>{{name}}</user> is now the owner."
                values={{ name: status?.targetName }}
                components={{
                  user: <strong className="ownership-flow__username" />,
                }}
              />
            </p>
            <p className="ownership-flow__muted">
              {adapter.local && linked
                ? t(
                    "ownership.bothDone",
                    "Server and cloud ownership are now aligned.",
                  )
                : t("ownership.accessUpdated", "Their owner access is ready.")}
            </p>
          </div>
        ) : startFromInstance ? (
          <p role="alert">
            {t(
              "ownership.startFromInstanceBody",
              "This team has linked servers. On the self-hosted server, open Settings → Users and change the recipient's role to Org Owner. That flow transfers cloud ownership before completing the server transfer.",
            )}
          </p>
        ) : (
          <>
            {status && (
              <div className="ownership-flow__accounts">
                <div>
                  <span>
                    {adapter.local
                      ? t("ownership.serverAccount", "Server account")
                      : t("ownership.newOwnerLabel", "New owner")}
                  </span>
                  <strong title={status.targetName}>{status.targetName}</strong>
                </div>
                {!choosing && status.cloud && (
                  <div>
                    <span>
                      {t("ownership.cloudAccount", "Stirling account")}
                    </span>
                    <strong title={cloudEmail ?? undefined}>
                      {cloudEmail}
                    </strong>
                    {adapter.selectCloud && !partial && (
                      <Button
                        variant="quiet"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(changeAccount)}
                      >
                        {t("ownership.change", "Change")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            {choosing && (
              <>
                <p>
                  <Trans
                    t={t}
                    i18nKey="ownership.chooseCloudStyled"
                    defaults="Select the account for <user>{{name}}</user> in {{team}}."
                    values={{
                      name: status?.targetName,
                      team: status?.candidates?.teamName,
                    }}
                    components={{
                      user: <strong className="ownership-flow__username" />,
                    }}
                  />
                </p>
                {inviteMode ? (
                  <>
                    <label className="ownership-flow__field">
                      {t("ownership.inviteEmail", "Their email address")}
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        disabled={busy}
                        autoComplete="email"
                      />
                    </label>
                    <p className="ownership-flow__muted">
                      {t(
                        "ownership.inviteEmailBody",
                        "They can create a Stirling account or sign in to accept the invitation. You stay the owner until they join and you confirm the transfer.",
                      )}
                    </p>
                    <Button
                      variant="tertiary"
                      disabled={busy}
                      onClick={() => setInviteMode(false)}
                    >
                      {t("ownership.backToMembers", "Back to team members")}
                    </Button>
                  </>
                ) : (
                  <>
                    {status?.candidates?.members.length ? (
                      <>
                        <div className="ownership-flow__search-row">
                          <input
                            className="ownership-flow__search"
                            type="search"
                            aria-label={t(
                              "ownership.searchMembers",
                              "Search team members",
                            )}
                            placeholder={t(
                              "ownership.searchMembers",
                              "Search team members",
                            )}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                          />
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => setInviteMode(true)}
                          >
                            {t("ownership.openInvite", "Invite")}
                          </Button>
                        </div>
                        <div
                          className="ownership-flow__members"
                          role="radiogroup"
                          aria-label={t(
                            "ownership.cloudAccount",
                            "Stirling account",
                          )}
                        >
                          {members.map((member) => (
                            <label
                              key={member.id}
                              title={
                                member.name && member.name !== member.email
                                  ? `${member.name} · ${member.email}`
                                  : member.email
                              }
                              className={`ownership-flow__member ${selectedId === member.id ? "is-selected" : ""}`}
                            >
                              <input
                                type="radio"
                                name="cloud-successor"
                                value={member.id}
                                checked={selectedId === member.id}
                                disabled={busy}
                                onChange={() => setSelectedId(member.id)}
                              />
                              <span>
                                <strong>{member.name || member.email}</strong>
                                {member.name &&
                                  member.name !== member.email && (
                                    <small>{member.email}</small>
                                  )}
                              </span>
                            </label>
                          ))}
                          {!members.length && (
                            <p className="ownership-flow__muted">
                              {t(
                                "ownership.noMatches",
                                "No matching team members.",
                              )}
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="ownership-flow__empty">
                        <Icon name="users" size={28} />
                        <strong>
                          {t("ownership.noMembers", "Invite your next owner")}
                        </strong>
                        <p>
                          {t(
                            "ownership.noMembersBody",
                            "There are no other eligible members in this cloud team. Invite the recipient to join before transferring ownership.",
                          )}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {needsMember && (
              <>
                <p>
                  {t(
                    "ownership.joinBody",
                    "Send an invitation to {{email}}. They can create an account or sign in, then accept it to join {{team}}. Ownership stays with you until they are ready.",
                    { email: cloudEmail, team: status?.cloud?.teamName },
                  )}
                </p>
                {invited && (
                  <div role="status" className="ownership-flow__notice">
                    {t(
                      "ownership.invited",
                      "Invitation sent. Ask them to accept it, then check again.",
                    )}
                  </div>
                )}
                <p className="ownership-flow__muted">
                  {t(
                    "ownership.otherTeam",
                    "If they belong to another team, accepting may move their account. A paid account or ownership of another team may need resolving first. We won't move their subscription or merge teams.",
                  )}
                </p>
              </>
            )}
            {status && !choosing && !needsMember && (
              <>
                {partial ? (
                  <div className="ownership-flow__notice" role="status">
                    {t(
                      "ownership.partialError",
                      "Cloud ownership has transferred. Finish the server transfer to keep both owners aligned.",
                    )}
                  </div>
                ) : (
                  <>
                    <div className="ownership-flow__summary">
                      {status.cloud && (
                        <>
                          <p>
                            <Trans
                              t={t}
                              i18nKey="ownership.cloudScopeStyled"
                              defaults="<user>{{name}}</user> will manage {{team}}, its members and billing."
                              values={{
                                name: status.targetName,
                                team: status.cloud.teamName,
                              }}
                              components={{
                                user: (
                                  <strong className="ownership-flow__username" />
                                ),
                              }}
                            />
                          </p>
                          <div className="ownership-flow__detail">
                            <span>
                              {t(
                                "ownership.billingUnchanged",
                                "Subscription and billing stay in place",
                              )}
                            </span>
                            <Tooltip
                              multiline
                              w={300}
                              zIndex={Z_INDEX_OVER_CONFIG_MODAL + 2}
                              events={{ hover: true, focus: true, touch: true }}
                              label={t(
                                "ownership.billing",
                                "The subscription, wallet, payment method and existing licenses stay in place. Billing contact details do not change automatically.",
                              )}
                            >
                              <ActionIcon
                                variant="quiet"
                                size="sm"
                                aria-label={t(
                                  "ownership.billingDetails",
                                  "Billing details",
                                )}
                              >
                                <Icon name="info" size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </div>
                          {status.cloud.linkedInstances > 1 && (
                            <div className="ownership-flow__detail">
                              <span>
                                {t(
                                  "ownership.linkedServerCount",
                                  "{{count}} linked servers",
                                  { count: status.cloud.linkedInstances },
                                )}
                              </span>
                              <Tooltip
                                multiline
                                w={300}
                                zIndex={Z_INDEX_OVER_CONFIG_MODAL + 2}
                                events={{
                                  hover: true,
                                  focus: true,
                                  touch: true,
                                }}
                                label={t(
                                  "ownership.instances",
                                  "This team has {{count}} linked servers. Their cloud billing stays with this team; other servers' local owners do not change.",
                                  { count: status.cloud.linkedInstances },
                                )}
                              >
                                <ActionIcon
                                  variant="quiet"
                                  size="sm"
                                  aria-label={t(
                                    "ownership.serverDetails",
                                    "Linked server details",
                                  )}
                                >
                                  <Icon name="info" size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </div>
                          )}
                          <p className="ownership-flow__muted">
                            {t(
                              "ownership.demote",
                              "The previous cloud owner becomes a team member.",
                            )}
                          </p>
                        </>
                      )}
                      {adapter.local && (
                        <p>
                          {t(
                            "ownership.localScope",
                            "They will own this server and manage billing and cloud connections. You keep administrator access, but lose access to those settings.",
                          )}
                        </p>
                      )}
                    </div>
                    <Checkbox
                      checked={accepted}
                      onChange={(event) =>
                        setAccepted(event.currentTarget.checked)
                      }
                      label={t(
                        "ownership.confirm",
                        "I understand the access and ownership changes.",
                      )}
                    />
                  </>
                )}
              </>
            )}
            {status?.cloud && adapter.signIn && !cloudDone && error && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  onClose();
                  adapter.signIn?.();
                }}
              >
                {t("ownership.signIn", "Sign in to cloud")}
              </Button>
            )}
            {!status && !busy && (
              <p className="ownership-flow__muted">
                {t(
                  "ownership.prepareHelp",
                  "The recipient must have completed their first server login. You can retry here, or return to Users to choose someone else.",
                )}
              </p>
            )}
          </>
        )}
      </div>
    </FlowModal>
  );
}
