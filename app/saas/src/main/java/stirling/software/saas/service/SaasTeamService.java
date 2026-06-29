package stirling.software.saas.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.InvitationStatus;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.saas.accountlink.LinkedInstanceRepository;
import stirling.software.saas.billing.repository.BillingSubscriptionRepository;
import stirling.software.saas.config.SupabaseConfigurationProperties;
import stirling.software.saas.model.TeamInvitation;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;
import stirling.software.saas.repository.TeamInvitationRepository;
import stirling.software.saas.repository.TeamMembershipRepository;

/** SaaS-only team management: invitations, personal teams, seat caps, paid-subscription gating. */
@Service
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class SaasTeamService {

    private final TeamRepository teamRepository;
    private final TeamMembershipRepository membershipRepository;
    private final TeamInvitationRepository invitationRepository;
    private final UserRepository userRepository;
    private final BillingSubscriptionRepository billingSubscriptionRepository;
    private final RestTemplate restTemplate;
    private final RateLimitService rateLimitService;
    private final SupabaseConfigurationProperties supabaseConfig;
    private final UserRoleService userRoleService;
    private final SaasTeamExtensionService saasTeamExtensionService;
    private final SaasTeamExtensionsRepository saasTeamExtensionsRepository;
    private final LinkedInstanceRepository linkedInstanceRepository;
    private final stirling.software.proprietary.security.service.UserService userService;

    public static final String DEFAULT_TEAM_NAME = "Default";
    public static final String INTERNAL_TEAM_NAME = "Internal";

    /** Returns the user's personal team, creating one if they have none. Idempotent. */
    @Transactional
    public Team ensurePersonalTeam(User user) {
        Team existing = user.getTeam();
        if (existing != null && saasTeamExtensionService.isPersonal(existing)) {
            return existing;
        }
        return createPersonalTeam(user);
    }

    /**
     * Create personal team for new user during signup or migrate existing user from Default team
     *
     * @param user the user
     * @return created Team
     */
    @Transactional
    public Team createPersonalTeam(User user) {
        final long userId = user.getId();
        // Refetch so the entity is managed by the current session.
        user =
                userRepository
                        .findById(userId)
                        .orElseThrow(
                                () -> new IllegalArgumentException("User not found: " + userId));

        String personalTeamName = "My Team";

        Team team = new Team();
        team.setName(personalTeamName);
        Team savedTeam = teamRepository.save(team);

        saasTeamExtensionService.setPersonal(savedTeam, true);
        saasTeamExtensionService.setSeats(savedTeam, 1, 1);
        saasTeamExtensionService.setCreatedByUserId(savedTeam, user.getId());
        saasTeamExtensionsRepository.incrementSeatsUsed(savedTeam.getId());

        // Create membership
        TeamMembership membership = new TeamMembership();
        membership.setTeam(savedTeam);
        membership.setUser(user);
        membership.setRole(TeamRole.LEADER);
        membership.setInvitedAt(LocalDateTime.now());
        membership.setAcceptedAt(LocalDateTime.now());
        membershipRepository.save(membership);

        // Update user's team_id to point to personal team
        Team oldTeam = user.getTeam();
        user.setTeam(savedTeam);
        userRepository.save(user);

        // Clean up old Default/Internal team membership
        if (oldTeam != null
                && (DEFAULT_TEAM_NAME.equals(oldTeam.getName())
                        || INTERNAL_TEAM_NAME.equals(oldTeam.getName()))) {
            membershipRepository.deleteByTeamIdAndUserId(oldTeam.getId(), user.getId());

            // Note: We intentionally leave the Default/Internal team in the database even if empty
            // Deleting it within the same transaction causes Hibernate session management issues
            // Empty system teams are harmless and can be cleaned up manually if needed
        }

        log.debug("Created personal team {} for user {}", savedTeam.getId(), user.getId());
        return savedTeam;
    }

    /**
     * Invite user to team (sends email via Supabase Edge Function)
     *
     * @param teamId the team ID
     * @param inviteeEmail the invitee's email
     * @param inviter the user sending the invitation
     * @return created TeamInvitation
     */
    @Transactional
    public TeamInvitation inviteUserToTeam(Long teamId, String inviteeEmail, User inviter) {
        Team team =
                teamRepository
                        .findById(teamId)
                        .orElseThrow(() -> new IllegalArgumentException("Team not found"));

        // Validate: inviter is team leader
        TeamMembership inviterMembership =
                membershipRepository
                        .findByTeamIdAndUserId(teamId, inviter.getId())
                        .orElseThrow(
                                () -> new SecurityException("You are not a member of this team"));

        if (!inviterMembership.isLeader()) {
            throw new SecurityException("Only team leaders can invite members");
        }

        // Auto-convert personal team to non-personal team for Pro users
        if (saasTeamExtensionService.isPersonal(team)) {
            log.info(
                    "Converting personal team {} to non-personal team for first invitation by {}",
                    team.getName(),
                    inviter.getUsername());
            saasTeamExtensionService.setPersonal(team, false);
            // Unlimited seats once converted to standard
            saasTeamExtensionService.setSeats(team, Integer.MAX_VALUE, Integer.MAX_VALUE);
        }

        // Validate: team can invite (not personal, has available seats)
        if (!saasTeamExtensionService.canInviteMembers(team)) {
            throw new IllegalArgumentException(
                    "Cannot invite members: personal team or no available seats");
        }

        // Check rate limit (10 invitations per hour, 50 per day)
        if (!rateLimitService.allowInvitation(teamId)) {
            int remaining = rateLimitService.getRemainingInvitations(teamId);
            throw new IllegalStateException(
                    String.format(
                            "Rate limit exceeded. Please try again later. (Remaining: %d)",
                            remaining));
        }

        // Check if there's already a pending invitation
        if (invitationRepository.existsPendingInvitationByTeamIdAndEmail(teamId, inviteeEmail)) {
            throw new IllegalArgumentException("Pending invitation already exists for this email");
        }

        // Check if invitee already exists and has active paid subscription
        userRepository
                .findByEmail(inviteeEmail)
                .ifPresent(
                        existingUser -> {
                            if (hasPaidSubscription(existingUser)) {
                                throw new IllegalArgumentException(
                                        "Cannot invite paid users to teams. Only team leaders manage billing.");
                            }

                            // Check if already a member
                            if (membershipRepository.existsByTeamIdAndUserId(
                                    teamId, existingUser.getId())) {
                                throw new IllegalArgumentException("User is already a team member");
                            }
                        });

        // Create invitation
        TeamInvitation invitation = new TeamInvitation();
        invitation.setTeam(team);
        invitation.setInviter(inviter);
        invitation.setInviteeEmail(inviteeEmail);
        invitation.setStatus(InvitationStatus.PENDING);
        invitation.setInvitationToken(UUID.randomUUID().toString());
        invitation.setExpiresAt(LocalDateTime.now().plusDays(7));

        userRepository.findByEmail(inviteeEmail).ifPresent(invitation::setInviteeUser);

        TeamInvitation savedInvitation = invitationRepository.save(invitation);

        // Send invitation email
        sendInvitationEmail(savedInvitation);

        log.info(
                "User {} invited {} to team {}",
                inviter.getUsername(),
                inviteeEmail,
                team.getName());
        return savedInvitation;
    }

    /**
     * Accept an invitation and grant PRO role in the same transaction. If the role grant fails the
     * membership write is rolled back so we never end up with a member sitting on a paid team
     * without the matching role (regression #18).
     */
    @Transactional
    public void acceptInvitationAndGrantRole(String invitationToken, User acceptingUser)
            throws java.sql.SQLException,
                    stirling.software.common.model.exception.UnsupportedProviderException {
        acceptInvitation(invitationToken, acceptingUser);

        // Re-read the user post-accept; acceptInvitation refetches+saves them.
        User user = userRepository.findById(acceptingUser.getId()).orElse(acceptingUser);
        Team userTeam = user.getTeam();
        if (userTeam == null || !hasActivePaidSubscription(userTeam)) {
            log.warn(
                    "User {} joined team {} but team has no active subscription - not granting PRO role",
                    user.getUsername(),
                    userTeam != null ? userTeam.getName() : "null");
            return;
        }
        String currentRole = user.getRolesAsString();
        if (stirling.software.common.model.enumeration.Role.PRO_USER
                .getRoleId()
                .equals(currentRole)) {
            return;
        }
        log.info(
                "Granting ROLE_PRO_USER to user {} joining team {} with active subscription",
                user.getUsername(),
                userTeam.getName());
        userService.changeRole(
                user, stirling.software.common.model.enumeration.Role.PRO_USER.getRoleId());
    }

    /**
     * Accept an invitation. The user's individual subscription stays active but is suspended in
     * favour of the team's shared pool; it resumes if they leave the team.
     */
    @Transactional
    public void acceptInvitation(String invitationToken, User acceptingUser) {
        // Refetch via id rather than reattach: supabase_auth_id is insertable/updatable=false and
        // gets cleared on detach.
        final long userId = acceptingUser.getId();
        acceptingUser =
                userRepository
                        .findById(userId)
                        .orElseThrow(
                                () -> new IllegalArgumentException("User not found: " + userId));

        TeamInvitation invitation =
                invitationRepository
                        .findByInvitationToken(invitationToken)
                        .orElseThrow(() -> new IllegalArgumentException("Invitation not found"));

        // Force lazy-load inviter early to ensure it's in managed state
        User inviter = invitation.getInviter();

        // Validate invitation status
        if (invitation.getStatus() != InvitationStatus.PENDING) {
            throw new IllegalStateException(
                    "Invitation already processed: " + invitation.getStatus());
        }

        if (invitation.isExpired()) {
            invitation.setStatus(InvitationStatus.EXPIRED);
            invitationRepository.save(invitation);
            throw new IllegalStateException("Invitation expired");
        }

        // Validate: email matches
        if (!invitation.getInviteeEmail().equalsIgnoreCase(acceptingUser.getEmail())) {
            throw new SecurityException("Invitation email mismatch");
        }

        // Validate: user doesn't have paid subscription
        if (hasPaidSubscription(acceptingUser)) {
            throw new IllegalArgumentException(
                    "Cannot join team with active paid subscription. Cancel your subscription first.");
        }

        // Validate: team has available seats
        Team team = invitation.getTeam();
        if (!saasTeamExtensionService.hasAvailableSeats(team)) {
            throw new IllegalStateException("Team has no available seats");
        }

        // Validate: accepting won't orphan a team the user leads or that has a paid plan.
        // Accepting moves the user off their current team; leaveTeam already blocks the
        // last leader of a team from walking away, so accept must enforce the same rule.
        assertCanLeaveCurrentTeamsToJoinAnother(acceptingUser);

        // User can only be in one team . leave existing teams before joining new one
        List<TeamMembership> existingMemberships =
                membershipRepository.findByUserId(acceptingUser.getId());
        List<Team> teamsToDelete = new java.util.ArrayList<>();

        for (TeamMembership existingMembership : existingMemberships) {
            Team oldTeam = existingMembership.getTeam();

            membershipRepository.delete(existingMembership);

            saasTeamExtensionsRepository.decrementSeatsUsed(oldTeam.getId());

            // Mark personal team for deletion if it's now empty (user was the only member)
            if (saasTeamExtensionService.isPersonal(oldTeam)
                    && membershipRepository.countByTeamId(oldTeam.getId()) == 0) {
                teamsToDelete.add(oldTeam);
            }

            log.info(
                    "User {} left team {} to join team {}",
                    acceptingUser.getUsername(),
                    oldTeam.getName(),
                    team.getName());
        }

        // Native query: avoids Hibernate touching the read-only supabase_auth_id column.
        userRepository.updateUserTeamId(acceptingUser.getId(), team.getId());
        acceptingUser.setTeam(team);
        log.info(
                "User {} team reference updated to team {}",
                acceptingUser.getUsername(),
                team.getName());

        // Now safe to delete empty personal teams
        for (Team teamToDelete : teamsToDelete) {
            log.info(
                    "Deleting empty personal team {} after user {} joined another team",
                    teamToDelete.getId(),
                    acceptingUser.getUsername());
            teamRepository.delete(teamToDelete);
        }

        // Create team membership
        TeamMembership membership = new TeamMembership();
        membership.setTeam(team);
        membership.setUser(acceptingUser);
        membership.setRole(TeamRole.MEMBER);
        membership.setInvitedBy(inviter);
        membership.setInvitedAt(invitation.getCreatedAt());
        membership.setAcceptedAt(LocalDateTime.now());
        membershipRepository.save(membership);

        log.info(
                "User {} added to team {} with role MEMBER",
                acceptingUser.getUsername(),
                team.getName());

        // incrementSeatsUsed enforces the seat cap atomically; rowsUpdated==0 means at capacity.
        int rowsUpdated = saasTeamExtensionsRepository.incrementSeatsUsed(team.getId());
        if (rowsUpdated == 0) {
            throw new IllegalStateException("Team has no available seats");
        }
        log.info("Team {} seats_used incremented", team.getName());

        // Don't set inviteeUser; acceptance is recorded via status + TeamMembership row.
        invitation.setStatus(InvitationStatus.ACCEPTED);
        invitationRepository.save(invitation);

        log.info(
                "User {} accepted invitation to team {}",
                acceptingUser.getUsername(),
                team.getName());
    }

    /**
     * Remove team member (only by team leader)
     *
     * @param teamId the team ID
     * @param memberUserId the user ID to remove
     * @param remover the user performing the removal
     */
    @Transactional
    public void removeTeamMember(Long teamId, Long memberUserId, User remover) {
        // Validate: remover is team leader
        TeamMembership removerMembership =
                membershipRepository
                        .findByTeamIdAndUserId(teamId, remover.getId())
                        .orElseThrow(
                                () -> new SecurityException("You are not a member of this team"));

        if (!removerMembership.isLeader()) {
            throw new SecurityException("Only team leaders can remove members");
        }

        // Cannot remove yourself if you're the only leader
        List<TeamMembership> leaders =
                membershipRepository.findByTeamIdAndRole(teamId, TeamRole.LEADER);
        if (removerMembership.getUser().getId().equals(memberUserId) && leaders.size() == 1) {
            throw new IllegalStateException(
                    "Cannot remove the last team leader. Transfer leadership first.");
        }

        TeamMembership memberToRemove =
                membershipRepository
                        .findByTeamIdAndUserId(teamId, memberUserId)
                        .orElseThrow(() -> new IllegalArgumentException("User not found in team"));

        User userToRemove = memberToRemove.getUser();

        membershipRepository.delete(memberToRemove);

        // Atomically decrement team seats_used (prevents race condition)
        saasTeamExtensionsRepository.decrementSeatsUsed(teamId);

        // Fetch team for downstream checks
        Team team = teamRepository.findById(teamId).orElseThrow();

        // Create new personal team for removed user
        createPersonalTeam(userToRemove);

        // Downgrade user to FREE tier after leaving team
        // They either had a trial (which was cancelled) or had an existing subscription
        // Either way, they should be FREE after leaving
        downgradeUserToFree(userToRemove);

        // Delete non-personal team if it's now empty
        if (!saasTeamExtensionService.isPersonal(team)
                && membershipRepository.countByTeamId(teamId) == 0) {
            log.info("Deleting empty non-personal team {} after last member removed", teamId);
            teamRepository.delete(team);
        }

        log.info(
                "User {} removed user {} from team {} and created new personal team",
                remover.getId(),
                memberUserId,
                teamId);
    }

    /**
     * Guard against silently orphaning a team when a user accepts an invite to another one.
     *
     * <p>{@link #acceptInvitation} moves a user to the inviting team by first leaving their current
     * team(s). Personal teams are disposable (they get deleted on accept), but a non-personal team
     * must not be left memberless while still billing. {@link #leaveTeam} already refuses to let
     * the last leader walk away; accept took a shortcut around that check, which let a paid team's
     * leader join another team and orphan their old team together with its live subscription.
     *
     * <p>So: for each non-personal team the user leads as its <em>last</em> leader, block the
     * accept. The message points them at the right remedy — cancel the plan if the team is paid,
     * otherwise transfer leadership first.
     *
     * <p>Linked self-hosted instances (combined-billing "Mode A") bind to a team via {@code
     * linked_instance.team_id}, so they too orphan a team that is left memberless — a personal team
     * that accept deletes, or a non-personal team left by its last leader. They're checked in that
     * same orphaning branch (not for a non-leader leaving a team that lives on); the remedy is to
     * revoke them.
     *
     * @param user the user attempting to accept an invitation
     * @throws IllegalStateException if accepting would orphan a team the user leads or its
     *     instances
     */
    private void assertCanLeaveCurrentTeamsToJoinAnother(User user) {
        for (TeamMembership membership : membershipRepository.findByUserId(user.getId())) {
            Team team = membership.getTeam();
            boolean personal = saasTeamExtensionService.isPersonal(team);
            if (!personal && !membership.isLeader()) {
                // A non-leader leaving a shared team never orphans it.
                continue;
            }
            if (!personal
                    && membershipRepository.countByTeamIdAndRole(team.getId(), TeamRole.LEADER)
                            > 1) {
                // Another leader remains, so the team keeps an owner.
                continue;
            }
            // Leaving here orphans the team: a personal team is deleted on accept; a non-personal
            // team is being left by its last leader. Either way its linked self-hosted instances
            // lose their billing team, so block until they're revoked.
            if (linkedInstanceRepository.countByTeamIdAndRevokedAtIsNull(team.getId()) > 0) {
                throw new IllegalStateException(
                        "Revoke linked self-hosted instances on this team before joining another"
                                + " team.");
            }
            if (personal) {
                // Personal teams are disposable (deleted on accept) and never billed/shared.
                continue;
            }
            if (hasActivePaidSubscription(team)) {
                throw new IllegalStateException(
                        "Your team has an active plan and you are its last leader. Cancel the plan"
                                + " or transfer leadership before joining another team.");
            }
            throw new IllegalStateException(
                    "You are the last leader of your team. Transfer leadership before joining"
                            + " another team.");
        }
    }

    /**
     * Leave team (self-removal)
     *
     * @param teamId the team ID
     * @param user the user leaving
     */
    @Transactional
    public void leaveTeam(Long teamId, User user) {
        TeamMembership membership =
                membershipRepository
                        .findByTeamIdAndUserId(teamId, user.getId())
                        .orElseThrow(
                                () -> new IllegalArgumentException("Not a member of this team"));

        // Cannot leave if you're the only leader
        if (membership.isLeader()) {
            List<TeamMembership> leaders =
                    membershipRepository.findByTeamIdAndRole(teamId, TeamRole.LEADER);
            if (leaders.size() == 1) {
                throw new IllegalStateException(
                        "Cannot leave as the last team leader. Transfer leadership first.");
            }
        }

        membershipRepository.delete(membership);

        // Atomically decrement team seats_used (prevents race condition)
        saasTeamExtensionsRepository.decrementSeatsUsed(teamId);

        // Fetch team for downstream checks
        Team team = teamRepository.findById(teamId).orElseThrow();

        // Create new personal team for user who left
        createPersonalTeam(user);

        // Check if user should be downgraded after leaving team
        // If user has an active subscription (including trial), they keep PRO access
        // Otherwise, downgrade to FREE tier
        downgradeUserToFree(user);

        // Delete non-personal team if it's now empty
        if (!saasTeamExtensionService.isPersonal(team)
                && membershipRepository.countByTeamId(teamId) == 0) {
            log.info("Deleting empty non-personal team {} after last member left", teamId);
            teamRepository.delete(team);
        }

        log.info("User {} left team {} and created new personal team", user.getId(), teamId);
    }

    /**
     * Check if user has active paid subscription.
     *
     * <p>Queries the billing_subscriptions table to determine if the user has an active, trialing,
     * or past_due subscription. This prevents inviting users who are already paying for their own
     * subscription, which would create billing conflicts.
     *
     * @param user the user to check
     * @return true if user has active paid subscription
     */
    private boolean hasPaidSubscription(User user) {
        if (user.getSupabaseId() == null) {
            log.debug(
                    "User {} has no Supabase ID, cannot check billing subscription", user.getId());
            return false;
        }

        try {
            // Check for active PAID subscriptions only (excludes trialing users)
            // Trialing users and users with scheduled cancellations can be invited to teams
            boolean hasActivePaidSubscription =
                    billingSubscriptionRepository.existsActivePaidSubscriptionForUser(
                            user.getSupabaseId());

            if (hasActivePaidSubscription) {
                log.info(
                        "User {} (supabase: {}) has active paid subscription",
                        user.getId(),
                        user.getSupabaseId());
            }

            return hasActivePaidSubscription;
        } catch (Exception e) {
            log.error(
                    "Error checking billing subscription for user {}: {}",
                    user.getId(),
                    e.getMessage(),
                    e);
            // Fail safe: treat as if they DO have a subscription to avoid double billing
            // Better to block invitation and require manual check than risk inviting paying
            // customer
            return true;
        }
    }

    /**
     * Check if team has an active paid subscription. This determines if new team members should be
     * granted ROLE_PRO_USER.
     *
     * @param team the team to check
     * @return true if team has active paid subscription
     */
    public boolean hasActivePaidSubscription(Team team) {
        if (team == null || team.getId() == null) {
            log.debug("Team is null or has no ID, cannot check subscription");
            return false;
        }

        try {
            boolean hasActiveSubscription =
                    billingSubscriptionRepository.existsActiveSubscriptionForTeam(team.getId());

            if (hasActiveSubscription) {
                log.info("Team {} has active paid subscription", team.getId());
            }

            return hasActiveSubscription;
        } catch (Exception e) {
            log.error(
                    "Error checking billing subscription for team {}: {}",
                    team.getId(),
                    e.getMessage(),
                    e);
            // Fail safe: assume no subscription on error
            return false;
        }
    }

    /**
     * Send invitation email via Supabase Edge Function
     *
     * @param invitation the invitation
     */
    private void sendInvitationEmail(TeamInvitation invitation) {
        try {
            // Check if Supabase is configured
            if (!supabaseConfig.isEdgeFunctionConfigured()) {
                log.warn(
                        "Supabase integration not configured, skipping email send. "
                                + "Please configure supabase.edgeFunctionUrl and supabase.edgeFunctionSecret "
                                + "in application properties.");
                return;
            }

            String url = supabaseConfig.getEdgeFunctionUrl() + "/team-invitation-email";
            String edgeFunctionSecret = supabaseConfig.getEdgeFunctionSecret();

            var requestBody =
                    new EmailInvitationRequest(
                            invitation.getInviteeEmail(),
                            invitation.getTeam().getName(),
                            invitation.getInviter().getEmail(),
                            invitation.getInvitationToken());

            // Create headers with authorization
            org.springframework.http.HttpHeaders headers =
                    new org.springframework.http.HttpHeaders();
            headers.set("Authorization", "Bearer " + edgeFunctionSecret);
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);

            org.springframework.http.HttpEntity<EmailInvitationRequest> entity =
                    new org.springframework.http.HttpEntity<>(requestBody, headers);

            restTemplate.postForEntity(url, entity, String.class);

            log.info(
                    "Sent invitation email to {} for team {}",
                    invitation.getInviteeEmail(),
                    invitation.getTeam().getName());
        } catch (Exception e) {
            log.error("Failed to send invitation email", e);
            // Don't throw . invitation is already saved
        }
    }

    /** Request body for edge function email */
    private record EmailInvitationRequest(
            String invitee_email, String team_name, String inviter_name, String invitation_token) {}

    /**
     * Update team seat allocation (called by billing webhooks)
     *
     * @param teamId the team ID
     * @param maxSeats new maximum seat count
     */
    @Transactional
    public void updateTeamSeats(Long teamId, Integer maxSeats) {
        if (maxSeats == null || maxSeats < 1) {
            throw new IllegalArgumentException("maxSeats must be at least 1");
        }

        Team team =
                teamRepository
                        .findById(teamId)
                        .orElseThrow(() -> new IllegalArgumentException("Team not found"));

        // Handle seat reduction: automatically remove excess members if reducing below current
        // usage
        int currentSeatsUsed = saasTeamExtensionService.getSeatsUsed(team);
        int currentMaxSeats = saasTeamExtensionService.getMaxSeats(team);
        if (maxSeats < currentSeatsUsed) {
            int excessMembers = currentSeatsUsed - maxSeats;
            log.warn(
                    "Team {} reducing seats from {} to {} with {} current members. Removing {} excess members.",
                    teamId,
                    currentMaxSeats,
                    maxSeats,
                    currentSeatsUsed,
                    excessMembers);

            // Get all team members, sorted by priority (non-leaders first, most recently joined
            // first)
            List<TeamMembership> allMembers = membershipRepository.findByTeamId(teamId);

            // Sort: MEMBER role first (non-leaders), then by accepted date descending (most recent
            // first)
            List<TeamMembership> membersToRemove =
                    allMembers.stream()
                            .sorted(
                                    (m1, m2) -> {
                                        // Leaders (LEADER role) come last (lower priority for
                                        // removal)
                                        if (m1.getRole() != m2.getRole()) {
                                            return m1.getRole() == TeamRole.LEADER ? 1 : -1;
                                        }
                                        // Among same role, remove most recently joined first
                                        // (descending accepted date)
                                        LocalDateTime date1 =
                                                m1.getAcceptedAt() != null
                                                        ? m1.getAcceptedAt()
                                                        : m1.getInvitedAt();
                                        LocalDateTime date2 =
                                                m2.getAcceptedAt() != null
                                                        ? m2.getAcceptedAt()
                                                        : m2.getInvitedAt();
                                        if (date1 == null && date2 == null) return 0;
                                        if (date1 == null) return 1;
                                        if (date2 == null) return -1;
                                        return date2.compareTo(
                                                date1); // Descending (most recent first)
                                    })
                            .limit(excessMembers)
                            .collect(java.util.stream.Collectors.toList());

            // Remove excess members
            for (TeamMembership membership : membersToRemove) {
                User userToRemove = membership.getUser();
                log.info(
                        "Removing user {} ({}) from team {} due to seat reduction",
                        userToRemove.getId(),
                        userToRemove.getUsername(),
                        teamId);

                // Delete membership
                membershipRepository.delete(membership);

                // Atomically decrement seats_used count (prevents race condition)
                saasTeamExtensionsRepository.decrementSeatsUsed(teamId);

                // Create new personal team for removed user
                createPersonalTeam(userToRemove);

                // Downgrade user to FREE tier
                downgradeUserToFree(userToRemove);

                log.info(
                        "User {} removed from team {} and migrated to personal team due to seat reduction",
                        userToRemove.getId(),
                        teamId);
            }

            log.info(
                    "Completed seat reduction for team {}: removed {} members",
                    teamId,
                    excessMembers);
        }

        saasTeamExtensionService.setSeats(team, maxSeats, maxSeats);

        // Personal team with maxSeats > 1 is really a standard team.
        boolean wasPersonal = saasTeamExtensionService.isPersonal(team);
        if (wasPersonal && maxSeats > 1) {
            saasTeamExtensionService.setPersonal(team, false);
            log.info(
                    "Team {} converted from PERSONAL to STANDARD (maxSeats increased to {})",
                    teamId,
                    maxSeats);
        }
        // Revert to personal when downgrading to 1 seat
        else if (!wasPersonal && maxSeats == 1) {
            saasTeamExtensionService.setPersonal(team, true);
            log.info("Team {} converted from STANDARD to PERSONAL (maxSeats reduced to 1)", teamId);
        }

        teamRepository.save(team);

        log.info(
                "Team {} seat allocation updated: maxSeats={}, seatsUsed={}, isPersonal={}",
                teamId,
                maxSeats,
                saasTeamExtensionService.getSeatsUsed(team),
                saasTeamExtensionService.isPersonal(team));
    }

    /**
     * Downgrade user to FREE tier (called when leaving team)
     *
     * <p>Note: Uses UserRoleService to avoid code duplication. Refetches user to avoid stale entity
     * issues (createPersonalTeam refetches and saves the user).
     *
     * @param user the user to downgrade
     */
    private void downgradeUserToFree(User user) {
        // Refetch user to ensure we have the latest managed entity
        // (createPersonalTeam refetches and saves the user, making our reference stale)
        final long userId = user.getId();
        final User refetchedUser =
                userRepository
                        .findById(userId)
                        .orElseThrow(
                                () -> new IllegalArgumentException("User not found: " + userId));

        String currentRole = refetchedUser.getRolesAsString();

        if (!Role.PRO_USER.getRoleId().equals(currentRole)) {
            log.debug(
                    "User {} already on FREE tier, no downgrade needed",
                    refetchedUser.getUsername());
            return;
        }

        // Check if user has an active subscription (including trial)
        // If they do, keep their PRO access . don't downgrade
        if (refetchedUser.getSupabaseId() != null) {
            try {
                boolean hasActiveSubscription =
                        billingSubscriptionRepository.existsActiveSubscriptionForUser(
                                refetchedUser.getSupabaseId());

                if (hasActiveSubscription) {
                    log.info(
                            "User {} has active subscription (trial or paid), maintaining PRO access after leaving team",
                            refetchedUser.getUsername());
                    return; // Keep PRO access
                }
            } catch (Exception e) {
                log.error(
                        "Error checking subscription for user {} after leaving team: {}",
                        refetchedUser.getUsername(),
                        e.getMessage(),
                        e);
                // On error, proceed with downgrade to be safe
            }
        }

        log.info(
                "Downgrading user {} from PRO to FREE after leaving team (no active subscription)",
                refetchedUser.getUsername());

        // Delegate to UserRoleService for consistent downgrade logic
        userRoleService.downgradeToFree(refetchedUser);
    }
}
