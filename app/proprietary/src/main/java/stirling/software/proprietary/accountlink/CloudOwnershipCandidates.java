package stirling.software.proprietary.accountlink;

import java.util.List;

/** Eligible successors in the team authenticated by the server's device credential. */
public record CloudOwnershipCandidates(Long teamId, String teamName, List<Member> members) {
    public record Member(Long id, String name, String email) {}
}
