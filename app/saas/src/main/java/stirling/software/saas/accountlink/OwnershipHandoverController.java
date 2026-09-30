package stirling.software.saas.accountlink;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.accountlink.CloudOwnershipCandidates;
import stirling.software.proprietary.accountlink.CloudOwnershipStatus;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.saas.service.SaasOwnershipHandoverService;
import stirling.software.saas.util.AuthenticationUtils;

/** Device reads cannot grant cloud ownership; mutations require the current human cloud leader. */
@RestController
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
@RequiredArgsConstructor
public class OwnershipHandoverController {
    private final AccountLinkService links;
    private final SaasOwnershipHandoverService handovers;
    private final UserRepository users;

    public record Request(String email, Long expectedLeaderId, Long expectedTargetId) {
        public Request(String email, Long expectedLeaderId) {
            this(email, expectedLeaderId, null);
        }
    }

    @GetMapping("/api/v1/instance/ownership/members")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public CloudOwnershipCandidates candidates(Authentication auth) {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return handovers.candidates(token.getTeamId());
    }

    @PostMapping("/api/v1/instance/ownership/status")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public CloudOwnershipStatus status(@RequestBody Request request, Authentication auth) {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return handovers.status(token.getTeamId(), request.email(), request.expectedTargetId());
    }

    @PostMapping("/api/v1/account-link/ownership/{action:invite|transfer}")
    @PreAuthorize("isAuthenticated()")
    public CloudOwnershipStatus change(
            @PathVariable String action,
            @RequestHeader("X-Device-Id") String deviceId,
            @RequestHeader("X-Device-Secret") String secret,
            @RequestBody Request request,
            Authentication auth) {
        LinkedInstance instance =
                links.resolveActiveInstance(deviceId, secret)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.FORBIDDEN, "LINK_CHANGED"));
        return handovers.changeFromInstance(
                instance,
                request.email(),
                request.expectedLeaderId(),
                AuthenticationUtils.getCurrentUser(auth, users),
                action,
                request.expectedTargetId());
    }
}
