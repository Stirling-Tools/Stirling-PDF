package stirling.software.proprietary.controller.api;

import java.time.format.DateTimeFormatter;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.model.UserCredits;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.CreditService;

/**
 * REST controller for the SaaS credit system. Serves the {@code GET /api/v1/credits} endpoint that
 * the frontend expects.
 */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class CreditController {

    private final CreditService creditService;
    private final UserService userService;

    private static final DateTimeFormatter ISO_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    /**
     * Returns the authenticated user's credit balance in the shape expected by the frontend's
     * {@code ApiCredits} type.
     */
    @GetMapping("/credits")
    public ResponseEntity<Map<String, Object>> getCredits() {
        User user = resolveCurrentUser();
        if (user == null) {
            return ResponseEntity.status(401).build();
        }

        String planTier = user.getPlanTier() != null ? user.getPlanTier() : "free";
        UserCredits credits = creditService.getOrCreateCredits(user.getId(), planTier);

        Map<String, Object> response =
                Map.of(
                        "weeklyCreditsRemaining",
                        credits.getWeeklyCreditsRemaining(),
                        "weeklyCreditsAllocated",
                        credits.getWeeklyCreditsAllocated(),
                        "boughtCreditsRemaining",
                        credits.getBoughtCreditsRemaining(),
                        "totalBoughtCredits",
                        credits.getTotalBoughtCredits(),
                        "totalAvailableCredits",
                        credits.getTotalAvailableCredits(),
                        "weeklyResetDate",
                        credits.getWeeklyResetDate() != null
                                ? credits.getWeeklyResetDate().format(ISO_FORMAT)
                                : "",
                        "lastApiUsage",
                        credits.getLastApiUsage() != null
                                ? credits.getLastApiUsage().format(ISO_FORMAT)
                                : "");

        return ResponseEntity.ok(response);
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
            username = principal.toString();
        }
        return userService.findByUsernameIgnoreCase(username).orElse(null);
    }
}
