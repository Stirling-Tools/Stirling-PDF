import { useAppConfig } from "@editor/contexts/AppConfigContext";

/** The executing server's default; omitting the endpoint selects the connected policy server. */
export function useOfficeConversionDefault(_endpointName?: string): boolean {
  const { config } = useAppConfig();
  return Boolean(config?.stirlingOfficeConversion);
}
