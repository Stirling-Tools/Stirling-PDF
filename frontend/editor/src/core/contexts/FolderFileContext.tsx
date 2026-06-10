import { type ReactNode } from "react";

/**
 * Core stub for the Watched Folders file context.
 *
 * Watched Folders is a proprietary feature — its real provider lives in
 * `proprietary/contexts/FolderFileContext.tsx`. The core build has no Watch
 * Folders consumers, so this is a pass-through that keeps `AppProviders`
 * (shared) compiling in the open-source build without pulling the feature in.
 */
export function FolderFileContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
