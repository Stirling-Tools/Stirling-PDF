import { useEffect, useRef, useState } from "react";
import { useCombobox } from "@mantine/core";
import type {
  OwnershipStatus,
  OwnershipTransferProps,
} from "@app/components/shared/ownership/ownershipTransfer.types";

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

/** One recipient per mount; serializes mutations and reconciles uncertain cloud completion before retry. */
export function useOwnershipTransfer({
  adapter,
  onClose,
  onTransferred,
}: OwnershipTransferProps) {
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
        try {
          await adapter.cancel!();
        } finally {
          onClose();
        }
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
    if (
      status?.cloud &&
      ((selection.cloudUserId != null &&
        selection.cloudUserId === status.cloud.targetUserId) ||
        (selection.cloudEmail != null &&
          selection.cloudEmail.toLowerCase() === cloudEmail?.toLowerCase()))
    )
      return status;
    if (status?.cloud) await resetSelection();
    const next = await adapter.selectCloud(selection);
    setStatus(next);
    setSearch(next.cloudEmail ?? next.targetEmail ?? "");
    setAccepted(false);
    setInvited(false);
    return next;
  }

  function focusAccount() {
    picker.openDropdown();
    if (
      status?.cloud &&
      !candidates &&
      adapter.loadCandidates &&
      !working.current
    )
      void run(async () => {
        setCandidates(await adapter.loadCandidates!());
      });
  }

  function selectMember(id: number) {
    picker.closeDropdown();
    void run(async () => {
      await selectAccount({ cloudUserId: id });
    });
  }

  function checkAccount() {
    picker.closeDropdown();
    void run(async () => {
      const next = await selectAccount(
        matchingMember
          ? { cloudUserId: matchingMember.id }
          : { cloudEmail: email },
      );
      if (next?.cloud?.state === "NEEDS_MEMBERSHIP" && !matchingMember) {
        setStatus(await adapter.invite!());
        setInvited(true);
      }
    });
  }

  function invite() {
    void run(async () => {
      setStatus(await adapter.invite!());
      setInvited(true);
    });
  }

  function cancel() {
    void run(async () => {
      await adapter.cancel!();
      onClose();
    });
  }

  function signIn() {
    onClose();
    adapter.signIn?.();
  }

  return {
    status,
    busy,
    error,
    invited,
    accepted,
    done,
    search,
    picker,
    needsMember,
    cloudDone,
    partial,
    startFromInstance,
    linked,
    cloudEmail,
    ownerAccount,
    email,
    emailValid,
    members,
    matchingMember,
    editing,
    teamName,
    local: adapter.local,
    canSelectCloud: Boolean(adapter.selectCloud),
    canInvite: Boolean(adapter.invite),
    canCancelRecovery: Boolean(
      adapter.local &&
      adapter.cancel &&
      !partial &&
      !done &&
      ["LINK_REVOKED", "TARGET_CHANGED", "TARGET_UNAVAILABLE"].some((reason) =>
        error?.includes(reason),
      ),
    ),
    canSignIn: Boolean(adapter.signIn),
    close,
    editEmail,
    setAccepted,
    focusAccount,
    selectMember,
    checkAccount,
    invite,
    cancel,
    signIn,
    refresh: () => void run(refresh),
    transfer: () => void run(transfer),
  };
}

export type OwnershipTransferFlow = ReturnType<typeof useOwnershipTransfer>;
