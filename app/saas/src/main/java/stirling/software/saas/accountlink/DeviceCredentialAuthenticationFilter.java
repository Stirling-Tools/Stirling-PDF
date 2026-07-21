package stirling.software.saas.accountlink;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Authenticates a linked self-hosted instance by its device credential (combined-billing "Mode A").
 *
 * <p>Reads {@code X-Device-Id} + {@code X-Device-Secret}, looks up the active {@link
 * LinkedInstance}, and constant-time compares the SHA-256 of the presented secret against the
 * stored hash. On a match it sets a {@link LinkedInstanceAuthenticationToken} (team-scoped, {@code
 * ROLE_LINKED_INSTANCE}); otherwise it does nothing and lets the chain continue (→ 401 on a
 * protected endpoint).
 *
 * <p>Read-only and <b>path-scoped to {@code /api/v1/instance/**}</b>: the device principal is never
 * established for user-facing endpoints, so a leaked secret can only reach the instance surface.
 * Gated behind {@code stirling.billing.account-link.enabled}; absent when the flag is off, so
 * {@code SupabaseSecurityConfig} never wires it in.
 */
@Slf4j
@Component
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class DeviceCredentialAuthenticationFilter extends OncePerRequestFilter {

    static final String HEADER_DEVICE_ID = "X-Device-Id";
    static final String HEADER_DEVICE_SECRET = "X-Device-Secret";
    static final String INSTANCE_PATH_PREFIX = "/api/v1/instance/";

    private final LinkedInstanceRepository repo;

    public DeviceCredentialAuthenticationFilter(LinkedInstanceRepository repo) {
        this.repo = repo;
    }

    /** Only the instance surface uses the device credential; everything else skips this filter. */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(INSTANCE_PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String deviceId = request.getHeader(HEADER_DEVICE_ID);
        String secret = request.getHeader(HEADER_DEVICE_SECRET);

        if (deviceId != null
                && secret != null
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            repo.findByDeviceIdAndRevokedAtIsNull(deviceId)
                    .ifPresent(
                            instance -> {
                                if (constantTimeEquals(
                                        AccountLinkService.sha256Hex(secret),
                                        instance.getDeviceSecretHash())) {
                                    SecurityContextHolder.getContext()
                                            .setAuthentication(
                                                    new LinkedInstanceAuthenticationToken(
                                                            instance.getInstanceId(),
                                                            instance.getTeamId()));
                                    // Stamp liveness, best-effort. Auth is already set above; a
                                    // transient write failure must NOT 500 an otherwise-valid
                                    // request, so swallow it. Targeted single-column UPDATE (not a
                                    // full save) so a concurrent revoke between the read above and
                                    // this write can't be clobbered back to active.
                                    try {
                                        repo.touchLastSeen(
                                                instance.getInstanceId(), LocalDateTime.now());
                                    } catch (RuntimeException e) {
                                        log.debug(
                                                "last_seen_at update failed for device {}: {}",
                                                deviceId,
                                                e.getMessage());
                                    }
                                } else {
                                    log.debug("Device credential mismatch for device {}", deviceId);
                                }
                            });
        }

        chain.doFilter(request, response);
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        return MessageDigest.isEqual(
                a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
