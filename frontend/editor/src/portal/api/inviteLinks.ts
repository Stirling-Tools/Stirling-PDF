import { apiClient } from "@portal/api/http";

/**
 * Invite links (self-hosted). A link is a token an admin hands out; the account
 * is created when someone redeems it, unlike an email invite which creates the
 * account up front. Backed by InviteLinkController's admin endpoints, all of
 * which need `mail.enableInvites` - but not SMTP, unless the link is emailed.
 */
export interface GenerateInviteLinkParams {
  /** Binds the link to one address; omitted for a link anyone can redeem. */
  email?: string;
  role: "ROLE_USER" | "ROLE_ADMIN";
  teamId?: number;
  expiryHours?: number;
  /** Mail the link to `email`; requires SMTP. */
  sendEmail?: boolean;
  /** Where the /invite/<token> URL should point when the server has no configured URL. */
  frontendBaseUrl?: string;
}

export interface GeneratedInviteLink {
  token: string;
  inviteUrl: string;
  email: string | null;
  expiresAt: string;
  expiryHours: number;
  /** Present only when sendEmail was requested; false means the mail never left. */
  emailSent?: boolean;
  emailError?: string;
}

export interface InviteLink {
  id: number;
  /** null on a general link - anyone holding it can redeem it. */
  email: string | null;
  role: string;
  teamId?: number;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

export async function generateInviteLink(
  p: GenerateInviteLinkParams,
): Promise<GeneratedInviteLink> {
  const params: Record<string, string> = { role: p.role };
  if (p.email) params.email = p.email;
  if (p.teamId != null) params.teamId = String(p.teamId);
  if (p.expiryHours != null) params.expiryHours = String(p.expiryHours);
  if (p.sendEmail) params.sendEmail = "true";
  params.frontendBaseUrl = p.frontendBaseUrl ?? window.location.origin;
  return apiClient.local.form<GeneratedInviteLink>(
    "/api/v1/invite/generate",
    params,
  );
}

/** Links issued but not yet redeemed or expired. */
export async function listInviteLinks(): Promise<InviteLink[]> {
  const data = await apiClient.local.json<{ invites?: InviteLink[] }>(
    "/api/v1/invite/list",
  );
  return data.invites ?? [];
}

export async function revokeInviteLink(inviteId: number): Promise<void> {
  await apiClient.local.json(`/api/v1/invite/revoke/${inviteId}`, {
    method: "DELETE",
  });
}
