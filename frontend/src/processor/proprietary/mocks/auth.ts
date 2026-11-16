/**
 * Mock auth fixtures for the portal's design-prototype mode.
 *
 * When mocks are enabled (the default in dev), the portal seeds the mock token
 * below and the MSW auth handlers answer /api/v1/auth/* with this admin, so the
 * real auth gate + provider resolve to a signed-in admin without a backend.
 * When mocks are off (production), real auth against the Spring backend applies.
 */

export interface MockUser {
  id: string;
  email: string;
  username: string;
  role: string;
  enabled: boolean;
  authenticationType: string;
}

export const MOCK_ADMIN: MockUser = {
  id: "mock-admin",
  email: "admin@stirling.local",
  username: "admin",
  role: "ROLE_ADMIN",
  enabled: true,
  authenticationType: "WEB",
};

const base64Url = (value: object): string =>
  btoa(JSON.stringify(value))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

/** A decodable (but unsigned) JWT so the client's exp/iat handling stays quiet. */
function buildMockToken(): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64Url({ alg: "none", typ: "JWT" });
  const payload = base64Url({
    sub: MOCK_ADMIN.id,
    role: MOCK_ADMIN.role,
    iat: nowSeconds,
    exp: nowSeconds + 86400,
  });
  return `${header}.${payload}.mock-signature`;
}

export const MOCK_TOKEN = buildMockToken();

export const MOCK_SESSION = {
  access_token: MOCK_TOKEN,
  expires_in: 86400,
};
