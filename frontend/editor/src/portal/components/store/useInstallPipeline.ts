import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@portal/api/http";
import { isSaasBuild } from "@portal/api/saasApiBase";
import {
  fetchStoreManifest,
  importStorePipeline,
  recordStoreInstall,
} from "@portal/api/store";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { useConnectGate } from "@portal/hooks/useConnectGate";
import { qk } from "@portal/queries/keys";

/**
 * Installing is a plain copy with no modal: fetch the manifest from the store, import it as a
 * paused pipeline on this instance (the team, on the SaaS build), count the install best-effort,
 * and land in the builder where the missing source, destination and settings are already
 * called out. An unlinked self-hosted portal is asked to connect instead.
 */
export function useInstallPipeline() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { guard } = useConnectGate();
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (storeId: string) => {
      if (installingId) return;
      setInstallingId(storeId);
      setError(null);
      try {
        const manifest = await fetchStoreManifest(storeId);
        const policy = await importStorePipeline({
          name: manifest.name,
          icon: manifest.icon,
          storeId,
          steps: manifest.steps,
        });
        void recordStoreInstall(
          storeId,
          isSaasBuild() ? "team" : "server",
        ).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: qk.pipelines() });
        void queryClient.invalidateQueries({ queryKey: qk.policiesList() });
        navigate(
          `${toPortalPath(VIEW_PATHS.pipelines)}/${encodeURIComponent(policy.id ?? "")}`,
        );
      } catch (e) {
        setError(errorMessage(e));
        setInstallingId(null);
      }
    },
    [installingId, navigate, queryClient],
  );

  const install = guard((storeId: string) => {
    void run(storeId);
  });

  return { install, installingId, error };
}
