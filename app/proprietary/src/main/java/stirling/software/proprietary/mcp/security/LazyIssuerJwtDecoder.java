package stirling.software.proprietary.mcp.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

import lombok.extern.slf4j.Slf4j;

/**
 * Builds the issuer-backed decoder on first use rather than at startup, so an issuer that is down
 * or mistyped stops MCP sign-in, not the server. Until it is built every token is rejected with
 * {@link BadJwtException}, which the resource server answers with a 401; Spring's own
 * SupplierJwtDecoder throws a plain runtime exception there, which surfaces as a 500. Discovery
 * runs on one request at a time, requests that arrive meanwhile are rejected at once rather than
 * queued behind it, and a failed attempt is not repeated for {@link #RETRY_AFTER}.
 */
@Slf4j
final class LazyIssuerJwtDecoder implements JwtDecoder {

    static final Duration RETRY_AFTER = Duration.ofSeconds(30);

    private final Supplier<JwtDecoder> build;
    private final Clock clock;
    private final ReentrantLock building = new ReentrantLock();
    private volatile JwtDecoder delegate;
    private volatile Instant retryAt = Instant.MIN;

    LazyIssuerJwtDecoder(Supplier<JwtDecoder> build) {
        this(build, Clock.systemUTC());
    }

    LazyIssuerJwtDecoder(Supplier<JwtDecoder> build, Clock clock) {
        this.build = build;
        this.clock = clock;
    }

    @Override
    public Jwt decode(String token) throws JwtException {
        JwtDecoder ready = delegate;
        return (ready != null ? ready : resolve()).decode(token);
    }

    private JwtDecoder resolve() {
        if (!building.tryLock()) {
            throw new BadJwtException("MCP issuer discovery is still in progress");
        }
        try {
            if (delegate != null) {
                return delegate;
            }
            Instant now = clock.instant();
            if (now.isBefore(retryAt)) {
                throw new BadJwtException("MCP issuer is unavailable");
            }
            try {
                delegate = build.get();
                return delegate;
            } catch (RuntimeException e) {
                retryAt = now.plus(RETRY_AFTER);
                log.warn(
                        "MCP issuer discovery failed; rejecting tokens for {}s before retrying: {}",
                        RETRY_AFTER.toSeconds(),
                        e.getMessage());
                throw new BadJwtException("MCP issuer discovery failed", e);
            }
        } finally {
            building.unlock();
        }
    }
}
