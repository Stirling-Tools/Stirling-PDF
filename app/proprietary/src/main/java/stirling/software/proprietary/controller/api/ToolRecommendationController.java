package stirling.software.proprietary.controller.api;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.model.ToolRecommendationDismissal;
import stirling.software.proprietary.service.ToolRecommendationService;
import stirling.software.proprietary.service.ToolRecommendationService.ToolRecommendation;
import stirling.software.proprietary.service.ToolUsageTrackingService;

/**
 * Records tool completions and serves the dynamic "recommended tools" list. Available on every
 * license tier; identity falls back to the browser id header in no-login mode.
 */
@Slf4j
@ProprietaryUiDataApi
@RequiredArgsConstructor
public class ToolRecommendationController {

    private static final Pattern BROWSER_ID_PATTERN = Pattern.compile("^[A-Za-z0-9-]{8,64}$");

    private final ToolUsageTrackingService trackingService;
    private final ToolRecommendationService recommendationService;
    private final Optional<UserServiceInterface> userService;

    public record RecommendationsResponse(List<ToolRecommendation> recommendations) {}

    public record UsageRequest(String toolKey, String previousToolKey) {}

    public record DismissalRequest(String contextTool, String dismissedTool) {}

    @GetMapping("/tool-recommendations")
    @Operation(
            summary = "Get recommended tools",
            description =
                    "Returns tools ranked by usage patterns: what this user, their team, and the"
                            + " whole install use, weighted towards what typically follows the"
                            + " current tool.")
    public ResponseEntity<RecommendationsResponse> getRecommendations(
            @RequestParam(value = "currentTool", required = false) String currentTool,
            @RequestParam(value = "limit", defaultValue = "6") int limit,
            @RequestHeader(value = "X-Browser-Id", required = false) String browserId) {
        String context = ToolUsageTrackingService.isValidToolKey(currentTool) ? currentTool : null;
        try {
            return ResponseEntity.ok(
                    new RecommendationsResponse(
                            recommendationService.getRecommendations(
                                    resolvePrincipal(browserId), context, limit)));
        } catch (Exception e) {
            // Recommendations are advisory; never break the UI over them.
            log.warn("Failed to compute tool recommendations: {}", e.getMessage());
            return ResponseEntity.ok(new RecommendationsResponse(List.of()));
        }
    }

    @PostMapping("/tool-recommendations/usage")
    @Operation(
            summary = "Record a completed tool run",
            description = "Safe to call fire-and-forget after every tool completion.")
    public ResponseEntity<Void> recordUsage(
            @RequestBody UsageRequest request,
            @RequestHeader(value = "X-Browser-Id", required = false) String browserId) {
        if (request == null || !ToolUsageTrackingService.isValidToolKey(request.toolKey())) {
            return ResponseEntity.badRequest().build();
        }
        trackingService.recordUsage(
                resolvePrincipal(browserId), request.toolKey(), request.previousToolKey());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/tool-recommendations/dismissals")
    @Operation(
            summary = "Dismiss a recommended tool",
            description =
                    "Never recommend dismissedTool again while on contextTool. Use context '*' to"
                            + " suppress it everywhere.")
    public ResponseEntity<Void> dismiss(
            @RequestBody DismissalRequest request,
            @RequestHeader(value = "X-Browser-Id", required = false) String browserId) {
        if (request == null || !isValidDismissal(request.contextTool(), request.dismissedTool())) {
            return ResponseEntity.badRequest().build();
        }
        recommendationService.dismiss(
                resolvePrincipal(browserId), request.contextTool(), request.dismissedTool());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/tool-recommendations/dismissals")
    @Operation(summary = "Undo a recommendation dismissal")
    public ResponseEntity<Void> undoDismiss(
            @RequestParam("contextTool") String contextTool,
            @RequestParam("dismissedTool") String dismissedTool,
            @RequestHeader(value = "X-Browser-Id", required = false) String browserId) {
        if (!isValidDismissal(contextTool, dismissedTool)) {
            return ResponseEntity.badRequest().build();
        }
        recommendationService.undoDismiss(resolvePrincipal(browserId), contextTool, dismissedTool);
        return ResponseEntity.noContent().build();
    }

    private static boolean isValidDismissal(String contextTool, String dismissedTool) {
        return ToolUsageTrackingService.isValidToolKey(dismissedTool)
                && (ToolRecommendationDismissal.ANY_CONTEXT.equals(contextTool)
                        || ToolUsageTrackingService.isValidToolKey(contextTool));
    }

    /** Logged-in username, else a per-browser pseudo-identity, else a shared anonymous bucket. */
    private String resolvePrincipal(String browserId) {
        String username =
                userService
                        .map(UserServiceInterface::getCurrentUsername)
                        .filter(name -> !name.isBlank() && !"anonymousUser".equals(name))
                        .orElse(null);
        if (username != null) {
            return username;
        }
        return browserId != null && BROWSER_ID_PATTERN.matcher(browserId).matches()
                ? "anon:" + browserId
                : "anonymous";
    }
}
