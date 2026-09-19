package stirling.software.saas.controller;

import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.accountlink.CloudOwnershipStatus;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.saas.service.SaasOwnershipHandoverService;
import stirling.software.saas.util.AuthenticationUtils;

/** Uses the same team-scoped handover checks as a linked server, with human authentication. */
@RestController
@Profile("saas")
@RequestMapping("/api/v1/team/{teamId}/ownership")
@RequiredArgsConstructor
public class TeamOwnershipHandoverController {
    private final SaasOwnershipHandoverService handovers;
    private final UserRepository users;

    public record Request(String email, Long expectedLeaderId) {}

    @PostMapping("/status")
    @PreAuthorize("@teamSecurity.isTeamMember(#teamId)")
    public CloudOwnershipStatus status(@PathVariable Long teamId, @RequestBody Request request) {
        return handovers.status(teamId, request.email());
    }

    @PostMapping("/transfer")
    @PreAuthorize("@teamSecurity.isTeamMember(#teamId)")
    public CloudOwnershipStatus transfer(
            @PathVariable Long teamId, @RequestBody Request request, Authentication auth) {
        return handovers.change(
                teamId,
                request.email(),
                request.expectedLeaderId(),
                AuthenticationUtils.getCurrentUser(auth, users),
                "transfer");
    }
}
