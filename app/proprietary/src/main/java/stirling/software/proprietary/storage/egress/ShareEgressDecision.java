package stirling.software.proprietary.storage.egress;

import java.util.List;

import stirling.software.proprietary.storage.model.ShareAccessRole;

/** What the sharing policies decided about one egress attempt; never null. */
public record ShareEgressDecision(
        boolean allowed,
        /** Human-readable reason a blocked share was refused; null when allowed. */
        String reason,
        /** The role the share may actually grant, after any policy ceiling. */
        ShareAccessRole role,
        /** Ceiling on link lifetime in days, or null to keep the configured expiry. */
        Integer maxLinkDays,
        /** Deny attachment downloads; the document may still be viewed in the browser. */
        boolean viewOnly,
        /** Whether the recipient was classified as outside the organisation. */
        boolean external,
        /** The policy that decided, for the audit trail and the refusal message; null if none. */
        String policyId,
        String policyName,
        /** Policies to run the copy through, in order. Ids, so each is its own billed run. */
        List<String> transformPolicyIds,
        /** Identity of the copy this would produce; a differently stamped cache is stale. */
        String transformFingerprint) {

    public ShareEgressDecision {
        transformPolicyIds =
                transformPolicyIds == null ? List.of() : List.copyOf(transformPolicyIds);
    }

    /** No sharing policy applies: the share proceeds exactly as the caller asked. */
    public static ShareEgressDecision unrestricted(ShareAccessRole requestedRole) {
        return new ShareEgressDecision(
                true, null, requestedRole, null, false, false, null, null, List.of(), null);
    }

    /** Refused, naming the policy so the caller can see which rule stopped them. */
    public static ShareEgressDecision blocked(EgressRule rule, String reason) {
        return new ShareEgressDecision(
                false,
                reason,
                null,
                null,
                false,
                true,
                rule.policyId(),
                rule.policyName(),
                List.of(),
                null);
    }

    /** Whether the copy that leaves must be processed before it is served. */
    public boolean transforms() {
        return !transformPolicyIds.isEmpty();
    }

    /** Must stream through the app: a signed URL would bypass this. */
    public boolean requiresManagedDelivery() {
        return viewOnly || transforms();
    }
}
