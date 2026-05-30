import { useEffect } from "react";

/**
 * Core implementation: sets up the jwt-available event listener for OSS JWT auth,
 * and detects auth pages where config fetch should be skipped.
 */
export function useJwtConfigSync(fetchConfig: (force?: boolean) => void): {
  isAuthPage: boolean;
} {
  const currentPath = window.location.pathname;
  const isAuthPage =
    currentPath.includes("/login") ||
    currentPath.includes("/signup") ||
    currentPath.includes("/auth/callback") ||
    currentPath.includes("/invite/");

  useEffect(() => {
    const handleJwtAvailable = () => {
      console.debug("[AppConfig] JWT available event - refetching config");
      fetchConfig(true);
    };

    window.addEventListener("jwt-available", handleJwtAvailable);
    return () =>
      window.removeEventListener("jwt-available", handleJwtAvailable);
  }, [fetchConfig]);

  return { isAuthPage };
}
