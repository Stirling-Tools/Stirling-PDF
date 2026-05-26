package stirling.software.saas.controller;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.bind.annotation.*;

import jakarta.transaction.Transactional;

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
@Profile("saas")
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

    // ========== NEW TEAM INVITATION ENDPOINTS ==========

    /** Invite user to team (team leader only) */
    @PostMapping("/invite")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> inviteUser(@RequestBody InviteUserRequest request) {
        try {
            User currentUser = getCurrentUser();

            // Verify user is team leader before proceeding
            // Note: Cannot use @PreAuthorize with #request.teamId as @RequestBody is not yet
            // deserialized at annotation evaluation time
            if (!teamSecurityExpressions.isTeamLeader(request.teamId)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Only team leaders can invite members"));
            }

            TeamInvitation invitation =
                    saasTeamService.inviteUserToTeam(request.teamId, request.email, currentUser);
            return ResponseEntity.ok(toInvitationDTO(invitation));
        } catch (SecurityException | IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error inviting user", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to send invitation"));
        }
    }

    /** Accept team invitation */
    @PostMapping("/invitations/{token}/accept")
    @PreAuthorize("isAuthenticated()")
    @Transactional
    public ResponseEntity<?> acceptInvitation(@PathVariable String token) {
        try {
            User currentUser = getCurrentUser();
            saasTeamService.acceptInvitationAndGrantRole(token, currentUser);
            return ResponseEntity.ok(Map.of("message", "Invitation accepted", "success", true));
        } catch (SecurityException | IllegalArgumentException | IllegalStateException e) {
            // Caller-fixable failures (already-accepted, expired, email mismatch, etc.).
            // Mark the transaction for rollback so anything the service did is reversed even
            // though we don't propagate the exception out of the @Transactional method.
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error accepting invitation", e);
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to accept invitation"));
        }
    }

    /** Reject team invitation */
    @PostMapping("/invitations/{token}/reject")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> rejectInvitation(@PathVariable String token) {
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
            invitationRepository.save(invitation);

            return ResponseEntity.ok(Map.of("message", "Invitation rejected"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        } catch (SecurityException | IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error rejecting invitation", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to reject invitation"));
        }
    }

    /** Cancel team invitation (team leader only) */
    @DeleteMapping("/invitations/{invitationId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> cancelInvitation(@PathVariable Long invitationId) {
        try {
            User currentUser = getCurrentUser();
            TeamInvitation invitation =
                    invitationRepository
                            .findById(invitationId)
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
            invitationRepository.save(invitation);

            return ResponseEntity.ok(Map.of("message", "Invitation cancelled"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        } catch (SecurityException | IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error cancelling invitation", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to cancel invitation"));
        }
    }

    /** Get pending invitations for current user */
    @GetMapping("/invitations/pending")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> getPendingInvitations() {
        try {
            User currentUser = getCurrentUser();
            List<TeamInvitation> invitations =
                    invitationRepository.findPendingInvitationsByEmail(
                            currentUser.getEmail(), LocalDateTime.now());

            List<InvitationDTO> dtos =
                    invitations.stream().map(this::toInvitationDTO).collect(Collectors.toList());

            return ResponseEntity.ok(dtos);
        } catch (Exception e) {
            log.error("Error fetching pending invitations", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch invitations"));
        }
    }

    /** Get all teams for current user */
    @GetMapping("/my")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> getMyTeams() {
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
            return ResponseEntity.ok(dtos);
        } catch (Exception e) {
            log.error("[TEAM-FETCH] Error fetching user teams: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch teams"));
        }
    }

    /** Get team members (team members only) */
    @GetMapping("/{teamId}/members")
    @PreAuthorize("@teamSecurity.isTeamMember(#teamId)")
    public ResponseEntity<?> getTeamMembers(@PathVariable Long teamId) {
        try {
            List<TeamMembership> memberships = membershipRepository.findByTeamId(teamId);
            List<TeamMemberDTO> dtos =
                    memberships.stream().map(this::toTeamMemberDTO).collect(Collectors.toList());
            return ResponseEntity.ok(dtos);
        } catch (Exception e) {
            log.error("Error fetching team members", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch team members"));
        }
    }

    /** Get team invitations (team leaders only) */
    @GetMapping("/{teamId}/invitations")
    @PreAuthorize("@teamSecurity.isTeamLeader(#teamId)")
    public ResponseEntity<?> getTeamInvitations(@PathVariable Long teamId) {
        try {
            List<TeamInvitation> invitations = invitationRepository.findByTeamId(teamId);
            List<InvitationDTO> dtos =
                    invitations.stream().map(this::toInvitationDTO).collect(Collectors.toList());
            return ResponseEntity.ok(dtos);
        } catch (Exception e) {
            log.error("Error fetching team invitations", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch invitations"));
        }
    }

    /** Remove team member (team leader only) */
    @DeleteMapping("/{teamId}/members/{memberId}")
    @PreAuthorize("@teamSecurity.isTeamLeader(#teamId)")
    @Transactional
    public ResponseEntity<?> removeTeamMember(
            @PathVariable Long teamId, @PathVariable Long memberId) {
        try {
            User currentUser = getCurrentUser();

            // Get the user being removed before removing them
            User userToRemove =
                    userRepository
                            .findById(memberId)
                            .orElseThrow(() -> new IllegalArgumentException("Member not found"));
            Team oldTeam = teamRepository.findById(teamId).orElseThrow();

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

            return ResponseEntity.ok(Map.of("message", "Member removed successfully"));
        } catch (SecurityException | IllegalArgumentException | IllegalStateException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error removing team member", e);
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to remove member"));
        }
    }

    /** Leave team (self-removal) */
    @PostMapping("/{teamId}/leave")
    @PreAuthorize("@teamSecurity.isTeamMember(#teamId)")
    @Transactional
    public ResponseEntity<?> leaveTeam(@PathVariable Long teamId) {
        try {
            User currentUser = getCurrentUser();

            // Get the team before leaving
            Team oldTeam = teamRepository.findById(teamId).orElseThrow();

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

            return ResponseEntity.ok(Map.of("message", "Left team successfully"));
        } catch (IllegalArgumentException | IllegalStateException e) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error leaving team", e);
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to leave team"));
        }
    }

    /** Rename team (team leader only) */
    @PostMapping("/{teamId}/rename")
    @PreAuthorize("@teamSecurity.isTeamLeader(#teamId)")
    public ResponseEntity<?> renameTeamByLeader(
            @PathVariable Long teamId, @RequestBody RenameTeamRequest request) {
        try {
            if (request.newName == null || request.newName.trim().isEmpty()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Team name cannot be empty"));
            }

            Team team =
                    teamRepository
                            .findById(teamId)
                            .orElseThrow(() -> new IllegalArgumentException("Team not found"));

            // Prevent renaming personal teams
            if (saasTeamExtensionService.isPersonal(team)) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Cannot rename personal team"));
            }

            // Prevent renaming the Internal team
            if (TeamService.INTERNAL_TEAM_NAME.equals(team.getName())) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Cannot rename Internal team"));
            }

            team.setName(request.newName.trim());
            teamRepository.save(team);

            log.info(
                    "Team {} renamed to {} by leader {}",
                    teamId,
                    request.newName,
                    getCurrentUser().getUsername());

            return ResponseEntity.ok(
                    Map.of("message", "Team renamed successfully", "newName", team.getName()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error renaming team", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to rename team"));
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
    @PostMapping("/{teamId}/seats")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> updateTeamSeats(
            @PathVariable Long teamId, @RequestBody UpdateSeatsRequest request) {
        try {
            saasTeamService.updateTeamSeats(teamId, request.maxSeats);

            Team team = teamRepository.findById(teamId).orElseThrow();
            int maxSeats = saasTeamExtensionService.getMaxSeats(team);
            int seatsUsed = saasTeamExtensionService.getSeatsUsed(team);
            return ResponseEntity.ok(
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
                            maxSeats - seatsUsed));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error updating team seats", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to update team seats"));
        }
    }

    /**
     * Get user's primary team by Supabase UUID (called by Supabase when creating subscriptions)
     *
     * <p>Requires ADMIN_API_KEY or service role authentication
     *
     * <p>Accepts Supabase auth user ID (UUID) and returns the user's primary team information.
     */
    @GetMapping("/user/supabase/{supabaseUserId}/primary")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getUserPrimaryTeamBySupabaseId(@PathVariable String supabaseUserId) {
        try {
            java.util.UUID uuid = java.util.UUID.fromString(supabaseUserId);
            User user =
                    userRepository
                            .findBySupabaseId(uuid)
                            .orElseThrow(() -> new IllegalArgumentException("User not found"));

            Team primaryTeam = user.getTeam();
            if (primaryTeam == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "User has no primary team"));
            }

            return ResponseEntity.ok(
                    Map.of(
                            "teamId", primaryTeam.getId(),
                            "userId", user.getId(),
                            "supabaseUserId", user.getSupabaseId().toString(),
                            "isPersonal", saasTeamExtensionService.isPersonal(primaryTeam),
                            "maxSeats", saasTeamExtensionService.getMaxSeats(primaryTeam)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Invalid UUID format or user not found"));
        } catch (Exception e) {
            log.error("Error fetching user primary team", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch primary team"));
        }
    }

    /**
     * Get detailed team information (for billing dashboard)
     *
     * <p>Requires team membership or admin role
     */
    @GetMapping("/{teamId}")
    @PreAuthorize("@teamSecurity.isTeamMember(#teamId) or hasRole('ADMIN')")
    public ResponseEntity<?> getTeamInfo(@PathVariable Long teamId) {
        try {
            Team team =
                    teamRepository
                            .findById(teamId)
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
            return ResponseEntity.ok(
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
                            members));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error fetching team info", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch team info"));
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
