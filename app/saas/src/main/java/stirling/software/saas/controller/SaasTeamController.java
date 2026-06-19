package stirling.software.saas.controller;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.annotation.security.RolesAllowed;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.TeamApi;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.model.TeamInvitation;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.TeamInvitationRepository;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.security.TeamSecurityExpressions;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.SaasTeamService;

/** SaaS-only team endpoints: invitations, personal teams, billing-aware lookups. */
@TeamApi
@jakarta.enterprise.context.ApplicationScoped
@Path("/api/v1/team")
@IfBuildProfile("saas")
@Slf4j
@RequiredArgsConstructor
public class SaasTeamController {

    private final TeamRepository teamRepository;
    private final UserRepository userRepository;
    private final TeamService teamService;
    private final SaasTeamService saasTeamService;
    private final SaasTeamExtensionService saasTeamExtensionService;
    private final TeamMembershipRepository membershipRepository;
    private final TeamInvitationRepository invitationRepository;
    private final UserService userService;
    private final TeamSecurityExpressions teamSecurityExpressions;

    // TODO: Migration required - replaces Spring TransactionAspectSupport. Used to mark the current
    // jakarta @Transactional transaction rollback-only without propagating the exception.
    @jakarta.inject.Inject
    jakarta.transaction.TransactionSynchronizationRegistry transactionSynchronizationRegistry;

    private void markRollbackOnly() {
        try {
            transactionSynchronizationRegistry.setRollbackOnly();
        } catch (Exception ex) {
            log.warn("Failed to mark transaction rollback-only: {}", ex.getMessage());
        }
    }

    // ========== NEW TEAM INVITATION ENDPOINTS ==========

