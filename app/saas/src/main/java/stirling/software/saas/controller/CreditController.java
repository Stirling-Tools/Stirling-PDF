package stirling.software.saas.controller;

import java.util.Map;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Response;

import io.quarkus.arc.profile.IfBuildProfile;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.security.Authentication;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.CreditService.CreditSummary;
import stirling.software.saas.util.LogRedactionUtils;

@ApplicationScoped
@IfBuildProfile("saas")
@Path("/api/v1/credits")
@Tag(name = "Credit Management", description = "Endpoints for managing user API credits")
@RequiredArgsConstructor
@Slf4j
public class CreditController {

    private final CreditService creditService;

    @GET
    @Hidden
    @Operation(
            summary = "Get user credit information",
            description =
                    "Retrieve current credit balance and usage statistics for the authenticated user")
    @ApiResponse(
            responseCode = "200",
            description = "Credit information retrieved successfully",
            content = @Content(schema = @Schema(implementation = CreditSummary.class)))
    public Response getUserCredits(Authentication authentication) {
        return Response.ok(getCreditSummaryForAuthentication(authentication)).build();
    }

    @POST
    @Path("/purchase")
    @Hidden
    @Operation(
            summary = "Purchase additional credits",
            description = "Add bought credits to user account (admin only)")
    @RolesAllowed("ADMIN")
    @ApiResponse(responseCode = "200", description = "Credits purchased successfully")
    public Response purchaseCredits(
            @QueryParam("username") String username, @QueryParam("credits") int credits) {

        if (credits <= 0) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Credits must be positive"))
                    .build();
        }

