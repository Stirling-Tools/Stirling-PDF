package stirling.software.saas.controller;

import java.security.Principal;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.model.SupabaseUser;
import stirling.software.saas.service.SaasUserAccountService;
import stirling.software.saas.service.SupabaseUserService;
import stirling.software.saas.util.LogRedactionUtils;

/**
 * Controller for handling user role upgrades/downgrades via webhooks. These endpoints are
 * authenticated via X-API-KEY header with admin privileges. Configure external services (Stripe,
 * etc.) to call these endpoints with your admin API key.
 */
@Hidden
@RestController
@Profile("saas")
@RequestMapping("/api/v1/user-role")
@Slf4j
@RequiredArgsConstructor
public class UserRoleWebhookController {

    private final UserService userService;
    private final SaasUserAccountService saasUserAccountService;
    private final SupabaseUserService supabaseUserService;

    /**
     * Webhook endpoint to handle user upgrade to PRO plan. Called by Stripe when a subscription is
     * successfully created or a payment succeeds. Requires ROLE_ADMIN via X-API-KEY authentication.
     *
     * @param supabaseId The Supabase user ID to upgrade
     * @return ResponseEntity with appropriate status
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/upgrade")
    public ResponseEntity<String> handleUpgrade(@RequestParam("supabaseId") String supabaseId) {

        log.info(
                "Received upgrade request for Supabase ID: {}",
                LogRedactionUtils.redactSupabaseId(supabaseId));

        try {
            boolean upgraded = saasUserAccountService.handleUpgrade(supabaseId);
            if (upgraded) {
                return ResponseEntity.ok("User upgraded to PRO successfully");
            } else {
                return ResponseEntity.ok("User is already PRO");
            }
        } catch (IllegalArgumentException e) {
            log.warn("handleUpgrade rejected: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid request");
        } catch (Exception e) {
            log.error("Error processing upgrade webhook", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error processing webhook");
        }
    }

    /**
     * Webhook endpoint to handle user downgrade from PRO plan. Called by Stripe when a subscription
     * is canceled or expires. Requires ROLE_ADMIN via X-API-KEY authentication.
     *
     * @param supabaseId The Supabase user ID to downgrade
     * @return ResponseEntity with appropriate status
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/downgrade")
    public ResponseEntity<String> handleDowngrade(@RequestParam("supabaseId") String supabaseId) {

        log.info(
                "Received downgrade request for Supabase ID: {}",
                LogRedactionUtils.redactSupabaseId(supabaseId));

        try {
            boolean downgraded = saasUserAccountService.handleDowngrade(supabaseId);
            if (downgraded) {
                return ResponseEntity.ok("User downgraded to FREE successfully");
            } else {
                return ResponseEntity.ok("User is already on FREE tier");
            }
        } catch (IllegalArgumentException e) {
            log.warn("handleDowngrade rejected: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid request");
        } catch (Exception e) {
            log.error("Error processing downgrade webhook", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error processing webhook");
        }
    }

    /**
     * Webhook endpoint to enable metered billing (pay-what-you-use) for a user. Called by Stripe
     * when a user subscribes to the metered billing plan. Can be combined with Pro subscription.
     * Requires ROLE_ADMIN via X-API-KEY authentication.
     *
     * @param supabaseId The Supabase user ID
     * @return ResponseEntity with appropriate status
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/enable-metered-billing")
    public ResponseEntity<String> enableMeteredBilling(
            @RequestParam("supabaseId") String supabaseId) {

        log.info(
                "Received request to enable metered billing for Supabase ID: {}",
                LogRedactionUtils.redactSupabaseId(supabaseId));

        try {
            boolean enabled = saasUserAccountService.enableMeteredBilling(supabaseId);
            if (enabled) {
                return ResponseEntity.ok("Metered billing enabled successfully");
            } else {
                return ResponseEntity.ok("User already has metered billing enabled");
            }
        } catch (IllegalArgumentException e) {
            log.warn("enableMeteredBilling rejected: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid request");
        } catch (Exception e) {
            log.error("Error enabling metered billing", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error processing webhook");
        }
    }

    /**
     * Webhook endpoint to disable metered billing for a user. Called by Stripe when the metered
     * subscription is canceled. Requires ROLE_ADMIN via X-API-KEY authentication.
     *
     * @param supabaseId The Supabase user ID
     * @return ResponseEntity with appropriate status
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/disable-metered-billing")
    public ResponseEntity<String> disableMeteredBilling(
            @RequestParam("supabaseId") String supabaseId) {

        log.info(
                "Received request to disable metered billing for Supabase ID: {}",
                LogRedactionUtils.redactSupabaseId(supabaseId));

        try {
            boolean disabled = saasUserAccountService.disableMeteredBilling(supabaseId);
            if (disabled) {
                return ResponseEntity.ok("Metered billing disabled successfully");
            } else {
                return ResponseEntity.ok("User does not have metered billing enabled");
            }
        } catch (IllegalArgumentException e) {
            log.warn("disableMeteredBilling rejected: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid request");
        } catch (Exception e) {
            log.error("Error disabling metered billing", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error processing webhook");
        }
    }

    /**
     * Synchronizes the current user's upgrade from anonymous to authenticated status. This endpoint
     * is called after Supabase has successfully upgraded the user. It ensures the local database is
     * synchronized with the Supabase auth state.
     *
     * <p>Only allows users to upgrade their own account; the user is determined from the
     * SecurityContext. The email is derived from the SupabaseUser to prevent client tampering.
     *
     * @param authMethod the authentication method used (e.g., "email", "google", "github")
     * @return ResponseEntity with success or error message
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/promptToAuthUser")
    public ResponseEntity<Map<String, String>> promptToAuthUser(
            @RequestParam(value = "authMethod", required = false) String authMethod,
            Principal principal) {

        try {
            // Principal is guaranteed to be non-null due to @PreAuthorize
            String currentUsername = principal.getName();

            // Normalize and validate authMethod
            String normalizedAuthMethod = normalizeAuthMethod(authMethod);
            if (normalizedAuthMethod != null && !isValidAuthMethod(normalizedAuthMethod)) {
                log.warn("Invalid auth method provided: {}", authMethod);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Invalid authentication method"));
            }

            log.debug(
                    "User {} attempting to synchronize upgrade using method: {}",
                    currentUsername,
                    normalizedAuthMethod);

            // Find the current user
            User currentUser =
                    userService
                            .findByUsername(currentUsername)
                            .orElseThrow(
                                    () ->
                                            new IllegalStateException(
                                                    "Current user not found: " + currentUsername));

            // Get the SupabaseUser linked to current user. consolidation stores the linkage as a
            // plain UUID column on User (no JPA relationship), so we resolve via
            // SupabaseUserService.
            UUID supabaseId = currentUser.getSupabaseId();
            if (supabaseId == null) {
                log.error("Current user {} has no linked Supabase ID", currentUsername);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "No Supabase account linked to current user"));
            }
            SupabaseUser supabaseUser = supabaseUserService.getUser(supabaseId);

            // Verify this is an anonymous user trying to upgrade
            if (!AuthenticationType.ANONYMOUS
                    .name()
                    .equalsIgnoreCase(currentUser.getAuthenticationType())) {
                log.warn("User {} is not anonymous, cannot upgrade", currentUsername);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Only anonymous users can be upgraded"));
            }

            // Derive the canonical email from SupabaseUser
            String canonicalEmail = supabaseUser.getEmail();
            if (canonicalEmail == null || canonicalEmail.isBlank()) {
                // Fall back to current user's email if available
                canonicalEmail = currentUser.getEmail();
                if (canonicalEmail == null || canonicalEmail.isBlank()) {
                    log.error(
                            "No email found for user {} in Supabase or local DB", currentUsername);
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "No email associated with user account"));
                }
            }

            log.debug("Using canonical email {} for user upgrade", canonicalEmail);

            User upgradedUser =
                    saasUserAccountService.synchronizeUserUpgrade(
                            supabaseUser, canonicalEmail, normalizedAuthMethod);

            return ResponseEntity.ok(
                    Map.of(
                            "message",
                            "User upgrade synchronized successfully",
                            "userId",
                            upgradedUser.getId().toString(),
                            "email",
                            upgradedUser.getEmail() != null
                                    ? upgradedUser.getEmail()
                                    : upgradedUser.getUsername()));

        } catch (IllegalStateException e) {
            log.error("User not found for upgrade: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "User not found"));
        } catch (Exception e) {
            log.error("Error synchronizing user upgrade", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to synchronize user upgrade"));
        }
    }

    /** Normalizes the auth method string to lowercase and trims whitespace. */
    private String normalizeAuthMethod(String authMethod) {
        return authMethod == null ? null : authMethod.trim().toLowerCase(Locale.ROOT);
    }

    /** Validates that the auth method is one of the allowed values. */
    private boolean isValidAuthMethod(String authMethod) {
        if (authMethod == null) {
            return true; // null is valid (will default to email/web auth)
        }

        // Define allowed auth methods
        return Set.of("email", "oauth", "google", "github", "apple", "azure", "linkedin_oidc")
                .contains(authMethod);
    }
}
