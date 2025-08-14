package stirling.software.proprietary.controller.api;

import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.ApiCreditService;

@RestController
@RequestMapping("/api/v1/credits")
@RequiredArgsConstructor
@Slf4j
@Tag(
        name = "API Credits",
        description = "Endpoints for managing and viewing API credit limits and usage")
public class ApiCreditController {

    private final ApiCreditService creditService;
    private final UserService userService;

    public record CreditMetricsResponse(
            int creditsConsumed,
            int monthlyCredits,
            int remaining,
            String scope,
            String month,
            boolean isPooled,
            long resetEpochMillis) {}

    public record UpdateCreditLimitRequest(int monthlyCredits, Boolean isActive) {}

    public record CreateUserCreditConfigRequest(
            String username, int monthlyCredits, boolean isActive) {}

    public record CreateOrgCreditConfigRequest(
            String organizationName, int monthlyCredits, boolean isPooled, boolean isActive) {}

    @Operation(
            summary = "Get current user's credit metrics",
            description =
                    "Returns the current user's credit consumption, limits, and remaining credits for the current month")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Credit metrics retrieved successfully"),
        @ApiResponse(responseCode = "401", description = "User not authenticated")
    })
    @GetMapping("/my-usage")
    public ResponseEntity<CreditMetricsResponse> getMyCredits(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(401).build();
        }

        User user =
                userService
                        .findByUsername(authentication.getName())
                        .orElseThrow(() -> new RuntimeException("User not found"));

        ApiCreditService.CreditMetrics metrics = creditService.getUserCreditMetrics(user);

        YearMonth nextMonth = metrics.month().plusMonths(1);
        ZonedDateTime resetTime = nextMonth.atDay(1).atStartOfDay(ZoneOffset.UTC);
        long resetEpochMillis = resetTime.toInstant().toEpochMilli();

        CreditMetricsResponse response =
                new CreditMetricsResponse(
                        metrics.creditsConsumed(),
                        metrics.monthlyCredits(),
                        metrics.remaining(),
                        metrics.scope(),
                        metrics.month().toString(),
                        metrics.isPooled(),
                        resetEpochMillis);

        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "Get user credit metrics",
            description = "Returns credit metrics for a specific user (admin only)")
    @PreAuthorize("@roleBasedAuthorizationService.canManageAllUsers()")
    @GetMapping("/user/{username}")
    public ResponseEntity<CreditMetricsResponse> getUserCredits(
            @Parameter(description = "Username to get credit metrics for") @PathVariable
                    String username) {
        User user = userService.findByUsername(username).orElse(null);

        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        ApiCreditService.CreditMetrics metrics = creditService.getUserCreditMetrics(user);

        YearMonth nextMonth = metrics.month().plusMonths(1);
        ZonedDateTime resetTime = nextMonth.atDay(1).atStartOfDay(ZoneOffset.UTC);
        long resetEpochMillis = resetTime.toInstant().toEpochMilli();

        CreditMetricsResponse response =
                new CreditMetricsResponse(
                        metrics.creditsConsumed(),
                        metrics.monthlyCredits(),
                        metrics.remaining(),
                        metrics.scope(),
                        metrics.month().toString(),
                        metrics.isPooled(),
                        resetEpochMillis);

        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "Create user-specific credit limit",
            description = "Create a credit limit configuration for a specific user (admin only)")
    @PreAuthorize("@roleBasedAuthorizationService.canManageAllUsers()")
    @PostMapping("/config/user")
    public ResponseEntity<?> createUserCreditConfig(
            @RequestBody CreateUserCreditConfigRequest request) {
        try {
            User user = userService.findByUsername(request.username()).orElse(null);

            if (user == null) {
                return ResponseEntity.badRequest().body("User not found: " + request.username());
            }

            creditService.createUserCreditConfig(user, request.monthlyCredits(), request.isActive());
            return ResponseEntity.ok().body("User credit configuration created successfully");
        } catch (Exception e) {
            log.error("Error creating user credit config", e);
            return ResponseEntity.badRequest().body("Error: " + e.getMessage());
        }
    }

    @Operation(
            summary = "Update role default credit limits",
            description = "Update the default credit limit for a specific role (admin only)")
    @PreAuthorize("@roleBasedAuthorizationService.canManageAllUsers()")
    @PutMapping("/config/role/{roleName}")
    public ResponseEntity<?> updateRoleDefault(
            @Parameter(description = "Role name to update") @PathVariable String roleName,
            @RequestBody UpdateCreditLimitRequest request) {
        try {
            creditService.createOrUpdateRoleDefault(roleName, request.monthlyCredits());
            return ResponseEntity.ok().body("Role default updated successfully");
        } catch (Exception e) {
            log.error("Error updating role default", e);
            return ResponseEntity.badRequest().body("Error: " + e.getMessage());
        }
    }

    @Operation(
            summary = "Get credit system status",
            description = "Returns basic information about the credit system configuration")
    @GetMapping("/status")
    public ResponseEntity<?> getCreditSystemStatus() {
        return ResponseEntity.ok()
                .body(
                        "API Credit System is active. Use /api/v1/credits/my-usage to check your credit balance.");
    }
}
