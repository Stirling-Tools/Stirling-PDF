package stirling.software.proprietary.access.service;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

/** Real lookup backed by team_memberships LEADER rows; wins over the no-op default bean. */
@Component
@RequiredArgsConstructor
public class MembershipTeamLeadLookup implements TeamLeadLookup {

    private final TeamMembershipRepository memberships;

    @Override
    public boolean isAnyTeamLeader(User user) {
        return user != null
                && user.getId() != null
                && memberships.existsByUserIdAndRole(user.getId(), TeamRole.LEADER);
    }

    @Override
    public boolean isLeaderOfTeam(User user, Long teamId) {
        return user != null
                && user.getId() != null
                && teamId != null
                && memberships.existsByTeamIdAndUserIdAndRole(
                        teamId, user.getId(), TeamRole.LEADER);
    }
}
