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

import stirling.software.proprietary.model.ApiRateLimitConfig;
import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.OrganizationRepository;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.ApiRateLimitService;

@RestController
@RequestMapping("/api/v1/rate-limits")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "API Rate Limits", description = "Endpoints for managing and viewing API rate limits")
public class ApiRateLimitController {

    private final ApiRateLimitService rateLimitService;
    private final UserService userService;
    private final OrganizationRepository organizationRepository;

    public record UsageMetricsResponse(
        int currentUsage,
        int monthlyLimit,
        int remaining,
        String scope,
        String month,
        boolean isPooled,
        long resetEpochMillis
    ) {}

    public record UpdateLimitRequest(
        int monthlyLimit,
        boolean isPooled
    ) {}

    @GetMapping("/usage")
    @Operation(summary = "Get current usage metrics", 
               description = "Returns the current API usage metrics for the authenticated user")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Usage metrics retrieved successfully"),
        @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    public ResponseEntity<UsageMetricsResponse> getCurrentUsage(Authentication auth) {
        User user = getUserFromAuth(auth);
        if (user == null) {
            return ResponseEntity.status(401).build();
        }

        ApiRateLimitService.UsageMetrics metrics = rateLimitService.getUsageMetrics(user);
        
        return ResponseEntity.ok(new UsageMetricsResponse(
            metrics.currentUsage(),
            metrics.monthlyLimit(),
            metrics.remaining(),
            metrics.scope(),
            metrics.month().toString(),
            metrics.isPooled(),
            getNextMonthResetEpochMillis()
        ));
    }

    @GetMapping("/usage/{username}")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ORG_ADMIN', 'TEAM_LEAD')")
    @Operation(summary = "Get usage metrics for a specific user", 
               description = "Returns API usage metrics for the specified user (requires admin privileges)")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Usage metrics retrieved successfully"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    public ResponseEntity<UsageMetricsResponse> getUserUsage(
            @PathVariable @Parameter(description = "Username to get metrics for") String username,
            Authentication auth) {
        
        User requestingUser = getUserFromAuth(auth);
        User targetUser = userService.findByUsername(username).orElse(null);
        
        if (targetUser == null) {
            return ResponseEntity.notFound().build();
        }
        
        if (!requestingUser.canManageUser(targetUser)) {
            return ResponseEntity.status(403).build();
        }

        ApiRateLimitService.UsageMetrics metrics = rateLimitService.getUsageMetrics(targetUser);
        
        return ResponseEntity.ok(new UsageMetricsResponse(
            metrics.currentUsage(),
            metrics.monthlyLimit(),
            metrics.remaining(),
            metrics.scope(),
            metrics.month().toString(),
            metrics.isPooled(),
            getNextMonthResetEpochMillis()
        ));
    }

    @PutMapping("/user/{username}")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ORG_ADMIN')")
    @Operation(summary = "Update rate limit for a user", 
               description = "Sets a custom rate limit for a specific user")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Rate limit updated successfully"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    public ResponseEntity<ApiRateLimitConfig> updateUserLimit(
            @PathVariable @Parameter(description = "Username to update") String username,
            @RequestBody UpdateLimitRequest request,
            Authentication auth) {
        
        User requestingUser = getUserFromAuth(auth);
        User targetUser = userService.findByUsername(username).orElse(null);
        
        if (targetUser == null) {
            return ResponseEntity.notFound().build();
        }
        
        if (!requestingUser.canManageUser(targetUser)) {
            return ResponseEntity.status(403).build();
        }

        ApiRateLimitConfig config = rateLimitService.createOrUpdateUserLimit(
            targetUser, request.monthlyLimit());
        
        return ResponseEntity.ok(config);
    }

    @PutMapping("/organization/{orgId}")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ORG_ADMIN')")
    @Operation(summary = "Update rate limit for an organization", 
               description = "Sets a rate limit for an entire organization")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Rate limit updated successfully"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Organization not found")
    })
    public ResponseEntity<ApiRateLimitConfig> updateOrgLimit(
            @PathVariable @Parameter(description = "Organization ID") Long orgId,
            @RequestBody UpdateLimitRequest request,
            Authentication auth) {
        
        User requestingUser = getUserFromAuth(auth);
        Organization org = organizationRepository.findById(orgId).orElse(null);
        
        if (org == null) {
            return ResponseEntity.notFound().build();
        }
        
        if (!requestingUser.isSystemAdmin()) {
            Organization userOrg = requestingUser.getOrganization();
            if (userOrg == null || !userOrg.getId().equals(orgId) || !requestingUser.isOrgAdmin()) {
                return ResponseEntity.status(403).build();
            }
        }

        ApiRateLimitConfig config = rateLimitService.createOrUpdateOrgLimit(
            org, request.monthlyLimit(), request.isPooled());
        
        return ResponseEntity.ok(config);
    }

    @PutMapping("/role/{roleName}")
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    @Operation(summary = "Update default rate limit for a role", 
               description = "Sets the default rate limit for all users with a specific role")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Rate limit updated successfully"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<ApiRateLimitConfig> updateRoleDefault(
            @PathVariable @Parameter(description = "Role name") String roleName,
            @RequestBody UpdateLimitRequest request) {
        
        ApiRateLimitConfig config = rateLimitService.createOrUpdateRoleDefault(
            roleName, request.monthlyLimit());
        
        return ResponseEntity.ok(config);
    }

    private User getUserFromAuth(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            return null;
        }
        return userService.findByUsername(auth.getName()).orElse(null);
    }
    
    private long getNextMonthResetEpochMillis() {
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);
        YearMonth nextMonth = currentMonth.plusMonths(1);
        ZonedDateTime resetTime = nextMonth.atDay(1).atStartOfDay(ZoneOffset.UTC);
        return resetTime.toInstant().toEpochMilli();
    }
}