import { useEffect, useRef, useState } from "react";
import { Alert, Checkbox, Group, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

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
}

/** Callbacks reject on failure; completion must enforce cloud readiness on the server. */
export interface OwnershipTransferAdapter {
  local: boolean;
  prepare: () => Promise<OwnershipStatus>;
  invite?: () => Promise<OwnershipStatus>;
  transferCloud: (status: OwnershipStatus) => Promise<OwnershipStatus>;
  completeLocal?: (status: OwnershipStatus) => Promise<void>;
  cancel?: () => Promise<void>;
  signIn?: () => void;
}

interface Props {
  adapter: OwnershipTransferAdapter;
  onClose: () => void;
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

/** Mounted for one selected recipient. Closing preserves a pending server handover for recovery. */
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
  const working = useRef(false);
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
    if (!status) return;
    let next = status;
    try {
      if (next.cloud && next.cloud.state !== "TRANSFERRED") {
        next = await adapter.transferCloud(next);
        setStatus(next);
      }
      if (adapter.local) await adapter.completeLocal!(next);
      setDone(true);
      onTransferred();
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

  return (
    <Modal
      opened
      onClose={() => !busy && onClose()}
      closeOnClickOutside={false}
      closeOnEscape={!busy}
      withCloseButton={!busy}
      size="md"
      zIndex={Z_INDEX_OVER_CONFIG_MODAL + 1}
      title={t("ownership.title", "Transfer ownership")}
    >
      <Stack gap="lg" aria-busy={busy}>
        {done ? (
          <>
            <Text fw={600}>{t("ownership.done", "Ownership transferred")}</Text>
            <Text>
              {t("ownership.newOwner", "{{name}} is now the owner.", {
                name: status?.targetName,
              })}
            </Text>
            <Button onClick={onClose}>{t("common.done", "Done")}</Button>
          </>
        ) : (
          <>
            {status && (
              <div>
                <Text size="sm" c="dimmed">
                  {t("ownership.newOwnerLabel", "New owner")}
                </Text>
                <Text fw={600}>{status.targetName}</Text>
                {status.targetEmail && (
                  <Text size="sm">{status.targetEmail}</Text>
                )}
              </div>
            )}
            {busy && (
              <Text role="status">
                {t("ownership.working", "Checking and updating ownership…")}
              </Text>
            )}
            {error && (
              <Alert role="alert" color="red">
                {partial
                  ? t(
                      "ownership.partialError",
                      "Cloud ownership has transferred. Finish the server transfer to keep both owners aligned.",
                    )
                  : t(
                      "ownership.error",
                      "We couldn't complete this step. Check the recipient is active and the server is connected, then check again. A pending transfer can be resumed here.",
                    )}
              </Alert>
            )}
            {error && (
              <Text size="sm">
                {error.includes("CLOUD_SIGN_IN_REQUIRED") ||
                error.includes("CLOUD_OWNER_REQUIRED")
                  ? t(
                      "ownership.ownerRequired",
                      "Sign in as the current cloud team owner, then try this step again.",
                    )
                  : error.includes("INVITATION_BLOCKED")
                    ? t(
                        "ownership.inviteBlocked",
                        "The invitation could not be sent. Check available team seats and whether the recipient already has a paid subscription.",
                      )
                    : error.includes("CLOUD_OWNER_CHANGED")
                      ? t(
                          "ownership.ownerChanged",
                          "Cloud ownership changed after this transfer started. Cancel this transfer and start again with the current cloud owner.",
                        )
                      : error.includes("TARGET_CHANGED") ||
                          error.includes("TARGET_UNAVAILABLE")
                        ? t(
                            "ownership.targetChanged",
                            "The recipient's account changed. Restore their access or cancel this transfer and choose them again.",
                          )
                        : error.includes("HANDOVER_IN_PROGRESS")
                          ? t(
                              "ownership.inProgress",
                              "Another recipient already has a pending transfer. Close this dialog and resume it from Users.",
                            )
                          : error.includes("EMAIL_REQUIRED")
                            ? t(
                                "ownership.emailRequired",
                                "Add an email address to this user's account before transferring a linked server.",
                              )
                            : error.includes("LINK_CHANGED")
                              ? t(
                                  "ownership.linkChanged",
                                  "The server's cloud link changed. Ask the server operator to restore the original link before resuming.",
                                )
                              : null}
              </Text>
            )}
            {!status && !busy && (
              <Text>
                {t(
                  "ownership.prepareError",
                  "For a linked server, the recipient needs an email address and must have completed their first login. If another transfer is pending, resume it from Users.",
                )}
              </Text>
            )}
            {needsMember && (
              <>
                <Text fw={600}>
                  {t("ownership.joinTitle", "Join the cloud team first")}
                </Text>
                <Text>
                  {t(
                    "ownership.joinBody",
                    "Send an invitation to {{email}}. They can create an account or sign in, then accept it to join {{team}}. Ownership stays with you until they are ready.",
                    {
                      email: status?.targetEmail,
                      team: status?.cloud?.teamName,
                    },
                  )}
                </Text>
                <Text size="sm" c="dimmed">
                  {t(
                    "ownership.otherTeam",
                    "If they belong to another team, accepting may move their account. A paid account or ownership of another team may need resolving first. We won't move their subscription or merge teams.",
                  )}
                </Text>
                {invited && (
                  <Text role="status">
                    {t(
                      "ownership.invited",
                      "Invitation sent. Ask them to accept it, then check again.",
                    )}
                  </Text>
                )}
                {adapter.invite && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setStatus(await adapter.invite!());
                        setInvited(true);
                      })
                    }
                  >
                    {t("ownership.invite", "Send invitation")}
                  </Button>
                )}
              </>
            )}
            {status?.cloud && adapter.signIn && !cloudDone && (
              <div>
                <Text size="sm">
                  {t(
                    "ownership.signInBody",
                    "Use the current cloud team owner's account to invite or transfer. Your server login stays the same.",
                  )}
                </Text>
                <Button
                  variant="tertiary"
                  disabled={busy}
                  onClick={() => {
                    onClose();
                    adapter.signIn?.();
                  }}
                >
                  {t("ownership.signIn", "Sign in to cloud")}
                </Button>
              </div>
            )}
            {status && !needsMember && (
              <>
                <Text fw={600}>
                  {partial
                    ? t("ownership.finishTitle", "Finish the server transfer")
                    : t("ownership.review", "Review & transfer")}
                </Text>
                {status.cloud && (
                  <>
                    <Text>
                      {t(
                        "ownership.cloudScope",
                        "{{name}} will own the entire {{team}} cloud team and manage its members and billing settings.",
                        {
                          name: status.targetName,
                          team: status.cloud.teamName,
                        },
                      )}
                    </Text>
                    {status.cloud.linkedInstances > 0 && (
                      <Text size="sm">
                        {t(
                          "ownership.servers",
                          "This team has {{count}} linked servers. Their cloud billing stays with this team; other servers' local owners do not change.",
                          { count: status.cloud.linkedInstances },
                        )}
                      </Text>
                    )}
                    <Text size="sm">
                      {t(
                        "ownership.billing",
                        "The subscription, wallet, payment method and existing licenses stay in place. Billing contact details do not change automatically.",
                      )}
                    </Text>
                    <Text size="sm">
                      {t(
                        "ownership.demote",
                        "The previous cloud owner becomes a team member.",
                      )}
                    </Text>
                  </>
                )}
                {adapter.local && (
                  <Text>
                    {t(
                      "ownership.localScope",
                      "They will also own this server and become an administrator. You keep administrator access.",
                    )}
                  </Text>
                )}
                {!partial && (
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
                )}
              </>
            )}
            <Group justify="flex-end">
              {adapter.cancel && !partial && (
                <Button
                  variant="tertiary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await adapter.cancel!();
                      onClose();
                    })
                  }
                >
                  {t("ownership.cancel", "Cancel transfer")}
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setStatus(await adapter.prepare());
                  })
                }
              >
                {t("ownership.check", "Check again")}
              </Button>
              {status && !needsMember && (
                <Button
                  disabled={busy || (!accepted && !partial)}
                  onClick={() => void run(transfer)}
                >
                  {partial
                    ? t("ownership.finish", "Finish server transfer")
                    : t("ownership.transfer", "Transfer ownership")}
                </Button>
              )}
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
