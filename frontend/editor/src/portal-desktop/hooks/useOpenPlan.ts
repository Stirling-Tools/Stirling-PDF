import { useOpenPlan as useCloudOpenPlan } from "@portal-cloud/hooks/useOpenPlan";
import { useOpenPlan as useServerOpenPlan } from "@portal-proprietary/hooks/useOpenPlan";
import { editionHook } from "@portal/edition";

export const useOpenPlan = editionHook(useCloudOpenPlan, useServerOpenPlan);
