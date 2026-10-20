import { withBasePath } from "@app/constants/app";

/** Sends an enforced-company response to the local sign-in ceremony from either app surface. */
export function reportCompanySsoRequired(
  status: number | undefined,
  body: unknown,
): void {
  if (
    status !== 403 ||
    !body ||
    typeof body !== "object" ||
    !("code" in body) ||
    body.code !== "COMPANY_SSO_REQUIRED"
  )
    return;
  const connection = "connectionId" in body ? body.connectionId : null;
  const query =
    typeof connection === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      connection,
    )
      ? `?connection=${encodeURIComponent(connection)}`
      : "";
  window.location.assign(withBasePath(`/company-sso${query}`));
}
