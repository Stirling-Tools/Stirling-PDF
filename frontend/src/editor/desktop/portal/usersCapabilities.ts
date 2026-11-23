import type { UsersCapabilities } from "@processor/api/usersCapabilities";
import { usersCapabilities as cloud } from "@processor-cloud/usersCapabilities";
import { usersCapabilities as server } from "@editor-proprietary/portal/usersCapabilities";
import { currentEdition } from "@processor/edition";

/**
 * Team-leader scope on Stirling Cloud, org-admin scope on a self-hosted server.
 * Callers read the flags at render or call time, so each one is a getter that
 * follows the connection; a value copied at module load would not.
 */
export const usersCapabilities = Object.defineProperties(
  {},
  Object.fromEntries(
    (Object.keys(server) as (keyof UsersCapabilities)[]).map((key) => [
      key,
      {
        enumerable: true,
        get: () => (currentEdition() === "cloud" ? cloud : server)[key],
      },
    ]),
  ),
) as UsersCapabilities;
