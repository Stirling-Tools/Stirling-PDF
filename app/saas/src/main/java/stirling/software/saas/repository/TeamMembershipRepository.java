package stirling.software.saas.repository;

import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.saas.model.TeamMembership;

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

    /** Find all members with a specific role in a team */
    public List<TeamMembership> findByTeamIdAndRole(Long teamId, TeamRole role) {
        return find("team.id = ?1 and role = ?2", teamId, role).list();
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
}
