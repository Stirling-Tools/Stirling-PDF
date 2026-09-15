package stirling.software.proprietary.policy.config;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.asset.PolicyAsset;
import stirling.software.proprietary.policy.asset.PolicyAssetStore;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Policies are scoped to a team: a user may view, run, edit, and delete only the policies belonging
 * to their own team (the team a policy is stamped with at creation). This binds everyone — admins
 * included — so no one sees or touches another team's policies. <em>Whether</em> a user may edit
 * (vs only view/run) is a separate check gated at the controller ({@code
 * PolicyController#requirePolicyEditingAllowed} → team leader). Enforced only when login is
 * enabled; single-user deployments (login disabled) pass every check.
 */
@Component
@RequiredArgsConstructor
public class PolicyAccessGuard {

    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;
    private final PolicyManagementAuthority policyManagementAuthority;

    /** Owner for a new policy: the current user, or {@code null} when login is disabled. */
    public String ownerForNewPolicy() {
        return enforced() ? userService.getCurrentUsername() : null;
    }

    /** Team a new policy is stamped with — the creator's team. {@code null} when login disabled. */
    public Long teamForNewPolicy() {
        return enforced() ? policyManagementAuthority.currentUserTeamId() : null;
    }

    /**
     * Whether the caller may view/run/edit this record: team membership for a policy. A
     * processing-folder pair is personal, not team governance, so only its owner reaches it {@code
     * -} teammates and team leaders alike do not.
     */
    public boolean canAccess(Policy policy) {
        if (!enforced()) {
            return true;
        }
        if (Policy.SURFACE_PROCESSING_FOLDER.equals(policy.surface())) {
            return ownedByCurrentUser(policy);
        }
        return Objects.equals(policy.teamId(), policyManagementAuthority.currentUserTeamId());
    }

    /**
     * Owner match for a personal record, fail-closed: a row with no stamped owner belongs to nobody
     * under login. Treating a null owner as anyone's would expose a legacy or mis-stamped folder to
     * every authenticated user, since this surface is owner-scoped, not team-scoped. The rows this
     * rejects are {@link #isOrphaned orphaned}, and the engine must refuse to run them.
     */
    private boolean ownedByCurrentUser(Policy policy) {
        return policy.owner() != null
                && Objects.equals(policy.owner(), userService.getCurrentUsername());
    }

    /**
     * Whether owner scoping leaves this processing folder reachable by nobody, so the engine can
     * refuse to run it rather than replace files in place in a folder no one can list, pause,
     * revert or delete.
     *
     * <p>Two ways in: a folder created while login was disabled is stamped with no owner, and
     * enabling login later strands it; a folder whose owner was renamed or deleted is stamped with
     * a name that no longer resolves. Existence is read by exact name, the same way {@link
     * #ownedByCurrentUser} matches, so a different case in the users table does not rescue it.
     */
    public boolean isOrphaned(Policy policy) {
        if (!enforced() || !Policy.SURFACE_PROCESSING_FOLDER.equals(policy.surface())) {
            return false;
        }
        return policy.owner() == null || !userService.usernameExists(policy.owner());
    }

    /**
     * The policies visible to the caller: their whole team's, loaded scoped rather than fetched
     * globally and filtered, so on SaaS it never pulls another team's policies into memory. Login
     * disabled (single-user) returns everything.
     */
    public List<Policy> visibleFrom(PolicyStore store) {
        // Processing-folder pairs share the store but belong to their own surface; nothing
        // that lists policies may see them, so the exclusion lives here, not at each caller.
        return scopedRows(store).stream()
                .filter(policy -> Policy.SURFACE_POLICY.equals(policy.surface()))
                .toList();
    }

    /**
     * The processing folders visible to the caller: of the team's rows, only the ones the caller
     * owns, since these are personal records. Login disabled returns them all.
     */
    public List<Policy> visibleProcessingFolders(PolicyStore store) {
        return scopedRows(store).stream()
                .filter(policy -> Policy.SURFACE_PROCESSING_FOLDER.equals(policy.surface()))
                .filter(policy -> !enforced() || ownedByCurrentUser(policy))
                .toList();
    }

    private List<Policy> scopedRows(PolicyStore store) {
        if (!enforced()) {
            return store.all();
        }
        return store.findByTeam(policyManagementAuthority.currentUserTeamId());
    }

    /** Whether the stored asset belongs to the current user's team (same rule as policies). */
    public boolean canAccess(PolicyAsset asset) {
        if (!enforced()) {
            return true;
        }
        return Objects.equals(asset.teamId(), policyManagementAuthority.currentUserTeamId());
    }

    /** The stored assets visible to the caller, scoped exactly like {@link #visibleFrom}. */
    public List<PolicyAsset> visibleFrom(PolicyAssetStore store) {
        if (!enforced()) {
            return store.all();
        }
        return store.findByTeam(policyManagementAuthority.currentUserTeamId());
    }

    private boolean enforced() {
        return applicationProperties.getSecurity().isEnableLogin();
    }
}
