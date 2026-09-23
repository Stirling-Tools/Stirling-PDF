package stirling.software.proprietary.accountlink;

import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.service.OwnershipHandoverService;
import stirling.software.proprietary.service.OwnershipHandoverService.Status;

/** Only the local owner may prepare, resume or advance this server's ownership handover. */
@RestController
@Profile("!saas")
@RequestMapping("/api/v1/ownership/handover")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class LocalOwnershipHandoverController {
    private final OwnershipHandoverService handovers;

    @GetMapping
    public Status current(Authentication auth) {
        return handovers.current(auth);
    }

    @PostMapping("/{targetId}")
    public Status prepare(
            @PathVariable Long targetId,
            @jakarta.validation.Valid @RequestBody(required = false)
                    OwnershipHandoverService.Selection selection,
            Authentication auth) {
        return handovers.prepare(targetId, selection, auth);
    }

    @PostMapping("/cloud/{action:invite|transfer}")
    public Status cloud(
            @PathVariable String action,
            @RequestHeader(value = "X-SaaS-Authorization", required = false) String bearer,
            Authentication auth) {
        return handovers.changeCloud(auth, bearer, action);
    }

    @DeleteMapping
    public void cancel(Authentication auth) {
        handovers.cancel(auth);
    }
}