    /** Invite user to team (team leader only) */
    // TODO: Migration required - @PreAuthorize("isAuthenticated()") complex SpEL; enforce
    // authenticated access via JAX-RS SecurityContext / filter.
    @POST
    @Path("/invite")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response inviteUser(InviteUserRequest request) {
        try {
            User currentUser = getCurrentUser();

            // Verify user is team leader before proceeding
            // Note: Cannot use @PreAuthorize with #request.teamId as @RequestBody is not yet
            // deserialized at annotation evaluation time
            if (!teamSecurityExpressions.isTeamLeader(request.teamId)) {
                return Response.status(Response.Status.FORBIDDEN)
                        .entity(Map.of("error", "Only team leaders can invite members"))
                        .build();
            }

            TeamInvitation invitation =
                    saasTeamService.inviteUserToTeam(request.teamId, request.email, currentUser);
            return Response.ok(toInvitationDTO(invitation)).build();
        } catch (SecurityException | IllegalArgumentException e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Error inviting user", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to send invitation"))
                    .build();
        }
    }

    /** Accept team invitation */
    // TODO: Migration required - @PreAuthorize("isAuthenticated()") complex SpEL; enforce
    // authenticated access via JAX-RS SecurityContext / filter.
    @POST
    @Path("/invitations/{token}/accept")
    @Transactional
    public Response acceptInvitation(@PathParam("token") String token) {
        try {
            User currentUser = getCurrentUser();
            saasTeamService.acceptInvitationAndGrantRole(token, currentUser);
            return Response.ok(Map.of("message", "Invitation accepted", "success", true)).build();
        } catch (SecurityException | IllegalArgumentException | IllegalStateException e) {
            // Caller-fixable failures (already-accepted, expired, email mismatch, etc.).
            // Mark the transaction for rollback so anything the service did is reversed even
            // though we don't propagate the exception out of the @Transactional method.
            // TODO: Migration required - replace Spring TransactionAspectSupport rollback-only with
            // jakarta TransactionSynchronizationRegistry.setRollbackOnly() (injected).
            markRollbackOnly();
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Error accepting invitation", e);
            // TODO: Migration required - replace Spring TransactionAspectSupport rollback-only with
            // jakarta TransactionSynchronizationRegistry.setRollbackOnly() (injected).
            markRollbackOnly();
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to accept invitation"))
                    .build();
        }
    }

    /** Reject team invitation */
    // TODO: Migration required - @PreAuthorize("isAuthenticated()") complex SpEL; enforce
    // authenticated access via JAX-RS SecurityContext / filter.
    @POST
    @Path("/invitations/{token}/reject")
    public Response rejectInvitation(@PathParam("token") String token) {
        try {
            User currentUser = getCurrentUser();
            TeamInvitation invitation =
                    invitationRepository
                            .findByInvitationToken(token)
                            .orElseThrow(
                                    () -> new IllegalArgumentException("Invitation not found"));

            // Security check: verify invitation belongs to current user
            if (!invitation.getInviteeEmail().equalsIgnoreCase(currentUser.getEmail())
                    && !invitation.getInviteeEmail().equalsIgnoreCase(currentUser.getUsername())) {
                throw new SecurityException(
                        "You cannot reject an invitation that was not sent to you");
            }

            // Only allow rejecting pending invitations
            if (invitation.getStatus()
                    != stirling.software.common.model.enumeration.InvitationStatus.PENDING) {
                throw new IllegalStateException("Can only reject pending invitations");
            }

            invitation.setStatus(
                    stirling.software.common.model.enumeration.InvitationStatus.REJECTED);
            invitationRepository.persist(invitation);

            return Response.ok(Map.of("message", "Invitation rejected")).build();
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (SecurityException | IllegalStateException e) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Error rejecting invitation", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to reject invitation"))
                    .build();
        }
    }

    /** Cancel team invitation (team leader only) */
    // TODO: Migration required - @PreAuthorize("isAuthenticated()") complex SpEL; enforce
    // authenticated access via JAX-RS SecurityContext / filter.
    @DELETE
    @Path("/invitations/{invitationId}")
    public Response cancelInvitation(@PathParam("invitationId") Long invitationId) {
        try {
            User currentUser = getCurrentUser();
            TeamInvitation invitation =
                    invitationRepository
                            .findByIdOptional(invitationId)
                            .orElseThrow(
                                    () -> new IllegalArgumentException("Invitation not found"));

            // Security check: verify current user is team leader
            Team team = invitation.getTeam();
            TeamMembership membership =
                    membershipRepository
                            .findByTeamIdAndUserId(team.getId(), currentUser.getId())
                            .orElseThrow(
                                    () ->
                                            new SecurityException(
                                                    "You are not a member of this team"));

            if (!membership.isLeader()) {
                throw new SecurityException("Only team leaders can cancel invitations");
            }

            // Only allow canceling pending invitations
            if (invitation.getStatus()
                    != stirling.software.common.model.enumeration.InvitationStatus.PENDING) {
                throw new IllegalStateException("Can only cancel pending invitations");
            }

            invitation.setStatus(
                    stirling.software.common.model.enumeration.InvitationStatus.CANCELLED);
            invitationRepository.persist(invitation);

            return Response.ok(Map.of("message", "Invitation cancelled")).build();
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (SecurityException | IllegalStateException e) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Error cancelling invitation", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to cancel invitation"))
                    .build();
        }
    }

    /** Get pending invitations for current user */
    // TODO: Migration required - @PreAuthorize("isAuthenticated()") complex SpEL; enforce
    // authenticated access via JAX-RS SecurityContext / filter.
    @GET
    @Path("/invitations/pending")
    public Response getPendingInvitations() {
        try {
            User currentUser = getCurrentUser();
            List<TeamInvitation> invitations =
                    invitationRepository.findPendingInvitationsByEmail(
                            currentUser.getEmail(), LocalDateTime.now());

            List<InvitationDTO> dtos =
                    invitations.stream().map(this::toInvitationDTO).collect(Collectors.toList());

            return Response.ok(dtos).build();
        } catch (Exception e) {
            log.error("Error fetching pending invitations", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to fetch invitations"))
                    .build();
        }
    }

    /** Get all teams for current user */
    // TODO: Migration required - @PreAuthorize("isAuthenticated()") complex SpEL; enforce
    // authenticated access via JAX-RS SecurityContext / filter.
    @GET
    @Path("/my")
    public Response getMyTeams() {
        try {
            User currentUser = getCurrentUser();
            List<TeamMembership> memberships =
                    membershipRepository.findByUserId(currentUser.getId());

            // Migrate users from old Default team system to personal teams
            boolean needsPersonalTeam = false;

            if (memberships.isEmpty()) {
                // Case 1: User has no team memberships at all
                needsPersonalTeam = true;
            } else {
                // Case 2: Check if user is only on Default/Internal team (legacy users)
                boolean hasPersonalTeam =
                        memberships.stream()
                                .anyMatch(m -> saasTeamExtensionService.isPersonal(m.getTeam()));

                boolean onlyOnSystemTeams =
                        memberships.stream()
                                .allMatch(
                                        m -> {
                                            String teamName = m.getTeam().getName();
                                            return "Default".equals(teamName)
                                                    || "Internal".equals(teamName);
                                        });

                if (!hasPersonalTeam && onlyOnSystemTeams) {
                    needsPersonalTeam = true;
                }
            }

            if (needsPersonalTeam) {
                try {
                    saasTeamService.createPersonalTeam(currentUser);
                    // Fetch memberships again after creating personal team
                    memberships = membershipRepository.findByUserId(currentUser.getId());
                    log.info("Created personal team for user {}", currentUser.getId());
                } catch (Exception e) {
                    log.error(
                            "Failed to create personal team for user {}: {}",
                            currentUser.getId(),
                            e.getMessage(),
                            e);
                    // Rethrow to let outer catch block return proper error response
                    throw new IllegalStateException(
                            "Failed to initialize personal team for user", e);
                }
            }

            List<TeamDetailsDTO> dtos =
                    memberships.stream()
                            .map(
                                    m ->
                                            toTeamDetailsDTO(
                                                    m.getTeam(),
                                                    m.getRole()
                                                            == stirling.software.common.model
                                                                    .enumeration.TeamRole.LEADER))
                            .collect(Collectors.toList());

            log.info("[TEAM-FETCH] Returning {} teams to client", dtos.size());
            return Response.ok(dtos).build();
        } catch (Exception e) {
            log.error("[TEAM-FETCH] Error fetching user teams: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to fetch teams"))
                    .build();
        }
    }

    /** Get team members (team members only) */
    // TODO: Migration required - @PreAuthorize("@teamSecurity.isTeamMember(#teamId)") complex SpEL;
    // enforce team-membership check programmatically or via a JAX-RS filter.
    @GET
    @Path("/{teamId}/members")
    public Response getTeamMembers(@PathParam("teamId") Long teamId) {
        try {
            List<TeamMembership> memberships = membershipRepository.findByTeamId(teamId);
            List<TeamMemberDTO> dtos =
                    memberships.stream().map(this::toTeamMemberDTO).collect(Collectors.toList());
            return Response.ok(dtos).build();
        } catch (Exception e) {
            log.error("Error fetching team members", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to fetch team members"))
                    .build();
        }
    }

    /** Get team invitations (team leaders only) */
    // TODO: Migration required - @PreAuthorize("@teamSecurity.isTeamLeader(#teamId)") complex SpEL;
    // enforce team-leader check programmatically or via a JAX-RS filter.
    @GET
    @Path("/{teamId}/invitations")
    public Response getTeamInvitations(@PathParam("teamId") Long teamId) {
        try {
            List<TeamInvitation> invitations = invitationRepository.findByTeamId(teamId);
            List<InvitationDTO> dtos =
                    invitations.stream().map(this::toInvitationDTO).collect(Collectors.toList());
            return Response.ok(dtos).build();
        } catch (Exception e) {
            log.error("Error fetching team invitations", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to fetch invitations"))
                    .build();
        }
    }

    /** Remove team member (team leader only) */
    // TODO: Migration required - @PreAuthorize("@teamSecurity.isTeamLeader(#teamId)") complex SpEL;
    // enforce team-leader check programmatically or via a JAX-RS filter.
    @DELETE
    @Path("/{teamId}/members/{memberId}")
    @Transactional
    public Response removeTeamMember(
            @PathParam("teamId") Long teamId, @PathParam("memberId") Long memberId) {
        try {
            User currentUser = getCurrentUser();

            // Get the user being removed before removing them
            User userToRemove =
                    userRepository
                            .findByIdOptional(memberId)
                            .orElseThrow(() -> new IllegalArgumentException("Member not found"));
            Team oldTeam = teamRepository.findByIdOptional(teamId).orElseThrow();

            // Remove the user from the team
            saasTeamService.removeTeamMember(teamId, memberId, currentUser);

            // Revoke PRO role when removing from any non-personal team
            String currentRole = userToRemove.getRolesAsString();
            if (stirling.software.common.model.enumeration.Role.PRO_USER
                    .getRoleId()
                    .equals(currentRole)) {
                log.info(
                        "Revoking ROLE_PRO_USER from user {} removed from team {}",
                        userToRemove.getUsername(),
                        oldTeam.getName());
                userService.changeRole(
                        userToRemove,
                        stirling.software.common.model.enumeration.Role.USER.getRoleId());
            }

            return Response.ok(Map.of("message", "Member removed successfully")).build();
        } catch (SecurityException | IllegalArgumentException | IllegalStateException e) {
            // TODO: Migration required - replace Spring TransactionAspectSupport rollback-only with
            // jakarta TransactionSynchronizationRegistry.setRollbackOnly() (injected).
            markRollbackOnly();
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Error removing team member", e);
            // TODO: Migration required - replace Spring TransactionAspectSupport rollback-only with
            // jakarta TransactionSynchronizationRegistry.setRollbackOnly() (injected).
            markRollbackOnly();
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to remove member"))
                    .build();
        }
    }

    /** Leave team (self-removal) */
    // TODO: Migration required - @PreAuthorize("@teamSecurity.isTeamMember(#teamId)") complex SpEL;
    // enforce team-membership check programmatically or via a JAX-RS filter.
    @POST
    @Path("/{teamId}/leave")
    @Transactional
    public Response leaveTeam(@PathParam("teamId") Long teamId) {
        try {
            User currentUser = getCurrentUser();

            // Get the team before leaving
            Team oldTeam = teamRepository.findByIdOptional(teamId).orElseThrow();

            // Leave the team
            saasTeamService.leaveTeam(teamId, currentUser);

            // Revoke PRO role when leaving any non-personal team
            String currentRole = currentUser.getRolesAsString();
            if (stirling.software.common.model.enumeration.Role.PRO_USER
                    .getRoleId()
                    .equals(currentRole)) {
                log.info(
                        "Revoking ROLE_PRO_USER from user {} who left team {}",
                        currentUser.getUsername(),
                        oldTeam.getName());
                userService.changeRole(
                        currentUser,
                        stirling.software.common.model.enumeration.Role.USER.getRoleId());
            }

            return Response.ok(Map.of("message", "Left team successfully")).build();
        } catch (IllegalArgumentException | IllegalStateException e) {
            // TODO: Migration required - replace Spring TransactionAspectSupport rollback-only with
            // jakarta TransactionSynchronizationRegistry.setRollbackOnly() (injected).
            markRollbackOnly();
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Error leaving team", e);
            // TODO: Migration required - replace Spring TransactionAspectSupport rollback-only with
            // jakarta TransactionSynchronizationRegistry.setRollbackOnly() (injected).
            markRollbackOnly();
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to leave team"))
                    .build();
        }
    }

    /** Rename team (team leader only) */
    // TODO: Migration required - @PreAuthorize("@teamSecurity.isTeamLeader(#teamId)") complex SpEL;
    // enforce team-leader check programmatically or via a JAX-RS filter.
    @POST
    @Path("/{teamId}/rename")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response renameTeamByLeader(
            @PathParam("teamId") Long teamId, RenameTeamRequest request) {
        try {
            if (request.newName == null || request.newName.trim().isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Team name cannot be empty"))
                        .build();
            }

            Team team =
                    teamRepository
                            .findByIdOptional(teamId)
                            .orElseThrow(() -> new IllegalArgumentException("Team not found"));

            // Prevent renaming personal teams
            if (saasTeamExtensionService.isPersonal(team)) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Cannot rename personal team"))
                        .build();
            }

            // Prevent renaming the Internal team
            if (TeamService.INTERNAL_TEAM_NAME.equals(team.getName())) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Cannot rename Internal team"))
                        .build();
            }

            team.setName(request.newName.trim());
            teamRepository.persist(team);

            log.info(
                    "Team {} renamed to {} by leader {}",
                    teamId,
                    request.newName,
                    getCurrentUser().getUsername());

            return Response.ok(
                            Map.of(
                                    "message",
                                    "Team renamed successfully",
                                    "newName",
                                    team.getName()))
                    .build();
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Error renaming team", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to rename team"))
                    .build();
        }
    }

    // ========== HELPER METHODS ==========

    private User getCurrentUser() {
        String username = userService.getCurrentUsername();
        return userService
                .findByUsername(username)
                .orElseThrow(() -> new SecurityException("User not found: " + username));
    }

    private TeamMemberDTO toTeamMemberDTO(TeamMembership membership) {
        User user = membership.getUser();
        return new TeamMemberDTO(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                membership.getRole().name(),
                membership.getAcceptedAt());
    }

    private TeamDetailsDTO toTeamDetailsDTO(Team team, boolean isLeader) {
        long memberCount = membershipRepository.countByTeamId(team.getId());
        int maxSeats = saasTeamExtensionService.getMaxSeats(team);
        return new TeamDetailsDTO(
                team.getId(),
                team.getName(),
                saasTeamExtensionService.getTeamType(team),
                saasTeamExtensionService.isPersonal(team),
                (int) memberCount,
                // seatCount and maxSeats now share the same backing field on the extension.
                maxSeats,
                saasTeamExtensionService.getSeatsUsed(team),
                maxSeats,
                isLeader);
    }

    private InvitationDTO toInvitationDTO(TeamInvitation invitation) {
        return new InvitationDTO(
                invitation.getInvitationId(),
                invitation.getTeam().getName(),
                invitation.getInviter().getEmail(),
                invitation.getInviteeEmail(),
                invitation.getInvitationToken(),
                invitation.getStatus().name(),
                invitation.getExpiresAt());
    }

    // ========== DTOs ==========

    @Data
    public static class InviteUserRequest {
        private Long teamId;
        private String email;
    }

    @Data
    public static class TeamMemberDTO {
        private final Long id;
        private final String username;
        private final String email;
        private final String role;
        private final LocalDateTime joinedAt;
    }

    @Data
    public static class TeamDetailsDTO {
        private final Long teamId;
        private final String name;
        private final String teamType;
        private final Boolean isPersonal;
        private final Integer memberCount;
        private final Integer seatCount;
        private final Integer seatsUsed;
        private final Integer maxSeats;
        private final Boolean isLeader;
    }

    @Data
    public static class InvitationDTO {
        private final Long invitationId;
        private final String teamName;
        private final String inviterEmail;
        private final String inviteeEmail;
        private final String invitationToken;
        private final String status;
        private final LocalDateTime expiresAt;
    }

    // ========== BILLING/SUPABASE INTEGRATION ENDPOINTS ==========

    /**
     * Update team seat allocation (called by Supabase webhooks)
     *
     * <p>Requires ADMIN_API_KEY authentication
     */
    @POST
    @Path("/{teamId}/seats")
    @Consumes(MediaType.APPLICATION_JSON)
    @RolesAllowed("ADMIN")
    public Response updateTeamSeats(@PathParam("teamId") Long teamId, UpdateSeatsRequest request) {
        try {
            saasTeamService.updateTeamSeats(teamId, request.maxSeats);

            Team team = teamRepository.findByIdOptional(teamId).orElseThrow();
            int maxSeats = saasTeamExtensionService.getMaxSeats(team);
            int seatsUsed = saasTeamExtensionService.getSeatsUsed(team);
            return Response.ok(
                            Map.of(
                                    "success",
                                    true,
                                    "teamId",
                                    team.getId(),
                                    "maxSeats",
                                    maxSeats,
                                    "seatsUsed",
                                    seatsUsed,
                                    "availableSeats",
                                    maxSeats - seatsUsed))
                    .build();
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Error updating team seats", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to update team seats"))
                    .build();
        }
    }

    /**
     * Get user's primary team by Supabase UUID (called by Supabase when creating subscriptions)
     *
     * <p>Requires ADMIN_API_KEY or service role authentication
     *
     * <p>Accepts Supabase auth user ID (UUID) and returns the user's primary team information.
     */
    @GET
    @Path("/user/supabase/{supabaseUserId}/primary")
    @RolesAllowed("ADMIN")
    public Response getUserPrimaryTeamBySupabaseId(
            @PathParam("supabaseUserId") String supabaseUserId) {
        try {
            java.util.UUID uuid = java.util.UUID.fromString(supabaseUserId);
            User user =
                    userRepository
                            .findBySupabaseId(uuid)
                            .orElseThrow(() -> new IllegalArgumentException("User not found"));

            Team primaryTeam = user.getTeam();
            if (primaryTeam == null) {
                return Response.status(Response.Status.NOT_FOUND)
                        .entity(Map.of("error", "User has no primary team"))
                        .build();
            }

            return Response.ok(
                            Map.of(
                                    "teamId", primaryTeam.getId(),
                                    "userId", user.getId(),
                                    "supabaseUserId", user.getSupabaseId().toString(),
                                    "isPersonal", saasTeamExtensionService.isPersonal(primaryTeam),
                                    "maxSeats", saasTeamExtensionService.getMaxSeats(primaryTeam)))
                    .build();
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Invalid UUID format or user not found"))
                    .build();
        } catch (Exception e) {
            log.error("Error fetching user primary team", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to fetch primary team"))
                    .build();
        }
    }

    /**
     * Get detailed team information (for billing dashboard)
     *
     * <p>Requires team membership or admin role
     */
    // TODO: Migration required - @PreAuthorize("@teamSecurity.isTeamMember(#teamId) or
    // hasRole('ADMIN')") complex SpEL; enforce team-membership-or-admin check programmatically or
    // via a JAX-RS filter.
    @GET
    @Path("/{teamId}")
    public Response getTeamInfo(@PathParam("teamId") Long teamId) {
        try {
            Team team =
                    teamRepository
                            .findByIdOptional(teamId)
                            .orElseThrow(() -> new IllegalArgumentException("Team not found"));

            List<TeamMembership> memberships = membershipRepository.findByTeamId(teamId);
            List<TeamMemberDTO> members =
                    memberships.stream().map(this::toTeamMemberDTO).collect(Collectors.toList());

            // Check if current user is team leader
            User currentUser = getCurrentUser();
            boolean isLeader =
                    membershipRepository
                            .findByTeamIdAndUserId(teamId, currentUser.getId())
                            .map(
                                    m ->
                                            m.getRole()
                                                    == stirling.software.common.model.enumeration
                                                            .TeamRole.LEADER)
                            .orElse(false);

            int maxSeats = saasTeamExtensionService.getMaxSeats(team);
            int seatsUsed = saasTeamExtensionService.getSeatsUsed(team);
            return Response.ok(
                            Map.of(
                                    "teamId",
                                    team.getId(),
                                    "name",
                                    team.getName(),
                                    "isPersonal",
                                    saasTeamExtensionService.isPersonal(team),
                                    "maxSeats",
                                    maxSeats,
                                    "seatsUsed",
                                    seatsUsed,
                                    "availableSeats",
                                    maxSeats - seatsUsed,
                                    "isLeader",
                                    isLeader,
                                    "members",
                                    members))
                    .build();
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Error fetching team info", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to fetch team info"))
                    .build();
        }
    }

    // ========== REQUEST DTOs ==========

    @Data
    public static class UpdateSeatsRequest {
        private Integer maxSeats;
        private String reason;
    }

    @Data
    public static class RenameTeamRequest {
        private String newName;
    }
}
