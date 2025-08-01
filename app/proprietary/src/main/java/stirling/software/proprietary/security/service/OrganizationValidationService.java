package stirling.software.proprietary.security.service;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;

@Service
@RequiredArgsConstructor
public class OrganizationValidationService {

    private final TeamRepository teamRepository;

    /**
     * Validates that a user has access to a specific team. Users can only access teams within their
     * own organization.
     */
    public boolean canUserAccessTeam(User user, Team team) {
        if (user == null || team == null) {
            return false;
        }

        Organization userOrg = user.getOrganization();
        Organization teamOrg = team.getOrganization();

        if (userOrg == null || teamOrg == null) {
            return false;
        }

        return userOrg.getId().equals(teamOrg.getId());
    }

    /** Validates that a user has access to a specific team by ID. */
    public boolean canUserAccessTeam(User user, Long teamId) {
        if (user == null || teamId == null) {
            return false;
        }

        Organization userOrg = user.getOrganization();
        if (userOrg == null) {
            return false;
        }

        return teamRepository
                .findById(teamId)
                .map(team -> userOrg.getId().equals(team.getOrganization().getId()))
                .orElse(false);
    }

    /** Validates that two users belong to the same organization. */
    public boolean areUsersInSameOrganization(User user1, User user2) {
        if (user1 == null || user2 == null) {
            return false;
        }

        Organization org1 = user1.getOrganization();
        Organization org2 = user2.getOrganization();

        if (org1 == null || org2 == null) {
            return false;
        }

        return org1.getId().equals(org2.getId());
    }

    /** Validates that a team belongs to a specific organization. */
    public boolean isTeamInOrganization(Team team, Organization organization) {
        if (team == null || organization == null) {
            return false;
        }

        Organization teamOrg = team.getOrganization();
        return teamOrg != null && teamOrg.getId().equals(organization.getId());
    }
}
