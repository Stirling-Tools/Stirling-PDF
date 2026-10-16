import { TOOL_ENDPOINTS, type ToolEndpoint } from "@app/types/toolApiTypes";
import { CONVERSION_ENDPOINTS } from "@app/constants/convertConstants";

// Shared by the tool hooks and the notification retry service. The service cannot import the
// hooks that would otherwise define these: useToolOperation imports the service, so it would be
// a cycle. `satisfies` keeps each checked against the generated routes, so a rename fails here.
export const REMOVE_PASSWORD_ENDPOINT =
  "/api/v1/security/remove-password" satisfies ToolEndpoint;

export const REPAIR_ENDPOINT = "/api/v1/misc/repair" satisfies ToolEndpoint;

/**
 * Registry endpoint names that are not the last segment of the path they address. Listed rather
 * than derived; `toolEndpoints.test.ts` fails if one drifts from the tool's own operation config.
 */
const PATH_BY_NAME_EXCEPTIONS = {
  "form-detection": "/api/v1/form/form-detection/detect",
  "overlay-pdf": "/api/v1/general/overlay-pdfs",
} as const satisfies Record<string, ToolEndpoint>;

/**
 * Registry entries name their API with the backend's short endpoint names (`"compress-pdf"`),
 * while the operations themselves address full paths. Deriving the path here keeps the boot
 * registry free of a second copy of every route: a registered name either ends the path it
 * addresses, or is a conversion key, whose path is spelled out in {@link CONVERSION_ENDPOINTS}.
 *
 * Conversion *names* (`"pdf-to-img"`) are deliberately not in here: only the convert tool
 * registers them, and its operation resolves its endpoint from the chosen formats rather than
 * from the registry.
 */
const PATH_BY_NAME: ReadonlyMap<string, string> = buildPathByName();

function buildPathByName(): ReadonlyMap<string, string> {
  const map = new Map<string, string>(Object.entries(PATH_BY_NAME_EXCEPTIONS));
  for (const [formatKey, path] of Object.entries(CONVERSION_ENDPOINTS)) {
    if (!map.has(formatKey)) map.set(formatKey, path);
  }
  for (const path of TOOL_ENDPOINTS) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (!map.has(name)) map.set(name, path);
  }
  return map;
}

/**
 * Resolve a registry `endpoints` name to the request path it addresses. A value that is already
 * a path is returned unchanged, so callers can pass either. Returns undefined for a name no
 * registered route ends with, which callers treat as "unknown endpoint".
 */
export function toolEndpointPath(
  nameOrPath: string | undefined,
): string | undefined {
  if (!nameOrPath) return undefined;
  if (nameOrPath.startsWith("/")) return nameOrPath;
  return PATH_BY_NAME.get(nameOrPath);
}
