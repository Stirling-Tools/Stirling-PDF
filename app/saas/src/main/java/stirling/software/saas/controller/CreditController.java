package stirling.software.saas.controller;

import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.CreditService.CreditSummary;
import stirling.software.saas.util.LogRedactionUtils;

@RestController
@Profile("saas")
@RequestMapping("/api/v1/credits")
@Tag(name = "Credit Management", description = "Endpoints for managing user API credits")
@RequiredArgsConstructor
@Slf4j
public class CreditController {

    private final CreditService creditService;
    private final UserRepository userRepository;

    @GetMapping
    @Operation(
            summary = "Get user credit information",
            description =
                    "Retrieve current credit balance and usage statistics for the authenticated user")
    @ApiResponse(
            responseCode = "200",
            description = "Credit information retrieved successfully",
            content = @Content(schema = @Schema(implementation = CreditSummary.class)))
    public ResponseEntity<CreditSummary> getUserCredits(Authentication authentication) {
        return ResponseEntity.ok(getCreditSummaryForAuthentication(authentication));
    }

    @PostMapping("/purchase")
    @Hidden
    @Operation(
            summary = "Purchase additional credits",
            description = "Add bought credits to user account (admin only)")
    @PreAuthorize("hasRole('ADMIN')")
    @ApiResponse(responseCode = "200", description = "Credits purchased successfully")
    public ResponseEntity<String> purchaseCredits(
            @RequestParam("username") String username, @RequestParam("credits") int credits) {

        if (credits <= 0) {
            return ResponseEntity.badRequest().body("Credits must be positive");
        }

        try {
            creditService.addBoughtCredits(username, credits);
            log.info("Admin added {} credits to user: {}", credits, username);
            return ResponseEntity.ok(
                    "Successfully added " + credits + " credits to user " + username);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/purchase-by-supabase-id")
    @Hidden
    @Operation(
            summary = "Purchase additional credits by Supabase ID",
            description = "Add bought credits to user account using Supabase ID (admin only)")
    @PreAuthorize("hasRole('ADMIN')")
    @ApiResponse(responseCode = "200", description = "Credits purchased successfully")
    public ResponseEntity<String> purchaseCreditsBySupabaseId(
            @RequestParam("supabaseId") String supabaseId, @RequestParam("credits") int credits) {

        if (credits <= 0) {
            return ResponseEntity.badRequest().body("Credits must be positive");
        }

        try {
            creditService.addBoughtCreditsBySupabaseId(supabaseId, credits);
            log.info(
                    "Admin added {} credits to user with Supabase ID: {}",
                    credits,
                    LogRedactionUtils.redactSupabaseId(supabaseId));
            return ResponseEntity.ok(
                    "Successfully added "
                            + credits
                            + " credits to user with Supabase ID "
                            + supabaseId);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/user/{username}")
    @Hidden
    @Operation(
            summary = "Get credit information for specific user",
            description = "Retrieve credit information for a specific user (admin only)")
    @PreAuthorize("hasRole('ADMIN')")
    @ApiResponse(
            responseCode = "200",
            description = "User credit information retrieved successfully",
            content = @Content(schema = @Schema(implementation = CreditSummary.class)))
    public ResponseEntity<CreditSummary> getUserCreditsAdmin(
            @PathVariable("username") String username) {
        CreditSummary summary = creditService.getCreditSummary(username);
        return ResponseEntity.ok(summary);
    }

    @GetMapping("/user-by-supabase-id/{supabaseId}")
    @Hidden
    @Operation(
            summary = "Get credit information for specific user by Supabase ID",
            description =
                    "Retrieve credit information for a specific user using Supabase ID (admin only)")
    @PreAuthorize("hasRole('ADMIN')")
    @ApiResponse(
            responseCode = "200",
            description = "User credit information retrieved successfully",
            content = @Content(schema = @Schema(implementation = CreditSummary.class)))
    public ResponseEntity<CreditSummary> getUserCreditsAdminBySupabaseId(
            @PathVariable("supabaseId") String supabaseId) {
        CreditSummary summary = creditService.getCreditSummaryBySupabaseId(supabaseId);
        return ResponseEntity.ok(summary);
    }

    @PostMapping("/reset-cycle")
    @Hidden
    @Operation(
            summary = "Reset cycle credits for all users",
            description = "Manually trigger cycle credit reset for all users (admin only)")
    @PreAuthorize("hasRole('ADMIN')")
    @ApiResponse(responseCode = "200", description = "Cycle credits reset successfully")
    public ResponseEntity<String> resetCycleCredits() {
        creditService.resetCycleCreditsForAllUsers();
        log.info("Manual cycle credit reset triggered by admin");
        return ResponseEntity.ok("Cycle credits reset successfully for all users");
    }

    @PostMapping("/set-bought-credits")
    @Hidden
    @Operation(
            summary = "Set user's bought credits to a specific amount",
            description =
                    "Hard set the bought credits balance for a specific user to an exact amount (admin only)")
    @PreAuthorize("hasRole('ADMIN')")
    @ApiResponse(responseCode = "200", description = "Bought credits set successfully")
    public ResponseEntity<String> setBoughtCredits(
            @RequestParam("username") String username, @RequestParam("credits") int credits) {

        if (credits < 0) {
            return ResponseEntity.badRequest().body("Credits cannot be negative");
        }

        try {
            creditService.setBoughtCredits(username, credits);
            log.info("Admin set bought credits to {} for user: {}", credits, username);
            return ResponseEntity.ok(
                    "Successfully set bought credits to " + credits + " for user " + username);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/set-bought-credits-by-supabase-id")
    @Hidden
    @Operation(
            summary = "Set user's bought credits to a specific amount by Supabase ID",
            description =
                    "Hard set the bought credits balance for a specific user using Supabase ID to an exact amount (admin only)")
    @PreAuthorize("hasRole('ADMIN')")
    @ApiResponse(responseCode = "200", description = "Bought credits set successfully")
    public ResponseEntity<String> setBoughtCreditsBySupabaseId(
            @RequestParam("supabaseId") String supabaseId, @RequestParam("credits") int credits) {

        if (credits < 0) {
            return ResponseEntity.badRequest().body("Credits cannot be negative");
        }

        try {
            creditService.setBoughtCreditsBySupabaseId(supabaseId, credits);
            log.info(
                    "Admin set bought credits to {} for user with Supabase ID: {}",
                    credits,
                    supabaseId);
            return ResponseEntity.ok(
                    "Successfully set bought credits to "
                            + credits
                            + " for user with Supabase ID "
                            + supabaseId);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/set-cycle-credits")
    @Hidden
    @Operation(
            summary = "Set user's cycle credits remaining to a specific amount",
            description =
                    "Hard set the cycle credits remaining balance for a specific user to an exact amount (admin only)")
    @PreAuthorize("hasRole('ADMIN')")
    @ApiResponse(responseCode = "200", description = "Cycle credits set successfully")
    public ResponseEntity<String> setCycleCredits(
            @RequestParam("username") String username, @RequestParam("credits") int credits) {

        if (credits < 0) {
            return ResponseEntity.badRequest().body("Credits cannot be negative");
        }

        try {
            creditService.setCycleCredits(username, credits);
            log.info("Admin set cycle credits to {} for user: {}", credits, username);
            return ResponseEntity.ok(
                    "Successfully set cycle credits to " + credits + " for user " + username);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/set-cycle-credits-by-supabase-id")
    @Hidden
    @Operation(
            summary = "Set user's cycle credits remaining to a specific amount by Supabase ID",
            description =
                    "Hard set the cycle credits remaining balance for a specific user using Supabase ID to an exact amount (admin only)")
    @PreAuthorize("hasRole('ADMIN')")
    @ApiResponse(responseCode = "200", description = "Cycle credits set successfully")
    public ResponseEntity<String> setCycleCreditsBySupabaseId(
            @RequestParam("supabaseId") String supabaseId, @RequestParam("credits") int credits) {

        if (credits < 0) {
            return ResponseEntity.badRequest().body("Credits cannot be negative");
        }

        try {
            creditService.setCycleCreditsBySupabaseId(supabaseId, credits);
            log.info(
                    "Admin set cycle credits to {} for user with Supabase ID: {}",
                    credits,
                    supabaseId);
            return ResponseEntity.ok(
                    "Successfully set cycle credits to "
                            + credits
                            + " for user with Supabase ID "
                            + supabaseId);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/usage")
    @Operation(
            summary = "Get credit usage summary",
            description = "Get overview of credit usage (for authenticated user or admin view)")
    public ResponseEntity<UsageSummary> getCreditUsage(Authentication authentication) {
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

        return ResponseEntity.ok(usage);
    }

    /** Resolves the current authentication to a credit summary, handling JWT and API-key auth. */
    private CreditSummary getCreditSummaryForAuthentication(Authentication authentication) {
        if (authentication instanceof EnhancedJwtAuthenticationToken enhancedJwt) {
            return creditService.getCreditSummaryBySupabaseId(enhancedJwt.getSupabaseId());
        }
        if (authentication instanceof ApiKeyAuthenticationToken) {
            String apiKey = authentication.getName();
            // Resolve API key -> User -> supabaseId (if linked), else fall back to API-key lookup.
            return userRepository
                    .findByApiKey(apiKey)
                    .map(User::getSupabaseId)
                    .map(java.util.UUID::toString)
                    .map(creditService::getCreditSummaryBySupabaseId)
                    .orElseGet(() -> creditService.getCreditSummaryByApiKey(apiKey));
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
