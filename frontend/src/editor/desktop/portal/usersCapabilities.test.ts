import { expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ mode: "selfhosted" as "saas" | "selfhosted" }));
vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: { getCachedMode: () => h.mode },
}));

import { usersCapabilities } from "@editor/portal/usersCapabilities";
import { usersCapabilities as cloud } from "@processor-cloud/usersCapabilities";
import { usersCapabilities as server } from "@editor-proprietary/portal/usersCapabilities";

it("reads each flag from the edition the connection runs", () => {
  h.mode = "selfhosted";
  expect(usersCapabilities.removeScope).toBe(server.removeScope);
  expect({ ...usersCapabilities }).toEqual(server);

  h.mode = "saas";
  expect(usersCapabilities.removeScope).toBe(cloud.removeScope);
  expect({ ...usersCapabilities }).toEqual(cloud);
});
