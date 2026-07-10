import { useTier } from "@portal/contexts/TierContext";
import { useAsync } from "@portal/hooks/useAsync";
import { fetchEditorDeployment } from "@portal/api/editorDeploy";
import { fetchPolicies } from "@portal/api/policies";
import { fetchUsers } from "@portal/api/users";

/**
 * Getting-started completion, derived live from the org's real state. Drives
 * both the per-step checks on the home hero's setup steps and the collapse to
 * the deployed-status header once every step is done.
 *
 * Each fetch is independently best-effort: an endpoint that isn't served yet
 * (e.g. editor-deployment on a bare backend) simply leaves its step incomplete
 * rather than breaking the card.
 */
export interface OnboardingProgress {
  loading: boolean;
  /** Editor deployed (at least one instance reporting in). */
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
  const { data, loading } = useAsync(
    () =>
      Promise.all([
        fetchEditorDeployment(tier).catch(() => null),
        fetchPolicies().catch(() => null),
        fetchUsers(tier).catch(() => null),
      ]),
    [tier],
  );

  const [deploy, policies, users] = data ?? [null, null, null];

  const editorDone = (deploy?.instances.length ?? 0) > 0;
  const policiesActive = policies?.summary.active ?? 0;
  const policiesRecommended = Math.max(
    0,
    (policies?.summary.categories ?? 0) - policiesActive,
  );
  const policiesDone = policiesActive > 0;
  const inviteDone = (users?.summary.totalMembers ?? 0) > 1;

  return {
    loading,
    editorDone,
    policiesDone,
    inviteDone,
    policiesActive,
    policiesRecommended,
    allComplete: editorDone && policiesDone && inviteDone,
  };
}
