package stirling.software.saas.accountlink;

import java.util.List;

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

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Account-link registration surface (combined-billing "Mode A").
 *
 * <p>A self-hosted instance's local backend calls {@code POST /register} with the admin's
 * short-lived Supabase JWT (validated by the existing {@code SupabaseSecurityConfig} chain — no new
 * auth here). We resolve the caller's team, mint a device credential bound to it, and return the
 * secret exactly once. Ongoing entitlement reads authenticate with that device credential, not this
 * JWT.
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
    private final TeamMembershipRepository memberRepo;
    private final UserRepository userRepository;

    public AccountLinkController(
            AccountLinkService service,
            TeamMembershipRepository memberRepo,
            UserRepository userRepository) {
        this.service = service;
        this.memberRepo = memberRepo;
        this.userRepository = userRepository;
    }

    /** Optional display name for the instance (hostname / label). */
    public record RegisterRequest(String name) {}

    /** {@code deviceSecret} is plaintext and returned exactly once — the caller must store it. */
    public record RegisterResponse(
            Long instanceId, Long teamId, String deviceId, String deviceSecret, String name) {}

    public record InstanceRow(
            Long instanceId,
            String deviceId,
            String name,
            String createdAt,
            String lastSeenAt,
            boolean revoked) {}

    @PostMapping("/register")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<RegisterResponse> register(
            @RequestBody(required = false) RegisterRequest req, Authentication auth) {
        LeaderTeam lt = resolveLeaderTeam(auth);
        if (lt.error() != null) {
            return ResponseEntity.status(lt.error()).build();
        }
        String name = req != null ? req.name() : null;
        AccountLinkService.RegisteredInstance reg =
                service.register(lt.teamId(), lt.userId(), name);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(
                        new RegisterResponse(
                                reg.instanceId(),
                                lt.teamId(),
                                reg.deviceId(),
                                reg.deviceSecret(),
                                reg.name()));
    }

    @GetMapping("/instances")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<InstanceRow>> list(Authentication auth) {
        LeaderTeam lt = resolveLeaderTeam(auth);
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
        LeaderTeam lt = resolveLeaderTeam(auth);
        if (lt.error() != null) {
            return ResponseEntity.status(lt.error()).build();
        }
        boolean ok = service.revoke(lt.teamId(), instanceId);
        return ok ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    // ---------------------------------------------------------------------------------------
    // Helpers — team always derived from the caller; instance linking is a leader (billing) action.
    // ---------------------------------------------------------------------------------------

    /**
     * Resolved caller team, or an {@code error} status to return (teamId/userId null when error).
     */
    private record LeaderTeam(Long teamId, Long userId, HttpStatus error) {}

    private LeaderTeam resolveLeaderTeam(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return new LeaderTeam(null, null, HttpStatus.UNAUTHORIZED);
        }
        List<TeamMembership> rows = memberRepo.findPrimaryMembership(user.getId());
        if (rows.isEmpty()) {
            return new LeaderTeam(null, null, HttpStatus.FORBIDDEN);
        }
        TeamMembership m = rows.get(0);
        if (m.getRole() != TeamRole.LEADER) {
            return new LeaderTeam(null, null, HttpStatus.FORBIDDEN);
        }
        return new LeaderTeam(m.getTeam().getId(), user.getId(), null);
    }
}
