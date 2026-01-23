package stirling.software.proprietary.security.controller.api;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
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

@InviteApi
@Slf4j
@RequiredArgsConstructor
public class InviteLinkController {

    private final InviteTokenRepository inviteTokenRepository;
    private final TeamRepository teamRepository;
    private final UserService userService;
    private final ApplicationProperties applicationProperties;
    private final Optional<EmailService> emailService;

    /**
     * Generate a new invite link (admin only)
     *
     * @param email The email address to invite
     * @param role The role to assign (default: ROLE_USER)
     * @param teamId The team to assign (optional, uses default team if not provided)
     * @param expiryHours Custom expiry hours (optional, uses default from config)
     * @param sendEmail Whether to send the invite link via email (default: false)
     * @param principal The authenticated admin user
     * @param request The HTTP request
     * @return ResponseEntity with the invite link or error
     */
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/generate")
    public ResponseEntity<?> generateInviteLink(
            @RequestParam(name = "email", required = false) String email,
            @RequestParam(name = "role", defaultValue = "ROLE_USER") String role,
            @RequestParam(name = "teamId", required = false) Long teamId,
            @RequestParam(name = "expiryHours", required = false) Integer expiryHours,
            @RequestParam(name = "sendEmail", defaultValue = "false") boolean sendEmail,
            Principal principal,
            HttpServletRequest request) {

        try {
            // Check if email invites are enabled
            if (!applicationProperties.getMail().isEnableInvites()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Email invites are not enabled"));
            }

            // If email is provided, validate and check for conflicts
            if (email != null && !email.trim().isEmpty()) {
                // Validate email format
                if (!email.contains("@")) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "Invalid email address"));
                }

                email = email.trim().toLowerCase();

                // Check if user already exists
                if (userService.usernameExistsIgnoreCase(email)) {
                    return ResponseEntity.status(HttpStatus.CONFLICT)
                            .body(Map.of("error", "User already exists"));
                }

                // Check if there's already an active invite for this email
                Optional<InviteToken> existingInvite = inviteTokenRepository.findByEmail(email);
                if (existingInvite.isPresent() && existingInvite.get().isValid()) {
                    return ResponseEntity.status(HttpStatus.CONFLICT)
                            .body(
                                    Map.of(
                                            "error",
                                            "An active invite already exists for this email"
                                                    + " address"));
                }

