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

/** Team-wide management of linked instances (combined-billing "Mode A"). */
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
