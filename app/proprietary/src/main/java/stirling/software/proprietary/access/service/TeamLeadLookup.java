package stirling.software.proprietary.access.service;

import stirling.software.proprietary.security.model.User;

/** Resolves whether a user leads a team. */
public interface TeamLeadLookup {

    /** Whether the user leads at least one team. */
    boolean isAnyTeamLeader(User user);

    /** Whether the user leads the given team. */
    boolean isLeaderOfTeam(User user, Long teamId);
}
