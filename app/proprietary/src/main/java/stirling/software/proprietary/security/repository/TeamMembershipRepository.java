package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.model.User;

@ApplicationScoped
public class TeamMembershipRepository implements PanacheRepositoryBase<TeamMembership, Long> {

    /** Find team membership by team ID and user ID */
    public Optional<TeamMembership> findByTeamIdAndUserId(Long teamId, Long userId) {
        return find("team.id = ?1 and user.id = ?2", teamId, userId).firstResultOptional();
    }

    /** Find all memberships for a team */
    public List<TeamMembership> findByTeamId(Long teamId) {
        return find("team.id = ?1", teamId).list();
    }

    /** Find all memberships for a user */
    public List<TeamMembership> findByUserId(Long userId) {
        return find("user.id = ?1", userId).list();
    }

    /**
     * Resolve the single membership a user belongs to, earliest-created first. In steady state
     * there is exactly one; ordering picks the primary row deterministically if multiple exist.
     */
    public List<TeamMembership> findPrimaryMembership(Long userId) {
        return find("user.id = ?1 order by createdAt asc", userId).list();
    }

    /** Find all members with a specific role in a team */
    public List<TeamMembership> findByTeamIdAndRole(Long teamId, TeamRole role) {
        return find("team.id = ?1 and role = ?2", teamId, role).list();
    }

    /** Count members with a specific role in a team. */
    public long countByTeamIdAndRole(Long teamId, TeamRole role) {
        return count("team.id = ?1 and role = ?2", teamId, role);
    }

    /** Check if a user is a member of a team */
    public boolean existsByTeamIdAndUserId(Long teamId, Long userId) {
        return find("team.id = ?1 and user.id = ?2", teamId, userId).count() > 0;
    }

    /** Count members in a team */
    public long countByTeamId(Long teamId) {
        return count("team.id = ?1", teamId);
    }

    /** Delete membership by team ID and user ID */
    @Transactional
    public void deleteByTeamIdAndUserId(Long teamId, Long userId) {
        delete("team.id = ?1 and user.id = ?2", teamId, userId);
    }

    /** Leadership checks for TeamLeadLookup. */
    public boolean existsByTeamIdAndUserIdAndRole(Long teamId, Long userId, TeamRole role) {
        return count("team.id = ?1 and user.id = ?2 and role = ?3", teamId, userId, role) > 0;
    }

    public boolean existsByUserIdAndRole(Long userId, TeamRole role) {
        return count("user.id = ?1 and role = ?2", userId, role) > 0;
    }

    /** All rows holding a role, users and teams pre-fetched for out-of-session mapping. */
    public List<TeamMembership> findByRoleFetchingUserAndTeam(TeamRole role) {
        return list(
                "SELECT tm FROM TeamMembership tm JOIN FETCH tm.user JOIN FETCH tm.team"
                        + " WHERE tm.role = ?1",
                role);
    }

    @Transactional
    public void deleteByTeamId(Long teamId) {
        delete("team.id = ?1", teamId);
    }

    @Transactional
    public void deleteByUserId(Long userId) {
        delete("user.id = ?1", userId);
    }

    // Detach invitation references so deleting the inviting user does not hit the FK.
    @Transactional
    public void clearInvitedBy(User user) {
        update("invitedBy = null where invitedBy = ?1", user);
    }
}
