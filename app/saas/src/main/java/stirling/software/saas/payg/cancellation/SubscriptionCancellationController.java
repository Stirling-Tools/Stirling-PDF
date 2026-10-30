package stirling.software.saas.payg.cancellation;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.cancellation.SubscriptionCancellationService.CancelRequest;
import stirling.software.saas.payg.cancellation.SubscriptionCancellationService.ContactRequest;
import stirling.software.saas.payg.cancellation.SubscriptionCancellationService.SubscriptionView;
import stirling.software.saas.security.UserTeamResolver;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Billing leaders cancel, resume, or ask to talk before cancelling, from Usage & Billing instead of
 * Stripe's portal. The team comes from the caller, never from the request.
 */
@Hidden
@RestController
@RequestMapping("/api/v1/payg/subscriptions")
@Profile("saas")
@RequiredArgsConstructor
public class SubscriptionCancellationController {

    public record ResumeRequest(String product) {}

    private record Leader(User user, long teamId) {}

    private final SubscriptionCancellationService service;
    private final UserRepository userRepository;
    private final UserTeamResolver userTeamResolver;

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public Map<String, List<SubscriptionView>> status(Authentication auth) {
        return Map.of("subscriptions", service.status(leader(auth).teamId()));
    }

    @PostMapping("/cancel")
    @PreAuthorize("isAuthenticated()")
    public Map<String, List<SubscriptionView>> cancel(
            @RequestBody CancelRequest request, Authentication auth) {
        Leader leader = leader(auth);
        return Map.of("subscriptions", service.cancel(leader.teamId(), leader.user(), request));
    }

    @PostMapping("/resume")
    @PreAuthorize("isAuthenticated()")
    public Map<String, List<SubscriptionView>> resume(
            @RequestBody ResumeRequest request, Authentication auth) {
        Leader leader = leader(auth);
        return Map.of(
                "subscriptions", service.resume(leader.teamId(), leader.user(), request.product()));
    }

    @PostMapping("/contact")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Boolean> contact(@RequestBody ContactRequest request, Authentication auth) {
        Leader leader = leader(auth);
        service.contact(leader.teamId(), leader.user(), request);
        return Map.of("sent", true);
    }

    @ExceptionHandler(CancellationException.class)
    public ResponseEntity<Map<String, String>> refused(CancellationException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.code()));
    }

    private Leader leader(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            throw new CancellationException(HttpStatus.UNAUTHORIZED, "unauthorized");
        }
        Optional<Long> team = userTeamResolver.teamId(user);
        if (team.isEmpty() || !userTeamResolver.isLeader(user)) {
            throw new CancellationException(HttpStatus.FORBIDDEN, "billing_leader_required");
        }
        return new Leader(user, team.get());
    }
}
