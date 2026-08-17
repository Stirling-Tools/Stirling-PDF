package stirling.software.saas.accountlink;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.accountlink.LeaderTeamResolver.LeaderTeam;

/**
 * Team-wide management of linked instances (combined-billing "Mode A").
 *
 * <p>Read and revoke only. Instances are created by the browser-mediated handshake in {@link
 * ConnectController}, not here: an admin approves on our origin and the instance collects its own
 * credential, so no Supabase JWT is ever relayed through a customer's server.
 *
 * <p>Whole surface gated behind {@code stirling.billing.account-link.enabled}: off → beans absent →
 * 404. Leader-only, and the team is always derived from the caller (never the request body).
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/account-link")
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class AccountLinkController {

    private final AccountLinkService service;
    private final LeaderTeamResolver leaderTeams;

    public AccountLinkController(AccountLinkService service, LeaderTeamResolver leaderTeams) {
        this.service = service;
        this.leaderTeams = leaderTeams;
    }

    public record InstanceRow(
            Long instanceId,
            String deviceId,
            String name,
            String createdAt,
            String lastSeenAt,
            boolean revoked) {}

    /*
     * POST /register is gone. It took the admin's Supabase JWT, relayed from their instance, and
     * minted a device credential in the response. Linking is now a browser-mediated handshake
     * (ConnectController), so the token never leaves the admin's own browser and the credential is
     * collected by the instance against a claim secret instead.
     *
     * AccountLinkService.register survives and is still the only thing that mints: ConnectRequestService
     * calls it when a handshake is claimed. Only the JWT-authenticated entry point has been removed.
     */

    @GetMapping("/instances")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<InstanceRow>> list(Authentication auth) {
        LeaderTeam lt = leaderTeams.resolve(auth);
        if (lt.error() != null) {
            return ResponseEntity.status(lt.error()).build();
        }
        List<InstanceRow> rows =
                service.list(lt.teamId()).stream()
                        .map(
                                i ->
                                        new InstanceRow(
                                                i.getInstanceId(),
                                                i.getDeviceId(),
                                                i.getName(),
                                                i.getCreatedAt() != null
                                                        ? i.getCreatedAt().toString()
                                                        : null,
                                                i.getLastSeenAt() != null
                                                        ? i.getLastSeenAt().toString()
                                                        : null,
                                                i.getRevokedAt() != null))
                        .toList();
        return ResponseEntity.ok(rows);
    }

    @PostMapping("/instances/{instanceId}/revoke")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> revoke(@PathVariable Long instanceId, Authentication auth) {
        LeaderTeam lt = leaderTeams.resolve(auth);
        if (lt.error() != null) {
            return ResponseEntity.status(lt.error()).build();
        }
        boolean ok = service.revoke(lt.teamId(), instanceId);
        return ok ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }
}
