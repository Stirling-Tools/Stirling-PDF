package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.util.Map;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.UserCredits;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.CreditService;

/**
 * Deducts credits after successful POST requests to tool API endpoints. Sets the {@code
 * X-Credits-Remaining} response header so the frontend can update the UI in real time.
 *
 * <p>Credit costs are determined by the endpoint path, mirroring the frontend's {@code
 * TOOL_CREDIT_COSTS} mapping. Only {@code /api/v1/} POST endpoints that correspond to PDF tools are
 * metered.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CreditDeductionFilter extends OncePerRequestFilter {

    private final CreditService creditService;
    private final UserService userService;

    /** Endpoint prefix → credit cost. Mirrors frontend TOOL_CREDIT_COSTS. */
    private static final int COST_SMALL = 1;

    private static final int COST_MEDIUM = 3;
    private static final int COST_LARGE = 5;
    private static final int COST_XLARGE = 10;

    private static final Map<String, Integer> ENDPOINT_COSTS =
            Map.ofEntries(
                    // Large operations
                    Map.entry("/api/v1/misc/compress-pdf", COST_LARGE),
                    Map.entry("/api/v1/convert", COST_LARGE),
                    Map.entry("/api/v1/misc/ocr-pdf", COST_LARGE),
                    // XLarge operations
                    Map.entry("/api/v1/general/pipeline", COST_XLARGE),
                    // Medium operations
                    Map.entry("/api/v1/general/split-pages", COST_MEDIUM),
                    Map.entry("/api/v1/general/merge-pdfs", COST_MEDIUM),
                    Map.entry("/api/v1/security/sanitize-pdf", COST_MEDIUM),
                    Map.entry("/api/v1/misc/add-image", COST_MEDIUM),
                    Map.entry("/api/v1/misc/add-stamp", COST_MEDIUM),
                    Map.entry("/api/v1/security/add-watermark", COST_MEDIUM),
                    Map.entry("/api/v1/general/overlay-pdfs", COST_MEDIUM),
                    Map.entry("/api/v1/misc/extract-images", COST_MEDIUM),
                    Map.entry("/api/v1/misc/auto-rename", COST_MEDIUM),
                    Map.entry("/api/v1/misc/remove-blanks", COST_MEDIUM));

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        // Only meter POST requests to /api/v1/ tool endpoints
        if (!"POST".equalsIgnoreCase(request.getMethod())
                || !request.getRequestURI().startsWith(request.getContextPath() + "/api/v1/")) {
            filterChain.doFilter(request, response);
            return;
        }

        // Let the request proceed first
        filterChain.doFilter(request, response);

        // Only deduct if the request was successful (2xx)
        int status = response.getStatus();
        if (status < 200 || status >= 300) {
            return;
        }

        User user = resolveCurrentUser();
        if (user == null) {
            return;
        }

        String path = request.getRequestURI().replace(request.getContextPath(), "");
        int cost = resolveCost(path);
        if (cost <= 0) {
            return;
        }

        String planTier = user.getPlanTier() != null ? user.getPlanTier() : "free";
        boolean deducted = creditService.deductCredits(user.getId(), cost, planTier);

        if (deducted) {
            UserCredits credits = creditService.getCredits(user.getId());
            if (credits != null) {
                response.setHeader(
                        "X-Credits-Remaining", String.valueOf(credits.getTotalAvailableCredits()));
            }
        } else {
            log.warn(
                    "Insufficient credits for user {} on endpoint {} (cost={})",
                    user.getUsername(),
                    path,
                    cost);
            // The request already succeeded at this point. For pre-request blocking,
            // a separate check should be added to the tool operation flow.
        }
    }

    /**
     * Resolve the credit cost for a request path. Checks exact match first, then falls back to
     * prefix matching. Default cost for unrecognized /api/v1/ POST endpoints is SMALL (1 credit).
     */
    private int resolveCost(String path) {
        Integer exact = ENDPOINT_COSTS.get(path);
        if (exact != null) {
            return exact;
        }

        // Prefix match for endpoints like /api/v1/convert/pdf/...
        for (Map.Entry<String, Integer> entry : ENDPOINT_COSTS.entrySet()) {
            if (path.startsWith(entry.getKey())) {
                return entry.getValue();
            }
        }

        // Default cost for any other /api/v1/ POST (tool) endpoint
        return COST_SMALL;
    }

    private User resolveCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return null;
        }
        Object principal = auth.getPrincipal();
        String username;
        if (principal instanceof UserDetails userDetails) {
            username = userDetails.getUsername();
        } else {
            return null;
        }
        return userService.findByUsernameIgnoreCase(username).orElse(null);
    }
}
