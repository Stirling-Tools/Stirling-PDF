import { useOpenPlan as useCloudOpenPlan } from "@processor-cloud/hooks/useOpenPlan";
import { useOpenPlan as useServerOpenPlan } from "@processor-proprietary/hooks/useOpenPlan";
import { editionHook } from "@processor/edition";

export const useOpenPlan = editionHook(useCloudOpenPlan, useServerOpenPlan);
