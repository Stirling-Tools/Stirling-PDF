import { useFreeCreditsSummary as useCloudFreeCreditsSummary } from "@processor-cloud/hooks/useFreeCreditsSummary";
import { useFreeCreditsSummary as useServerFreeCreditsSummary } from "@processor-proprietary/hooks/useFreeCreditsSummary";
import { editionHook } from "@processor/edition";

export const useFreeCreditsSummary = editionHook(
  useCloudFreeCreditsSummary,
  useServerFreeCreditsSummary,
);
