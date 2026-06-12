package stirling.software.saas.controller;

import java.security.Principal;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Response;

import io.quarkus.arc.profile.IfBuildProfile;

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
@ApplicationScoped
@IfBuildProfile("saas")
@Path("/api/v1/user-role")
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
    @RolesAllowed("ADMIN")
    @POST
    @Path("/upgrade")
    public Response handleUpgrade(@QueryParam("supabaseId") String supabaseId) {

        log.info(
                "Received upgrade request for Supabase ID: {}",
                LogRedactionUtils.redactSupabaseId(supabaseId));

        try {
            boolean upgraded = saasUserAccountService.handleUpgrade(supabaseId);
            if (upgraded) {
                return Response.ok("User upgraded to PRO successfully").build();
            } else {
                return Response.ok("User is already PRO").build();
            }
        } catch (IllegalArgumentException e) {
            log.warn("handleUpgrade rejected: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST).entity("Invalid request").build();
        } catch (Exception e) {
            log.error("Error processing upgrade webhook", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("Error processing webhook")
                    .build();
        }
    }

    /**
     * Webhook endpoint to handle user downgrade from PRO plan. Called by Stripe when a subscription
     * is canceled or expires. Requires ROLE_ADMIN via X-API-KEY authentication.
     *
     * @param supabaseId The Supabase user ID to downgrade
     * @return ResponseEntity with appropriate status
     */
    @RolesAllowed("ADMIN")
    @POST
    @Path("/downgrade")
    public Response handleDowngrade(@QueryParam("supabaseId") String supabaseId) {

        log.info(
                "Received downgrade request for Supabase ID: {}",
                LogRedactionUtils.redactSupabaseId(supabaseId));

        try {
            boolean downgraded = saasUserAccountService.handleDowngrade(supabaseId);
            if (downgraded) {
                return Response.ok("User downgraded to FREE successfully").build();
            } else {
                return Response.ok("User is already on FREE tier").build();
            }
        } catch (IllegalArgumentException e) {
            log.warn("handleDowngrade rejected: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST).entity("Invalid request").build();
        } catch (Exception e) {
            log.error("Error processing downgrade webhook", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("Error processing webhook")
                    .build();
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
    @RolesAllowed("ADMIN")
    @POST
    @Path("/enable-metered-billing")
    public Response enableMeteredBilling(@QueryParam("supabaseId") String supabaseId) {

        log.info(
                "Received request to enable metered billing for Supabase ID: {}",
                LogRedactionUtils.redactSupabaseId(supabaseId));

        try {
            boolean enabled = saasUserAccountService.enableMeteredBilling(supabaseId);
            if (enabled) {
                return Response.ok("Metered billing enabled successfully").build();
            } else {
                return Response.ok("User already has metered billing enabled").build();
            }
        } catch (IllegalArgumentException e) {
            log.warn("enableMeteredBilling rejected: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST).entity("Invalid request").build();
        } catch (Exception e) {
            log.error("Error enabling metered billing", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("Error processing webhook")
                    .build();
        }
    }

    /**
     * Webhook endpoint to disable metered billing for a user. Called by Stripe when the metered
     * subscription is canceled. Requires ROLE_ADMIN via X-API-KEY authentication.
     *
     * @param supabaseId The Supabase user ID
     * @return ResponseEntity with appropriate status
     */
    @RolesAllowed("ADMIN")
    @POST
    @Path("/disable-metered-billing")
    public Response disableMeteredBilling(@QueryParam("supabaseId") String supabaseId) {

        log.info(
                "Received request to disable metered billing for Supabase ID: {}",
                LogRedactionUtils.redactSupabaseId(supabaseId));

        try {
            boolean disabled = saasUserAccountService.disableMeteredBilling(supabaseId);
            if (disabled) {
                return Response.ok("Metered billing disabled successfully").build();
            } else {
                return Response.ok("User does not have metered billing enabled").build();
            }
        } catch (IllegalArgumentException e) {
            log.warn("disableMeteredBilling rejected: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST).entity("Invalid request").build();
        } catch (Exception e) {
            log.error("Error disabling metered billing", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("Error processing webhook")
                    .build();
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
    // TODO: Migration required - @PreAuthorize("isAuthenticated()") complex SpEL; enforce
    // authenticated access via JAX-RS SecurityContext / filter.
    // TODO: Migration required - inject Principal via @jakarta.ws.rs.core.Context SecurityContext
    // (JAX-RS does not bind a bare java.security.Principal parameter like Spring MVC).
    @POST
    @Path("/promptToAuthUser")
    public Response promptToAuthUser(
            @QueryParam("authMethod") String authMethod, Principal principal) {

        try {
            // Principal is guaranteed to be non-null due to @PreAuthorize
            String currentUsername = principal.getName();

            // Normalize and validate authMethod
            String normalizedAuthMethod = normalizeAuthMethod(authMethod);
            if (normalizedAuthMethod != null && !isValidAuthMethod(normalizedAuthMethod)) {
                log.warn("Invalid auth method provided: {}", authMethod);
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Invalid authentication method"))
                        .build();
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
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "No Supabase account linked to current user"))
                        .build();
            }
            SupabaseUser supabaseUser = supabaseUserService.getUser(supabaseId);

            // Verify this is an anonymous user trying to upgrade
            if (!AuthenticationType.ANONYMOUS
                    .name()
                    .equalsIgnoreCase(currentUser.getAuthenticationType())) {
                log.warn("User {} is not anonymous, cannot upgrade", currentUsername);
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "Only anonymous users can be upgraded"))
                        .build();
            }

            // Derive the canonical email from SupabaseUser
            String canonicalEmail = supabaseUser.getEmail();
            if (canonicalEmail == null || canonicalEmail.isBlank()) {
                // Fall back to current user's email if available
                canonicalEmail = currentUser.getEmail();
                if (canonicalEmail == null || canonicalEmail.isBlank()) {
                    log.error(
                            "No email found for user {} in Supabase or local DB", currentUsername);
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", "No email associated with user account"))
                            .build();
                }
            }

            log.debug("Using canonical email {} for user upgrade", canonicalEmail);

            User upgradedUser =
                    saasUserAccountService.synchronizeUserUpgrade(
                            supabaseUser, canonicalEmail, normalizedAuthMethod);

            return Response.ok(
                            Map.of(
                                    "message",
                                    "User upgrade synchronized successfully",
                                    "userId",
                                    upgradedUser.getId().toString(),
                                    "email",
                                    upgradedUser.getEmail() != null
                                            ? upgradedUser.getEmail()
                                            : upgradedUser.getUsername()))
                    .build();

        } catch (IllegalStateException e) {
            log.error("User not found for upgrade: {}", e.getMessage());
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "User not found"))
                    .build();
        } catch (Exception e) {
            log.error("Error synchronizing user upgrade", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to synchronize user upgrade"))
                    .build();
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
