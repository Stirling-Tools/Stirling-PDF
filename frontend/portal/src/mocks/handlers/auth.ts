import { http, HttpResponse, delay } from "msw";
import { MOCK_ADMIN, MOCK_SESSION } from "@portal/mocks/auth";

/**
 * Mock auth endpoints mirroring the Spring backend's contract. In mock mode the
 * portal seeds a token, so GET /api/v1/auth/me resolves to an admin and the
 * gate lets the dashboards through without a real backend.
 */
export const authHandlers = [
  http.get("/api/v1/auth/me", async () => {
    await delay(60);
    return HttpResponse.json({ user: MOCK_ADMIN });
  }),

  http.post("/api/v1/auth/login", async () => {
    await delay(120);
    return HttpResponse.json({ user: MOCK_ADMIN, session: MOCK_SESSION });
  }),

  http.post("/api/v1/auth/refresh", async () => {
    await delay(60);
    return HttpResponse.json({ user: MOCK_ADMIN, session: MOCK_SESSION });
  }),

  http.post("/api/v1/auth/logout", async () => {
    await delay(40);
    return HttpResponse.json({ message: "Logged out successfully" });
  }),

  http.get("/api/v1/proprietary/ui-data/login", async () => {
    await delay(40);
    return HttpResponse.json({
      enableLogin: true,
      loginMethod: "all",
      providerList: {},
    });
  }),
];
