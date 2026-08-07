import { http, HttpResponse, delay } from "msw";
import { buildAdminSettingsData } from "@portal/mocks/users";

/** Mock mode serves the REAL routes the users view reads and mutates. */
export const usersHandlers = [
  http.get("/api/v1/proprietary/ui-data/admin-settings", async () => {
    await delay(120);
    return HttpResponse.json(buildAdminSettingsData("pro"));
  }),
  // Row-action mutations: acknowledge so mock mode doesn't fall through to a real backend.
  http.post("/api/v1/user/admin/changeRole", () =>
    HttpResponse.json({ message: "Role updated" }),
  ),
  http.post("/api/v1/user/admin/inviteUsers", () =>
    HttpResponse.json({ successCount: 1, failureCount: 0 }),
  ),
  http.post("/api/v1/user/admin/changeUserEnabled/:username", () =>
    HttpResponse.json({ message: "Updated" }),
  ),
  http.post("/api/v1/user/admin/deleteUser/:username", () =>
    HttpResponse.json({ message: "Deleted" }),
  ),
  http.post("/api/v1/team/setOwner", () =>
    HttpResponse.json({ message: "Owner assigned" }),
  ),
  http.post("/api/v1/team/removeOwner", () =>
    HttpResponse.json({ message: "Owner removed" }),
  ),
];