        try {
            creditService.addBoughtCredits(username, credits);
            log.info("Admin added {} credits to user: {}", credits, username);
            return Response.ok(Map.of("success", true, "creditsAdded", credits)).build();
        } catch (IllegalArgumentException e) {
            log.warn("purchaseCredits rejected: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Invalid request"))
                    .build();
        }
    }

    @POST
    @Path("/purchase-by-supabase-id")
    @Hidden
    @Operation(
            summary = "Purchase additional credits by Supabase ID",
            description = "Add bought credits to user account using Supabase ID (admin only)")
    @RolesAllowed("ADMIN")
    @ApiResponse(responseCode = "200", description = "Credits purchased successfully")
    public Response purchaseCreditsBySupabaseId(
            @QueryParam("supabaseId") String supabaseId, @QueryParam("credits") int credits) {

        if (credits <= 0) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Credits must be positive"))
                    .build();
        }

        try {
            creditService.addBoughtCreditsBySupabaseId(supabaseId, credits);
            log.info(
                    "Admin added {} credits to user with Supabase ID: {}",
                    credits,
                    LogRedactionUtils.redactSupabaseId(supabaseId));
            return Response.ok(Map.of("success", true, "creditsAdded", credits)).build();
        } catch (IllegalArgumentException e) {
            log.warn("purchaseCreditsBySupabaseId rejected: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Invalid request"))
                    .build();
        }
    }

    @GET
    @Path("/user/{username}")
    @Hidden
    @Operation(
            summary = "Get credit information for specific user",
            description = "Retrieve credit information for a specific user (admin only)")
    @RolesAllowed("ADMIN")
    @ApiResponse(
            responseCode = "200",
            description = "User credit information retrieved successfully",
            content = @Content(schema = @Schema(implementation = CreditSummary.class)))
    public Response getUserCreditsAdmin(@PathParam("username") String username) {
        CreditSummary summary = creditService.getCreditSummary(username);
        return Response.ok(summary).build();
    }

    @GET
    @Path("/user-by-supabase-id/{supabaseId}")
    @Hidden
    @Operation(
            summary = "Get credit information for specific user by Supabase ID",
            description =
                    "Retrieve credit information for a specific user using Supabase ID (admin only)")
    @RolesAllowed("ADMIN")
    @ApiResponse(
            responseCode = "200",
            description = "User credit information retrieved successfully",
            content = @Content(schema = @Schema(implementation = CreditSummary.class)))
    public Response getUserCreditsAdminBySupabaseId(@PathParam("supabaseId") String supabaseId) {
        CreditSummary summary = creditService.getCreditSummaryBySupabaseId(supabaseId);
        return Response.ok(summary).build();
    }

    @POST
    @Path("/reset-cycle")
    @Hidden
    @Operation(
            summary = "Reset cycle credits for all users",
            description = "Manually trigger cycle credit reset for all users (admin only)")
    @RolesAllowed("ADMIN")
    @ApiResponse(responseCode = "200", description = "Cycle credits reset successfully")
    public Response resetCycleCredits() {
        creditService.resetCycleCreditsForAllUsers();
        log.info("Manual cycle credit reset triggered by admin");
        return Response.ok("Cycle credits reset successfully for all users").build();
    }

    @POST
    @Path("/set-bought-credits")
    @Hidden
    @Operation(
            summary = "Set user's bought credits to a specific amount",
            description =
                    "Hard set the bought credits balance for a specific user to an exact amount (admin only)")
    @RolesAllowed("ADMIN")
    @ApiResponse(responseCode = "200", description = "Bought credits set successfully")
    public Response setBoughtCredits(
            @QueryParam("username") String username, @QueryParam("credits") int credits) {

        if (credits < 0) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Credits cannot be negative"))
                    .build();
        }

        try {
            creditService.setBoughtCredits(username, credits);
            log.info("Admin set bought credits to {} for user: {}", credits, username);
            return Response.ok(Map.of("success", true, "boughtCredits", credits)).build();
        } catch (IllegalArgumentException e) {
            log.warn("setBoughtCredits rejected: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Invalid request"))
                    .build();
        }
    }

    @POST
    @Path("/set-bought-credits-by-supabase-id")
    @Hidden
    @Operation(
            summary = "Set user's bought credits to a specific amount by Supabase ID",
            description =
                    "Hard set the bought credits balance for a specific user using Supabase ID to an exact amount (admin only)")
    @RolesAllowed("ADMIN")
    @ApiResponse(responseCode = "200", description = "Bought credits set successfully")
    public Response setBoughtCreditsBySupabaseId(
            @QueryParam("supabaseId") String supabaseId, @QueryParam("credits") int credits) {

        if (credits < 0) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Credits cannot be negative"))
                    .build();
        }

        try {
            creditService.setBoughtCreditsBySupabaseId(supabaseId, credits);
            log.info(
                    "Admin set bought credits to {} for user with Supabase ID: {}",
                    credits,
                    LogRedactionUtils.redactSupabaseId(supabaseId));
            return Response.ok(Map.of("success", true, "boughtCredits", credits)).build();
        } catch (IllegalArgumentException e) {
            log.warn("setBoughtCreditsBySupabaseId rejected: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Invalid request"))
                    .build();
        }
    }

    @POST
    @Path("/set-cycle-credits")
    @Hidden
    @Operation(
            summary = "Set user's cycle credits remaining to a specific amount",
            description =
                    "Hard set the cycle credits remaining balance for a specific user to an exact amount (admin only)")
    @RolesAllowed("ADMIN")
    @ApiResponse(responseCode = "200", description = "Cycle credits set successfully")
    public Response setCycleCredits(
            @QueryParam("username") String username, @QueryParam("credits") int credits) {

        if (credits < 0) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Credits cannot be negative"))
                    .build();
        }

        try {
            creditService.setCycleCredits(username, credits);
            log.info("Admin set cycle credits to {} for user: {}", credits, username);
            return Response.ok(Map.of("success", true, "cycleCredits", credits)).build();
        } catch (IllegalArgumentException e) {
            log.warn("setCycleCredits rejected: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Invalid request"))
                    .build();
        }
    }

    @POST
    @Path("/set-cycle-credits-by-supabase-id")
    @Hidden
    @Operation(
            summary = "Set user's cycle credits remaining to a specific amount by Supabase ID",
            description =
                    "Hard set the cycle credits remaining balance for a specific user using Supabase ID to an exact amount (admin only)")
    @RolesAllowed("ADMIN")
    @ApiResponse(responseCode = "200", description = "Cycle credits set successfully")
    public Response setCycleCreditsBySupabaseId(
            @QueryParam("supabaseId") String supabaseId, @QueryParam("credits") int credits) {

        if (credits < 0) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Credits cannot be negative"))
                    .build();
        }

        try {
            creditService.setCycleCreditsBySupabaseId(supabaseId, credits);
            log.info(
                    "Admin set cycle credits to {} for user with Supabase ID: {}",
                    credits,
                    LogRedactionUtils.redactSupabaseId(supabaseId));
            return Response.ok(Map.of("success", true, "cycleCredits", credits)).build();
        } catch (IllegalArgumentException e) {
            log.warn("setCycleCreditsBySupabaseId rejected: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Invalid request"))
                    .build();
        }
    }

    @GET
    @Path("/usage")
    @Hidden
    @Operation(
            summary = "Get credit usage summary",
            description = "Get overview of credit usage (for authenticated user or admin view)")
    public Response getCreditUsage(Authentication authentication) {
        CreditSummary summary = getCreditSummaryForAuthentication(authentication);

        // For unlimited users, don't show meaningless huge usage numbers
        int cycleCreditsUsed =
                summary.unlimited
                        ? 0
                        : (summary.cycleCreditsAllocated - summary.cycleCreditsRemaining);

        UsageSummary usage =
                new UsageSummary(
                        cycleCreditsUsed,
                        summary.totalBoughtCredits - summary.boughtCreditsRemaining,
                        summary.totalAvailableCredits,
                        summary.unlimited);

        return Response.ok(usage).build();
    }

    /** Resolves the current authentication to a credit summary, handling JWT and API-key auth. */
    private CreditSummary getCreditSummaryForAuthentication(Authentication authentication) {
        if (authentication instanceof EnhancedJwtAuthenticationToken enhancedJwt) {
            return creditService.getCreditSummaryBySupabaseId(enhancedJwt.getSupabaseId());
        }
        if (authentication instanceof ApiKeyAuthenticationToken apiKeyToken) {
            String apiKey = (String) apiKeyToken.getCredentials();
            // Principal is the resolved User entity (per SupabaseAuthenticationFilter). Prefer the
            // linked Supabase ID; fall back to API-key-keyed credits if there's no supabase link
            // or no User row (e.g. legacy API-key-only deployments).
            if (apiKeyToken.getPrincipal() instanceof User user && user.getSupabaseId() != null) {
                return creditService.getCreditSummaryBySupabaseId(user.getSupabaseId().toString());
            }
            return creditService.getCreditSummaryByApiKey(apiKey);
        }
        return creditService.getCreditSummaryBySupabaseId(authentication.getName());
    }

    public static class UsageSummary {
        public final int cycleCreditsUsed;
        public final int boughtCreditsUsed;
        public final int creditsRemaining;
        public final boolean unlimited;

        public UsageSummary(
                int cycleCreditsUsed,
                int boughtCreditsUsed,
                int creditsRemaining,
                boolean unlimited) {
            this.cycleCreditsUsed = cycleCreditsUsed;
            this.boughtCreditsUsed = boughtCreditsUsed;
            this.creditsRemaining = creditsRemaining;
            this.unlimited = unlimited;
        }
    }
}
