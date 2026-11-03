import { useAdminNavVisible as useCloudAdminNavVisible } from "@processor-cloud/hooks/useAdminNavVisible";
import { useAdminNavVisible as useServerAdminNavVisible } from "@processor-proprietary/hooks/useAdminNavVisible";
import { editionHook } from "@processor/edition";

export const useAdminNavVisible = editionHook(
  useCloudAdminNavVisible,
  useServerAdminNavVisible,
);
