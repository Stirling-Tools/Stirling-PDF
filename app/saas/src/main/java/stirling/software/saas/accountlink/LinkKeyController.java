package stirling.software.saas.accountlink;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.saas.accountlink.LeaderTeamResolver.LeaderTeam;

/**
 * Link keys: leaders create and withdraw them; a self-hosted server redeems one, server to server,
 * with the key itself as its only credential.
 */
@Hidden
@RestController
@RequestMapping("/api/v1/account-link/keys")
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class LinkKeyController {

    /** Far above what linking a fleet needs, far below what probing would. */
    static final int REDEEMS_PER_HOUR = 20;

    private final LinkKeyService service;
    private final LeaderTeamResolver leaderTeams;
    private final RateLimitStore rateLimits;

    public LinkKeyController(
            LinkKeyService service, LeaderTeamResolver leaderTeams, RateLimitStore rateLimits) {
        this.service = service;
        this.leaderTeams = leaderTeams;
        this.rateLimits = rateLimits;
    }

    public record CreateRequest(@Size(max = 255) String name) {}

    public record KeyRow(String keyId, String name, String createdAt, String expiresAt) {}

    public record RedeemRequest(String key, String name) {}

    public record RedeemResponse(String deviceId, String deviceSecret, Long teamId) {}

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> create(
            @Valid @RequestBody(required = false) CreateRequest body, Authentication auth) {
        LeaderTeam lt = leaderTeams.resolve(auth);
        if (lt.isError()) {
            return ResponseEntity.status(lt.error()).build();
        }
        LinkKeyService.CreatedKey created =
                service.create(lt.teamId(), lt.userId(), body != null ? body.name() : null);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<KeyRow>> list(Authentication auth) {
        LeaderTeam lt = leaderTeams.resolve(auth);
        if (lt.isError()) {
            return ResponseEntity.status(lt.error()).build();
        }
        return ResponseEntity.ok(
                service.listUsable(lt.teamId()).stream()
                        .map(
                                k ->
                                        new KeyRow(
                                                k.getKeyId(),
                                                k.getName(),
                                                iso(k.getCreatedAt()),
                                                iso(k.getExpiresAt())))
                        .toList());
    }

    @PostMapping("/{keyId}/revoke")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> revoke(@PathVariable String keyId, Authentication auth) {
        LeaderTeam lt = leaderTeams.resolve(auth);
        if (lt.isError()) {
            return ResponseEntity.status(lt.error()).build();
        }
        return service.revoke(lt.teamId(), keyId)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    /** Unauthenticated by design: possession of the key is the authorisation. */
    @PostMapping("/redeem")
    public ResponseEntity<?> redeem(
            @RequestBody(required = false) RedeemRequest body, HttpServletRequest http) {
        if (!rateLimits
                .tryConsume(
                        "account-link:redeem:" + clientIp(http),
                        REDEEMS_PER_HOUR,
                        Duration.ofHours(1))
                .allowed()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("error", "RATE_LIMITED"));
        }
        if (body == null || body.key() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "KEY_REJECTED"));
        }
        return service.redeem(body.key(), body.name())
                .<ResponseEntity<?>>map(
                        r ->
                                ResponseEntity.ok(
                                        new RedeemResponse(
                                                r.deviceId(), r.deviceSecret(), r.teamId())))
                .orElseGet(() -> ResponseEntity.badRequest().body(Map.of("error", "KEY_REJECTED")));
    }

    /** Not X-Forwarded-For: the caller sets it. The container resolves trusted proxies itself. */
    private static String clientIp(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        return remote == null || remote.length() <= 45 ? remote : remote.substring(0, 45);
    }

    private static String iso(LocalDateTime value) {
        return value != null ? value.toString() : null;
    }
}
