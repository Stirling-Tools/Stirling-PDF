import { useTier } from "@portal/contexts/TierContext";
import { useEditorInstalled } from "@portal/hooks/useEditorInstalled";
import { useEditorDeployment } from "@portal/queries/infrastructure";
import { usePoliciesOverview } from "@portal/queries/policies";
import { useUsersRoster } from "@portal/queries/users";

/**
 * Getting-started completion, derived live from the org's real state, composed
 * from the shared editor-deployment / policies / users queries.
 *
 * Best-effort per source: a step reads `data ?? fallback` and query errors are
 * never folded into `loading`, so an endpoint that isn't served yet (e.g.
 * editor-deployment on a bare backend) leaves its step incomplete instead of
 * breaking the card.
 */
export interface OnboardingProgress {
  loading: boolean;
  /** A real deployment is reporting in (drives the live-status header). */
  deployed: boolean;
  /** Download step done — a real deployment OR the user's own download/Done. */
  editorDone: boolean;
  policiesDone: boolean;
  /** More than just the admin on the team. */
  inviteDone: boolean;
  policiesActive: number;
  policiesRecommended: number;
  allComplete: boolean;
}

export function useOnboardingProgress(): OnboardingProgress {
  const { tier } = useTier();
  const editorInstalled = useEditorInstalled();
  const deployQuery = useEditorDeployment(tier);
  const policiesQuery = usePoliciesOverview();
  const usersQuery = useUsersRoster(tier);

  const deploy = deployQuery.data;
  const policies = policiesQuery.data;
  const users = usersQuery.data;

  const deployed = (deploy?.instances.length ?? 0) > 0;
  // Authoritative signal is a deployed instance; the user's own download/Done
  // action marks it complete immediately via the persisted flag.
  const editorDone = editorInstalled || deployed;
  const policiesActive = policies?.summary.active ?? 0;
  const policiesRecommended = Math.max(
    0,
    (policies?.summary.categories ?? 0) - policiesActive,
  );
  const policiesDone = policiesActive > 0;
  const inviteDone = (users?.summary.totalMembers ?? 0) > 1;

  return {
    loading: deployQuery.loading || policiesQuery.loading || usersQuery.loading,
    deployed,
    editorDone,
    policiesDone,
    inviteDone,
    policiesActive,
    policiesRecommended,
    allComplete: editorDone && policiesDone && inviteDone,
  };
}
