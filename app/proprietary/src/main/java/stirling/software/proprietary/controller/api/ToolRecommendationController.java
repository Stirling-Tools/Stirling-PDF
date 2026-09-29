package stirling.software.proprietary.controller.api;

import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.service.ToolRecommendationService;
import stirling.software.proprietary.service.ToolRecommendationService.ToolRecommendation;
import stirling.software.proprietary.service.ToolUsageTrackingService;

/**
 * Records tool completions and serves the dynamic "recommended tools" list. Available on every
 * license tier, and only ever for a user the server itself authenticated.
 *
 * <p>With login disabled there is no such user, so both endpoints answer 501 and the browser falls
 * back to the curated list. Keying rows on a browser-declared identity instead would hand an
 * unauthenticated caller an unbounded set of principals to write rows under, and the ranking it
 * bought would be per-browser anyway - which is what the curated list already gives for free.
 */
@Slf4j
@ProprietaryUiDataApi
@RequiredArgsConstructor
public class ToolRecommendationController {

    private final ToolUsageTrackingService trackingService;
    private final ToolRecommendationService recommendationService;
    private final Optional<UserServiceInterface> userService;

    public record RecommendationsResponse(List<ToolRecommendation> recommendations) {}

    /**
     * @param priorChains the tools already applied to each input document, oldest step first and
     *     excluding this run - one entry per input document, empty for a fresh upload.
     */
    public record UsageRequest(String toolKey, List<List<String>> priorChains) {}

    @GetMapping("/tool-recommendations")
    @Operation(
            summary = "Get recommended tools",
            description =
                    "Returns tools ranked by usage patterns: what this user, their team, and the"
                            + " whole install use, weighted towards what typically follows the"
                            + " current tool. Answers 501 when the install records no usage, or"
                            + " when login is disabled and there is no user to rank for.")
    public ResponseEntity<RecommendationsResponse> getRecommendations(
            @RequestParam(value = "currentTool", required = false) String currentTool,
            @RequestParam(value = "limit", defaultValue = "6") int limit) {
        String principal = currentPrincipal();
        if (principal == null || !trackingService.isRecordingEnabled()) {
            return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
        }
        String context = trackingService.isKnownToolKey(currentTool) ? currentTool : null;
        try {
            return ResponseEntity.ok(
                    new RecommendationsResponse(
                            recommendationService.getRecommendations(principal, context, limit)));
        } catch (Exception e) {
            // Recommendations are advisory; never break the UI over them.
            log.warn("Failed to compute tool recommendations: {}", e.getMessage());
            return ResponseEntity.ok(new RecommendationsResponse(List.of()));
        }
    }

    @PostMapping("/tool-recommendations/usage")
    @Operation(
            summary = "Record a completed tool run",
            description =
                    "Safe to call fire-and-forget after every tool completion. priorChains carries"
                            + " what each input document had already been through, so transitions"
                            + " and workflows follow the file rather than the click order.")
    public ResponseEntity<Void> recordUsage(@RequestBody UsageRequest request) {
        if (request == null || !trackingService.isKnownToolKey(request.toolKey())) {
            return ResponseEntity.badRequest().build();
        }
        String principal = currentPrincipal();
        if (principal == null || !trackingService.isRecordingEnabled()) {
            // 501 latches the client, so an install that records nothing stops receiving posts.
            return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
        }
        trackingService.recordUsage(principal, request.toolKey(), request.priorChains());
        return ResponseEntity.noContent().build();
    }

    /** The authenticated username, or null when nobody is signed in. */
    private String currentPrincipal() {
        return userService
                .map(UserServiceInterface::getCurrentUsername)
                .filter(name -> !name.isBlank() && !"anonymousUser".equals(name))
                .orElse(null);
    }
}
