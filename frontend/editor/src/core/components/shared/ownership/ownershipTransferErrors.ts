import type { TFunction } from "i18next";

/** Resolves recovery guidance without hiding a specific failure after cloud completion. */
export function ownershipErrorText(
  t: TFunction,
  error: string | null,
  partial: boolean,
) {
  if (error?.includes("ACCOUNT_LINK_DISABLED"))
    return t(
      "ownership.accountLinkDisabled",
      "This server still has a cloud link, but account linking is turned off. Ask the server operator to enable account linking, then resume this transfer or unlink the server in settings.",
    );
  if (error?.includes("LINK_REVOKED"))
    return t(
      "ownership.linkRevoked",
      "This server's cloud link is no longer valid. Cancel the transfer, then reconnect your Stirling account in settings. Ownership will not change.",
    );
  if (error?.includes("FINISH_LOCAL_TRANSFER"))
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
    return partial
      ? t(
          "ownership.partialTargetChanged",
          "Restore the selected server user's access and original account details, then finish the server transfer. Cloud ownership has already transferred.",
        )
      : t(
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
  if (partial)
    return t(
      "ownership.partialError",
      "Cloud ownership has transferred. Finish the server transfer to keep both owners aligned.",
    );
  return t(
    "ownership.error",
    "We couldn't complete this step. Check the recipient is active and the server is connected, then check again. A pending transfer can be resumed here.",
  );
}
