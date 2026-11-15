import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useLocalProcessingOnly } from "@editor/hooks/useLocalProcessingOnly";
import { useSaasAppConfig } from "@editor/hooks/useSaasAppConfig";
import { useSaaSMode } from "@editor/hooks/useSaaSMode";
import { useToolCloudStatus } from "@editor/hooks/useToolCloudStatus";

/** Local tools follow local config; cloud-routed tools and SaaS policies follow cloud config. */
export function useOfficeConversionDefault(endpointName?: string): boolean {
  const { config } = useAppConfig();
  const localOnly = useLocalProcessingOnly();
  const saas = useSaaSMode();
  const routedToCloud = useToolCloudStatus(endpointName);
  const cloud =
    !localOnly && saas && (endpointName === undefined || routedToCloud);
  const cloudConfig = useSaasAppConfig(cloud);
  return Boolean((cloud ? cloudConfig : config)?.stirlingOfficeConversion);
}
