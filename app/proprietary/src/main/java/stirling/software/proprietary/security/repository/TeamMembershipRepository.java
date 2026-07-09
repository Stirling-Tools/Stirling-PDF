package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.model.User;

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
     * Resolve the single membership a user belongs to. In the PAYG design every user is owned by
     * exactly one team — personal-team-for-new-signups, then optionally migrated when they accept
     * an invite (the old personal team is deleted on accept). For diagnostic safety this picks the
     * earliest-created row if multiple exist, but in steady state there is exactly one.
     *
     * <p>Returns both the team and its role so the PAYG wallet endpoint can answer "what does this
     * user see?" in a single query rather than a list-then-filter dance.
     *
     * @param userId the user ID
     * @return the user's primary membership, if any
     */
    @Query(
            "SELECT tm FROM TeamMembership tm JOIN FETCH tm.team"
                    + " WHERE tm.user.id = :userId"
                    + " ORDER BY tm.createdAt ASC")
    List<TeamMembership> findPrimaryMembership(@Param("userId") Long userId);

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
     * Count members with a specific role in a team. Lighter than {@link #findByTeamIdAndRole} when
     * only the tally is needed (e.g. last-leader checks) — avoids fetching and join-loading rows.
     *
     * @param teamId the team ID
     * @param role the team role (LEADER or MEMBER)
     * @return number of members with that role
     */
    long countByTeamIdAndRole(Long teamId, TeamRole role);

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

    /** Leadership checks for TeamLeadLookup. */
    boolean existsByTeamIdAndUserIdAndRole(Long teamId, Long userId, TeamRole role);

    boolean existsByUserIdAndRole(Long userId, TeamRole role);

    /** All rows holding a role, users and teams pre-fetched for out-of-session mapping. */
    @Query(
            "SELECT tm FROM TeamMembership tm JOIN FETCH tm.user JOIN FETCH tm.team"
                    + " WHERE tm.role = :role")
    List<TeamMembership> findByRoleFetchingUserAndTeam(@Param("role") TeamRole role);

    void deleteByTeamId(Long teamId);

    void deleteByUserId(Long userId);

    // Detach invitation references so deleting the inviting user does not hit the FK.
    @Modifying
    @Query("update TeamMembership tm set tm.invitedBy = null where tm.invitedBy = :user")
    void clearInvitedBy(@Param("user") User user);
}
