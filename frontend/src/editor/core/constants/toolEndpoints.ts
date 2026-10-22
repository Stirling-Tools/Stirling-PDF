import type { ToolEndpoint } from "@app/types/toolApiTypes";

// Shared by the tool hooks and the notification retry service. The service cannot import the
// hooks that would otherwise define these: useToolOperation imports the service, so it would be
// a cycle. `satisfies` keeps each checked against the generated routes, so a rename fails here.
export const REMOVE_PASSWORD_ENDPOINT =
  "/api/v1/security/remove-password" satisfies ToolEndpoint;

export const REPAIR_ENDPOINT = "/api/v1/misc/repair" satisfies ToolEndpoint;
