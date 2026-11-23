import { useEffect } from "react";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useBackendHealth } from "@editor/hooks/useBackendHealth";
import { endpointAvailabilityService } from "@editor/services/endpointAvailabilityService";

/**
 * Desktop caches the bundled backend's capabilities for five minutes, so an
 * earlier story's server answer would stand in for this story's. Clears the
 * cache's private entry: the service offers no reset, and must keep the field
 * name `local` for this to work.
 */
export function forgetEarlierStories(): void {
  Object.assign(endpointAvailabilityService, { local: null });
}

/**
 * Desktop fetches the app config when the bundled backend turns healthy. The
 * backend service lives for the whole page, so only the first story sees that
 * happen and every later one would render on the bundled defaults. Each story
 * fetches once the backend is healthy, as a fresh launch does.
 */
export function FreshLaunch() {
  const { status } = useBackendHealth();
  const { refetch, configFromServer } = useAppConfig();
  useEffect(() => {
    if (status === "healthy" && !configFromServer) void refetch();
  }, [status, configFromServer, refetch]);
  return null;
}
