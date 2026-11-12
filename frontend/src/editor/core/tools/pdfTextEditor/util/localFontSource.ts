/**
 * Where the editor gets the fonts installed on this device. The seam a build
 * shadows to supply them some other way than the browser's Local Font Access
 * API, which is Chromium-only and permission-gated.
 */

export type LocalFontPermission =
  | "granted"
  | "prompt"
  | "denied"
  | "unsupported";

/**
 * Resolves to the installed faces: objects carrying `family`, `fullName`,
 * `style` and `postscriptName`, plus a `blob()` resolving to something with
 * an `arrayBuffer()` of the font file.
 * May prompt, and rejects when the user refuses.
 */
export type QueryLocalFonts = () => Promise<unknown[]>;

/** The query for this device's fonts, or null when there is no way to ask. */
export function localFontQuery(): QueryLocalFonts | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { queryLocalFonts?: QueryLocalFonts };
  if (typeof w.queryLocalFonts !== "function") return null;
  // Bound: Chrome throws "Illegal invocation" when the method is detached.
  return w.queryLocalFonts.bind(w);
}

async function permissionStatus(): Promise<PermissionStatus | null> {
  try {
    return await navigator.permissions.query({
      name: "local-fonts" as PermissionName,
    });
  } catch {
    return null;
  }
}

/** Whether running the query would prompt. Never prompts itself. */
export async function localFontPermission(): Promise<LocalFontPermission> {
  if (!localFontQuery()) return "unsupported";
  return (await permissionStatus())?.state ?? "prompt";
}

/**
 * Calls `listener` each time the permission changes. It is not called with the
 * current value: read that with {@link localFontPermission}. Registers nothing
 * when there is no way to ask for fonts. The returned function stops the
 * watch, including one whose registration is still pending.
 */
export function watchLocalFontPermission(
  listener: (permission: LocalFontPermission) => void,
): () => void {
  if (!localFontQuery()) return () => {};
  let status: PermissionStatus | null = null;
  let stopped = false;
  const onChange = () => {
    if (status) listener(status.state);
  };
  void permissionStatus().then((s) => {
    if (stopped || !s) return;
    status = s;
    s.addEventListener("change", onChange);
  });
  return () => {
    stopped = true;
    status?.removeEventListener("change", onChange);
  };
}
