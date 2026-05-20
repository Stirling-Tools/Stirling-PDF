package stirling.software.saas.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.saas.model.TeamMembership;

@Repository
public interface TeamMembershipRepository extends JpaRepository<TeamMembership, Long> {

    /**
     * Find team membership by team ID and user ID
     *
     * @param teamId the team ID
     * @param userId the user ID
     * @return Optional of TeamMembership if found
     */
    Optional<TeamMembership> findByTeamIdAndUserId(Long teamId, Long userId);

    /**
     * Find all memberships for a team
     *
     * @param teamId the team ID
     * @return List of team memberships
     */
    @Query("SELECT tm FROM TeamMembership tm JOIN FETCH tm.user WHERE tm.team.id = :teamId")
    List<TeamMembership> findByTeamId(@Param("teamId") Long teamId);

    /**
     * Find all memberships for a user (typically just one for personal team, but can be multiple if
     * invited to other teams)
     *
     * @param userId the user ID
     * @return List of team memberships
     */
    @Query("SELECT tm FROM TeamMembership tm JOIN FETCH tm.team WHERE tm.user.id = :userId")
    List<TeamMembership> findByUserId(@Param("userId") Long userId);

    /**
     * Find all members with a specific role in a team
     *
     * @param teamId the team ID
     * @param role the team role (LEADER or MEMBER)
     * @return List of team memberships
     */
    @Query(
            "SELECT tm FROM TeamMembership tm JOIN FETCH tm.user WHERE tm.team.id = :teamId AND tm.role = :role")
    List<TeamMembership> findByTeamIdAndRole(
            @Param("teamId") Long teamId, @Param("role") TeamRole role);

    /**
     * Check if a user is a member of a team
     *
     * @param teamId the team ID
     * @param userId the user ID
     * @return true if user is a member
     */
    boolean existsByTeamIdAndUserId(Long teamId, Long userId);

    /**
     * Count members in a team
     *
     * @param teamId the team ID
     * @return number of members
     */
    long countByTeamId(Long teamId);

    /**
     * Delete membership by team ID and user ID
     *
     * @param teamId the team ID
     * @param userId the user ID
     */
    void deleteByTeamIdAndUserId(Long teamId, Long userId);
}
