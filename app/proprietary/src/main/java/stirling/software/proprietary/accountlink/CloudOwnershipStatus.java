package stirling.software.proprietary.accountlink;

/** Live team membership, scoped to the authenticated linked instance or SaaS team. */
public record CloudOwnershipStatus(
        Long teamId,
        String teamName,
        Long leaderUserId,
        Long targetUserId,
        long linkedInstances,
        boolean subscribed,
        State state) {
    public enum State {
        NEEDS_MEMBERSHIP,
        READY,
        TRANSFERRED
    }
}
