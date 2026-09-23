import { useEffect, useRef, useState } from "react";
import { Checkbox, Combobox, Tooltip, useCombobox } from "@mantine/core";
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
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] =
    useState<OwnershipStatus["candidates"]>(null);
  const picker = useCombobox({
    onDropdownClose: () => picker.resetSelectedOption(),
  });
  const working = useRef(false);
  const dismissed = useRef(false);
  const initialAdapter = useRef(adapter);

  useEffect(() => {
    let active = true;
    initialAdapter.current
      .prepare()
      .then(
        (value) => {
          if (active) {
            setStatus(value);
            setCandidates(value.candidates);
            setSearch(
              value.cloud ? (value.cloudEmail ?? value.targetEmail ?? "") : "",
            );
          }
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
  const cloudEmail = status?.cloudEmail ?? status?.targetEmail;
  const ownerAccount = adapter.local
    ? status?.targetName
    : (cloudEmail ?? status?.targetName);
  const email = search.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const members = (candidates?.members ?? []).filter((member) =>
    member.email.toLowerCase().includes(email.toLowerCase()),
  );
  const matchingMember = candidates?.members.find(
    (member) => member.email.toLowerCase() === email.toLowerCase(),
  );
  const editing =
    choosing ||
    Boolean(
      adapter.selectCloud &&
      status?.cloud &&
      email.toLowerCase() !== (cloudEmail ?? "").toLowerCase(),
    );
  const teamName = status?.cloud?.teamName ?? candidates?.teamName;

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

  async function refresh() {
    const next = await adapter.prepare();
    setStatus(next);
    if (next.candidates) setCandidates(next.candidates);
    setSearch(next.cloud ? (next.cloudEmail ?? next.targetEmail ?? "") : "");
    setAccepted(false);
  }

  async function resetSelection() {
    await adapter.cancel!();
    const next = await adapter.prepare();
    setStatus(next);
    if (next.candidates) setCandidates(next.candidates);
    setAccepted(false);
    setInvited(false);
    if (!next.candidates) throw new Error("CLOUD_TARGET_CHANGED");
  }

  function editEmail(value: string) {
    setSearch(value);
    setAccepted(false);
    setInvited(false);
    picker.resetSelectedOption();
    picker.openDropdown();
    if (status?.cloud && !working.current) void run(resetSelection);
  }

  async function selectAccount(selection: {
    cloudUserId?: number;
    cloudEmail?: string;
  }) {
    if (!adapter.selectCloud) return null;
    if (status?.cloud) await resetSelection();
    const next = await adapter.selectCloud(selection);
    setStatus(next);
    setSearch(next.cloudEmail ?? next.targetEmail ?? "");
    setAccepted(false);
    setInvited(false);
    return next;
  }

  function primaryAction() {
    if (done)
      return <Button onClick={close}>{t("common.done", "Done")}</Button>;
    if (startFromInstance) return null;
    if (editing && !error)
      return (
        <Button
          disabled={
            busy ||
            !emailValid ||
            !adapter.selectCloud ||
            (!matchingMember && !adapter.invite)
          }
          onClick={() => {
            picker.closeDropdown();
            void run(async () => {
              const next = await selectAccount(
                matchingMember
                  ? { cloudUserId: matchingMember.id }
                  : { cloudEmail: email },
              );
              if (
                next?.cloud?.state === "NEEDS_MEMBERSHIP" &&
                !matchingMember
              ) {
                setStatus(await adapter.invite!());
                setInvited(true);
              }
            });
          }}
        >
          {emailValid
            ? matchingMember
              ? t("ownership.checkAccount", "Check account")
              : t("ownership.invite", "Send invitation")
            : t("ownership.transfer", "Transfer ownership")}
        </Button>
      );
    if (!status || (error && !partial) || (needsMember && invited))
      return (
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await refresh();
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
      disableEscapeClose={busy || picker.dropdownOpened}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL + 1}
      footer={
        <>
          <span className="ownership-flow__muted">
            {!done &&
              !partial &&
              !startFromInstance &&
              t("ownership.stayOwner", "You stay the owner until transfer.")}
          </span>
          {primaryAction()}
        </>
      }
    >
      <StepModalHeader
        brand={t("ownership.title", "Transfer ownership")}
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
            <strong>{t("ownership.done", "Ownership transferred")}</strong>
            <p>
              <Trans
                t={t}
                i18nKey="ownership.newOwnerStyled"
                defaults="<user>{{name}}</user> is now the owner."
                values={{ name: ownerAccount }}
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
          <div role="alert">
            <strong>
              {t(
                "ownership.startFromInstanceTitle",
                "Start from your self-hosted server",
              )}
            </strong>
            <p>
              {t(
                "ownership.startFromInstanceBody",
                "This team has linked servers. On the self-hosted server, open Settings → Users and change the recipient's role to Org Owner. That flow transfers cloud ownership before completing the server transfer.",
              )}
            </p>
          </div>
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
                  <strong title={ownerAccount}>{ownerAccount}</strong>
                </div>
                {adapter.local && linked && (
                  <div>
                    <label
                      className="ownership-flow__account-label"
                      htmlFor="ownership-cloud-email"
                    >
                      {t("ownership.cloudAccount", "Stirling account")}
                    </label>
                    {adapter.selectCloud && !partial ? (
                      <Combobox
                        store={picker}
                        zIndex={Z_INDEX_OVER_CONFIG_MODAL + 2}
                        onOptionSubmit={(value) => {
                          picker.closeDropdown();
                          void run(async () => {
                            await selectAccount({ cloudUserId: Number(value) });
                          });
                        }}
                      >
                        <div className="ownership-flow__picker">
                          <Combobox.Target withExpandedAttribute>
                            <input
                              id="ownership-cloud-email"
                              role="combobox"
                              className="ownership-flow__search"
                              value={search}
                              readOnly={busy}
                              autoComplete="off"
                              placeholder={t(
                                "ownership.searchEmail",
                                "Search or enter an email",
                              )}
                              onChange={(event) =>
                                editEmail(event.target.value)
                              }
                              onFocus={() => {
                                picker.openDropdown();
                                if (
                                  status.cloud &&
                                  !candidates &&
                                  !working.current
                                )
                                  void run(resetSelection);
                              }}
                              onClick={() => picker.openDropdown()}
                              onBlur={() => picker.closeDropdown()}
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Escape" &&
                                  picker.dropdownOpened
                                )
                                  event.stopPropagation();
                              }}
                            />
                          </Combobox.Target>
                          <span className="ownership-flow__chevron">
                            <Icon name="chevron-down" size={16} />
                          </span>
                          <Combobox.Dropdown className="ownership-flow__dropdown">
                            <Combobox.Options className="ownership-flow__options">
                              {members.map((member) => (
                                <Combobox.Option
                                  key={member.id}
                                  value={String(member.id)}
                                  title={member.email}
                                  disabled={busy}
                                  className="ownership-flow__option"
                                >
                                  {member.email}
                                </Combobox.Option>
                              ))}
                              {!members.length && (
                                <Combobox.Empty>
                                  {t(
                                    "ownership.noEmailMatches",
                                    "No matching members. Enter an email to invite.",
                                  )}
                                </Combobox.Empty>
                              )}
                            </Combobox.Options>
                          </Combobox.Dropdown>
                        </div>
                      </Combobox>
                    ) : (
                      <strong title={cloudEmail ?? undefined}>
                        {cloudEmail}
                      </strong>
                    )}
                  </div>
                )}
              </div>
            )}
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
                        account: (
                          <strong className="ownership-flow__username" />
                        ),
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
                        account: (
                          <strong className="ownership-flow__username" />
                        ),
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
                <span>
                  {t("ownership.anotherTeam", "Already on another team?")}
                </span>
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
            {status && !editing && !needsMember && (
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
                                name: ownerAccount,
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
                              "ownership.yourCloudAccess",
                              "You'll become a team member and lose owner access.",
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
