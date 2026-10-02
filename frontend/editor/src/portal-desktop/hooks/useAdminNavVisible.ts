import { useAdminNavVisible as useCloudAdminNavVisible } from "@portal-cloud/hooks/useAdminNavVisible";
import { useAdminNavVisible as useServerAdminNavVisible } from "@portal-proprietary/hooks/useAdminNavVisible";
import { editionHook } from "@portal/edition";

export const useAdminNavVisible = editionHook(
  useCloudAdminNavVisible,
  useServerAdminNavVisible,
);