                // If sendEmail is requested but no email provided, reject
                if (sendEmail) {
                    // Email will be sent
                }
            } else {
                // No email provided - this is a general invite link
                email = null; // Ensure it's null, not empty string

                // Cannot send email if no email address provided
                if (sendEmail) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "Cannot send email without an email address"));
                }
            }

            // Check license limits
            if (applicationProperties.getPremium().isEnabled()) {
                long currentUserCount = userService.getTotalUsersCount();
                long activeInvites = inviteTokenRepository.countActiveInvites(LocalDateTime.now());
                int maxUsers = applicationProperties.getPremium().getMaxUsers();

                if (currentUserCount + activeInvites >= maxUsers) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(
                                    Map.of(
                                            "error",
                                            "License limit reached ("
                                                    + (currentUserCount + activeInvites)
                                                    + "/"
                                                    + maxUsers
                                                    + " users). Contact your administrator to"
                                                    + " upgrade your license."));
                }
            }

            // Validate role
            try {
                Role roleEnum = Role.fromString(role);
                if (roleEnum == Role.INTERNAL_API_USER) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "Cannot assign INTERNAL_API_USER role"));
                }
            } catch (IllegalArgumentException e) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Invalid role specified"));
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
                Team selectedTeam = teamRepository.findById(effectiveTeamId).orElse(null);
                if (selectedTeam != null
                        && TeamService.INTERNAL_TEAM_NAME.equals(selectedTeam.getName())) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "Cannot assign users to Internal team"));
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

            inviteTokenRepository.save(inviteToken);

            // Build invite URL
            // Use configured frontend URL if available, otherwise fall back to backend URL
            String baseUrl;
            String configuredFrontendUrl = applicationProperties.getSystem().getFrontendUrl();
            if (configuredFrontendUrl != null && !configuredFrontendUrl.trim().isEmpty()) {
                // Use configured frontend URL (remove trailing slash if present)
                baseUrl =
                        configuredFrontendUrl.endsWith("/")
                                ? configuredFrontendUrl.substring(
                                        0, configuredFrontendUrl.length() - 1)
                                : configuredFrontendUrl;
            } else {
                // Fall back to backend URL from request
                baseUrl =
                        request.getScheme()
                                + "://"
                                + request.getServerName()
                                + (request.getServerPort() != 80 && request.getServerPort() != 443
                                        ? ":" + request.getServerPort()
                                        : "");
            }
            String inviteUrl = baseUrl + "/invite?token=" + token;

            log.info("Generated invite link for {} by {}", email, principal.getName());

            // Optionally send email
            boolean emailSent = false;
            String emailError = null;
            if (sendEmail) {
                if (!emailService.isPresent()) {
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
            if (sendEmail) {
                response.put("emailSent", emailSent);
                if (emailError != null) {
                    response.put("emailError", emailError);
                }
            }

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Failed to generate invite link: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to generate invite link: " + e.getMessage()));
        }
    }

    /**
     * List all active invite links (admin only)
     *
     * @return List of active invite tokens
     */
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @GetMapping("/list")
    public ResponseEntity<?> listInviteLinks() {
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
                            .collect(Collectors.toList());

            return ResponseEntity.ok(Map.of("invites", inviteList));

        } catch (Exception e) {
            log.error("Failed to list invite links: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to list invite links"));
        }
    }

    /**
     * Revoke an invite link (admin only)
     *
     * @param inviteId The invite token ID to revoke
     * @return Success or error response
     */
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @DeleteMapping("/revoke/{inviteId}")
    public ResponseEntity<?> revokeInviteLink(@PathVariable Long inviteId) {
        try {
            Optional<InviteToken> inviteOpt = inviteTokenRepository.findById(inviteId);
            if (inviteOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Invite not found"));
            }

            inviteTokenRepository.deleteById(inviteId);
            log.info("Revoked invite link ID: {}", inviteId);

            return ResponseEntity.ok(Map.of("message", "Invite link revoked successfully"));

        } catch (Exception e) {
            log.error("Failed to revoke invite link: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to revoke invite link"));
        }
    }

    /**
     * Clean up expired invite tokens (admin only)
     *
     * @return Number of deleted tokens
     */
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @PostMapping("/cleanup")
    public ResponseEntity<?> cleanupExpiredInvites() {
        try {
            List<InviteToken> expiredInvites =
                    inviteTokenRepository.findAll().stream()
                            .filter(invite -> !invite.isValid())
                            .collect(Collectors.toList());

            int count = expiredInvites.size();
            inviteTokenRepository.deleteAll(expiredInvites);

            log.info("Cleaned up {} expired invite tokens", count);

            return ResponseEntity.ok(Map.of("deletedCount", count));

        } catch (Exception e) {
            log.error("Failed to cleanup expired invites: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to cleanup expired invites"));
        }
    }

    /**
     * Validate an invite token (public endpoint)
     *
     * @param token The invite token to validate
     * @return Invite details if valid, error otherwise
     */
    @GetMapping("/validate/{token}")
    public ResponseEntity<?> validateInviteToken(@PathVariable String token) {
        try {
            Optional<InviteToken> inviteOpt = inviteTokenRepository.findByToken(token);

            if (inviteOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Invalid invite link"));
            }

            InviteToken invite = inviteOpt.get();

            if (invite.isUsed()) {
                return ResponseEntity.status(HttpStatus.GONE)
                        .body(Map.of("error", "This invite link has already been used"));
            }

            if (invite.isExpired()) {
                return ResponseEntity.status(HttpStatus.GONE)
                        .body(Map.of("error", "This invite link has expired"));
            }

            // Check if user already exists (only if email is pre-set)
            if (invite.getEmail() != null
                    && userService.usernameExistsIgnoreCase(invite.getEmail())) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "User already exists"));
            }

            Map<String, Object> response = new HashMap<>();
            response.put("email", invite.getEmail());
            response.put("role", invite.getRole());
            response.put("expiresAt", invite.getExpiresAt().toString());
            response.put("emailRequired", invite.getEmail() == null);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Failed to validate invite token: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to validate invite link"));
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
    @PostMapping("/accept/{token}")
    public ResponseEntity<?> acceptInvite(
            @PathVariable String token,
            @RequestParam(name = "email", required = false) String email,
            @RequestParam(name = "password") String password) {
        try {
            // Validate password
            if (password == null || password.isEmpty()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Password is required"));
            }

            Optional<InviteToken> inviteOpt = inviteTokenRepository.findByToken(token);

            if (inviteOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Invalid invite link"));
            }

            InviteToken invite = inviteOpt.get();

            if (invite.isUsed()) {
                return ResponseEntity.status(HttpStatus.GONE)
                        .body(Map.of("error", "This invite link has already been used"));
            }

            if (invite.isExpired()) {
                return ResponseEntity.status(HttpStatus.GONE)
                        .body(Map.of("error", "This invite link has expired"));
            }

            // Determine the email to use
            String effectiveEmail = invite.getEmail();
            if (effectiveEmail == null) {
                // Email not pre-set, must be provided by user
                if (email == null || email.trim().isEmpty()) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "Email address is required"));
                }

                // Validate email format
                if (!email.contains("@")) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "Invalid email address"));
                }

                effectiveEmail = email.trim().toLowerCase();
            }

            // Check if user already exists
            if (userService.usernameExistsIgnoreCase(effectiveEmail)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "User already exists"));
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
            inviteTokenRepository.save(invite);

            log.info(
                    "User account created via invite link: {} with role: {}",
                    effectiveEmail,
                    invite.getRole());

            return ResponseEntity.ok(
                    Map.of("message", "Account created successfully", "username", effectiveEmail));

        } catch (Exception e) {
            log.error("Failed to accept invite: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to create account: " + e.getMessage()));
        }
    }
}
