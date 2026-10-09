import { useFreeCreditsSummary as useCloudFreeCreditsSummary } from "@portal-cloud/hooks/useFreeCreditsSummary";
import { useFreeCreditsSummary as useServerFreeCreditsSummary } from "@portal-proprietary/hooks/useFreeCreditsSummary";
import { editionHook } from "@portal/edition";

export const useFreeCreditsSummary = editionHook(
  useCloudFreeCreditsSummary,
  useServerFreeCreditsSummary,
);
