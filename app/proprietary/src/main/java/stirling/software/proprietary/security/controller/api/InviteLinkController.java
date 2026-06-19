package stirling.software.proprietary.security.controller.api;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.*;

import org.jboss.resteasy.reactive.RestForm;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.UriInfo;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.InviteApi;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.InviteToken;
import stirling.software.proprietary.security.repository.InviteTokenRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.security.service.SaveUserRequest;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@InviteApi
@jakarta.ws.rs.Path("/api/v1/invite")
@ApplicationScoped
@Slf4j
public class InviteLinkController {

    @Inject InviteTokenRepository inviteTokenRepository;
    @Inject TeamRepository teamRepository;
    @Inject UserService userService;
    @Inject ApplicationProperties applicationProperties;
    @Inject Instance<EmailService> emailService;
    @Inject UserLicenseSettingsService userLicenseSettingsService;

    /**
     * Generate a new invite link (admin only)
     *
     * @param email The email address to invite
     * @param role The role to assign (default: ROLE_USER)
     * @param teamId The team to assign (optional, uses default team if not provided)
     * @param expiryHours Custom expiry hours (optional, uses default from config)
     * @param sendEmail Whether to send the invite link via email (default: false)
     * @param securityContext The authenticated admin user
     * @param uriInfo The request URI info
     * @return Response with the invite link or error
     */
    @RolesAllowed("ADMIN")
    @POST
    @jakarta.ws.rs.Path("/generate")
    public Response generateInviteLink(
            @RestForm("email") String email,
            @RestForm("role") String role,
            @RestForm("teamId") Long teamId,
            @RestForm("expiryHours") Integer expiryHours,
            @RestForm("sendEmail") Boolean sendEmail,
            @RestForm("frontendBaseUrl") String frontendBaseUrl,
            @Context SecurityContext securityContext,
            @Context UriInfo uriInfo) {

        // @RequestParam defaults applied manually (JAX-RS @RestForm has no defaultValue)
        if (role == null) {
            role = "ROLE_USER";
        }
        boolean sendEmailFlag = sendEmail != null && sendEmail;
        Principal principal = securityContext.getUserPrincipal();

        try {
            // Check if email invites are enabled
            if (!applicationProperties.getMail().isEnableInvites()) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Email invites are not enabled"))
                        .build();
            }

            // If email is provided, validate and check for conflicts
            if (email != null && !email.trim().isEmpty()) {
                // Validate email format
                if (!email.contains("@")) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", "Invalid email address"))
                            .build();
                }

                email = email.trim().toLowerCase();

                // Check if user already exists
                if (userService.usernameExistsIgnoreCase(email)) {
                    return Response.status(Response.Status.CONFLICT)
                            .entity(Map.of("error", "User already exists"))
                            .build();
                }

                // Check if there's already an active invite for this email
                Optional<InviteToken> existingInvite = inviteTokenRepository.findByEmail(email);
                if (existingInvite.isPresent() && existingInvite.get().isValid()) {
                    return Response.status(Response.Status.CONFLICT)
                            .entity(
                                    Map.of(
                                            "error",
                                            "An active invite already exists for this email"
                                                    + " address"))
                            .build();
                }

            } else {
                // No email provided - this is a general invite link
                email = null; // Ensure it's null, not empty string

                // Cannot send email if no email address provided
                if (sendEmailFlag) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", "Cannot send email without an email address"))
                            .build();
                }
            }

            // Check license limits
            if (applicationProperties.getPremium().isEnabled()) {
                long currentUserCount = userService.getTotalUsersCount();
                long activeInvites = inviteTokenRepository.countActiveInvites(LocalDateTime.now());
                int maxUsers = userLicenseSettingsService.calculateMaxAllowedUsers();

                if (currentUserCount + activeInvites >= maxUsers) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(
                                    Map.of(
                                            "error",
                                            "License limit reached ("
                                                    + (currentUserCount + activeInvites)
                                                    + "/"
                                                    + maxUsers
                                                    + " users). Contact your administrator to"
                                                    + " upgrade your license."))
                            .build();
                }
            }

            // Validate role
            try {
                Role roleEnum = Role.fromString(role);
                if (roleEnum == Role.INTERNAL_API_USER) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", "Cannot assign INTERNAL_API_USER role"))
                            .build();
                }
            } catch (IllegalArgumentException e) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Invalid role specified"))
                        .build();
            }

            // Determine team
            Long effectiveTeamId = teamId;
            if (effectiveTeamId == null) {
                Team defaultTeam =
                        teamRepository.findByName(TeamService.DEFAULT_TEAM_NAME).orElse(null);
                if (defaultTeam != null) {
                    effectiveTeamId = defaultTeam.getId();
                }
            } else {
                Team selectedTeam = teamRepository.findByIdOptional(effectiveTeamId).orElse(null);
                if (selectedTeam != null
                        && TeamService.INTERNAL_TEAM_NAME.equals(selectedTeam.getName())) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", "Cannot assign users to Internal team"))
                            .build();
                }
            }

            // Generate token
            String token = UUID.randomUUID().toString();

            // Determine expiry time
            int effectiveExpiryHours =
                    (expiryHours != null && expiryHours > 0)
                            ? expiryHours
                            : applicationProperties.getMail().getInviteLinkExpiryHours();
            LocalDateTime expiresAt = LocalDateTime.now().plusHours(effectiveExpiryHours);

            // Create invite token
            InviteToken inviteToken = new InviteToken();
            inviteToken.setToken(token);
            inviteToken.setEmail(email);
            inviteToken.setRole(role);
            inviteToken.setTeamId(effectiveTeamId);
            inviteToken.setExpiresAt(expiresAt);
            inviteToken.setCreatedBy(principal.getName());

            inviteTokenRepository.persist(inviteToken);

            // Build invite URL: system.frontendUrl → caller's frontendBaseUrl → system.backendUrl →
            // request URL
            String baseUrl;
            String configuredFrontendUrl = applicationProperties.getSystem().getFrontendUrl();
            String configuredBackendUrl = applicationProperties.getSystem().getBackendUrl();
            if (configuredFrontendUrl != null && !configuredFrontendUrl.trim().isEmpty()) {
                baseUrl = configuredFrontendUrl.trim();
            } else if (frontendBaseUrl != null && !frontendBaseUrl.trim().isEmpty()) {
                baseUrl = frontendBaseUrl.trim();
            } else if (configuredBackendUrl != null && !configuredBackendUrl.trim().isEmpty()) {
                baseUrl = configuredBackendUrl.trim();
            } else {
                // Derive from the incoming request via JAX-RS UriInfo
                java.net.URI requestUri = uriInfo.getRequestUri();
                int port = requestUri.getPort();
                baseUrl =
                        requestUri.getScheme()
                                + "://"
                                + requestUri.getHost()
                                + (port != -1 && port != 80 && port != 443 ? ":" + port : "");
            }
            if (baseUrl.endsWith("/")) {
                baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
            }
            String inviteUrl = baseUrl + "/invite/" + token;

            log.info("Generated invite link for {} by {}", email, principal.getName());

            // Optionally send email
            boolean emailSent = false;
            String emailError = null;
            if (sendEmailFlag) {
                if (!emailService.isResolvable()) {
                    emailError = "Email service is not configured";
                    log.warn("Cannot send invite email: Email service not configured");
                } else {
                    try {
                        emailService
                                .get()
                                .sendInviteLinkEmail(email, inviteUrl, expiresAt.toString());
                        emailSent = true;
                        log.info("Sent invite link email to: {}", email);
                    } catch (Exception emailEx) {
                        emailError = emailEx.getMessage();
                        log.error(
                                "Failed to send invite email to {}: {}",
                                email,
                                emailEx.getMessage());
                    }
                }
            }

            Map<String, Object> response = new HashMap<>();
            response.put("token", token);
            response.put("inviteUrl", inviteUrl);
            response.put("email", email);
            response.put("expiresAt", expiresAt.toString());
            response.put("expiryHours", effectiveExpiryHours);
            if (sendEmailFlag) {
                response.put("emailSent", emailSent);
                if (emailError != null) {
                    response.put("emailError", emailError);
                }
            }

            return Response.ok(response, MediaType.APPLICATION_JSON).build();

        } catch (Exception e) {
            log.error("Failed to generate invite link: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to generate invite link: " + e.getMessage()))
                    .build();
        }
    }

    /**
     * List all active invite links (admin only)
     *
     * @return List of active invite tokens
     */
    @RolesAllowed("ADMIN")
    @GET
    @jakarta.ws.rs.Path("/list")
    public Response listInviteLinks() {
        try {
            List<InviteToken> activeInvites =
                    inviteTokenRepository.findByUsedFalseAndExpiresAtAfter(LocalDateTime.now());

            List<Map<String, Object>> inviteList =
                    activeInvites.stream()
                            .map(
                                    invite -> {
                                        Map<String, Object> inviteMap = new HashMap<>();
                                        inviteMap.put("id", invite.getId());
                                        inviteMap.put("email", invite.getEmail());
                                        inviteMap.put("role", invite.getRole());
                                        inviteMap.put("teamId", invite.getTeamId());
                                        inviteMap.put("createdBy", invite.getCreatedBy());
                                        inviteMap.put(
                                                "createdAt", invite.getCreatedAt().toString());
                                        inviteMap.put(
                                                "expiresAt", invite.getExpiresAt().toString());
                                        return inviteMap;
                                    })
                            .toList();

            return Response.ok(Map.of("invites", inviteList), MediaType.APPLICATION_JSON).build();

        } catch (Exception e) {
            log.error("Failed to list invite links: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to list invite links"))
                    .build();
        }
    }

    /**
     * Revoke an invite link (admin only)
     *
     * @param inviteId The invite token ID to revoke
     * @return Success or error response
     */
    @RolesAllowed("ADMIN")
    @DELETE
    @jakarta.ws.rs.Path("/revoke/{inviteId}")
    public Response revokeInviteLink(@PathParam("inviteId") Long inviteId) {
        try {
            Optional<InviteToken> inviteOpt = inviteTokenRepository.findByIdOptional(inviteId);
            if (inviteOpt.isEmpty()) {
                return Response.status(Response.Status.NOT_FOUND)
                        .entity(Map.of("error", "Invite not found"))
                        .build();
            }

            inviteTokenRepository.deleteById(inviteId);
            log.info("Revoked invite link ID: {}", inviteId);

            return Response.ok(
                            Map.of("message", "Invite link revoked successfully"),
                            MediaType.APPLICATION_JSON)
                    .build();

        } catch (Exception e) {
            log.error("Failed to revoke invite link: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to revoke invite link"))
                    .build();
        }
    }

    /**
     * Clean up expired invite tokens (admin only)
     *
     * @return Number of deleted tokens
     */
    @RolesAllowed("ADMIN")
    @POST
    @jakarta.ws.rs.Path("/cleanup")
    public Response cleanupExpiredInvites() {
        try {
            List<InviteToken> expiredInvites =
                    inviteTokenRepository.findAll().list().stream()
                            .filter(invite -> !invite.isValid())
                            .toList();

            int count = expiredInvites.size();
            expiredInvites.forEach(inviteTokenRepository::delete);

            log.info("Cleaned up {} expired invite tokens", count);

            return Response.ok(Map.of("deletedCount", count), MediaType.APPLICATION_JSON).build();

        } catch (Exception e) {
            log.error("Failed to cleanup expired invites: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to cleanup expired invites"))
                    .build();
        }
    }

    /**
     * Validate an invite token (public endpoint)
     *
     * @param token The invite token to validate
     * @return Invite details if valid, error otherwise
     */
    @GET
    @jakarta.ws.rs.Path("/validate/{token}")
    public Response validateInviteToken(@PathParam("token") String token) {
        try {
            Optional<InviteToken> inviteOpt = inviteTokenRepository.findByToken(token);

            if (inviteOpt.isEmpty()) {
                return invalidInviteResponse();
            }

            InviteToken invite = inviteOpt.get();

            if (invite.isUsed()) {
                return invalidInviteResponse();
            }

            if (invite.isExpired()) {
                return invalidInviteResponse();
            }

            // Check if user already exists (only if email is pre-set)
            if (invite.getEmail() != null
                    && userService.usernameExistsIgnoreCase(invite.getEmail())) {
                return invalidInviteResponse();
            }

            Map<String, Object> response = new HashMap<>();
            response.put("email", invite.getEmail());
            response.put("role", invite.getRole());
            response.put("expiresAt", invite.getExpiresAt().toString());
            response.put("emailRequired", invite.getEmail() == null);

            return Response.ok(response, MediaType.APPLICATION_JSON).build();

        } catch (Exception e) {
            log.error("Failed to validate invite token: {}", e.getMessage(), e);
            return invalidInviteResponse();
        }
    }

    /**
     * Accept an invite and create user account (public endpoint)
     *
     * @param token The invite token
     * @param email The email address (required if not pre-set in invite)
     * @param password The password to set for the new account
     * @return Success or error response
     */
    @POST
    @jakarta.ws.rs.Path("/accept/{token}")
    public Response acceptInvite(
            @PathParam("token") String token,
            @RestForm("email") String email,
            @RestForm("password") String password) {
        try {
            // Validate password
            if (password == null || password.isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Password is required"))
                        .build();
            }

            Optional<InviteToken> inviteOpt = inviteTokenRepository.findByToken(token);

            if (inviteOpt.isEmpty()) {
                return invalidInviteResponse();
            }

            InviteToken invite = inviteOpt.get();

            if (invite.isUsed()) {
                return invalidInviteResponse();
            }

            if (invite.isExpired()) {
                return invalidInviteResponse();
            }

            // Determine the email to use
            String effectiveEmail = invite.getEmail();
            if (effectiveEmail == null) {
                // Email not pre-set, must be provided by user
                if (email == null || email.trim().isEmpty()) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", "Email address is required"))
                            .build();
                }

                // Validate email format
                if (!email.contains("@")) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", "Invalid email address"))
                            .build();
                }

                effectiveEmail = email.trim().toLowerCase();
            }

            // Check if user already exists
            if (userService.usernameExistsIgnoreCase(effectiveEmail)) {
                return invalidInviteResponse();
            }

            // Create the user account
            SaveUserRequest.Builder builder =
                    SaveUserRequest.builder()
                            .username(effectiveEmail)
                            .password(password)
                            .teamId(invite.getTeamId())
                            .role(invite.getRole());
            userService.saveUserCore(builder.build());

            // Mark invite as used
            invite.setUsed(true);
            invite.setUsedAt(LocalDateTime.now());
            inviteTokenRepository.persist(invite);

            log.info(
                    "User account created via invite link: {} with role: {}",
                    effectiveEmail,
                    invite.getRole());

            return Response.ok(
                            Map.of(
                                    "message",
                                    "Account created successfully",
                                    "username",
                                    effectiveEmail),
                            MediaType.APPLICATION_JSON)
                    .build();

        } catch (Exception e) {
            log.error("Failed to accept invite: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to create account"))
                    .build();
        }
    }

    private Response invalidInviteResponse() {
        return Response.status(Response.Status.NOT_FOUND)
                .entity(Map.of("error", "Invalid invite link"))
                .build();
    }
}
