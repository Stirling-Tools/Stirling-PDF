package stirling.software.proprietary.mcp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

class LazyIssuerJwtDecoderTest {

    private final SettableClock clock = new SettableClock(Instant.parse("2026-01-01T00:00:00Z"));
    private final AtomicInteger attempts = new AtomicInteger();

    private Supplier<JwtDecoder> failing() {
        return () -> {
            attempts.incrementAndGet();
            throw new IllegalStateException("issuer down");
        };
    }

    @Test
    void aFailedDiscoveryRejectsTheTokenAsBad() {
        LazyIssuerJwtDecoder decoder = new LazyIssuerJwtDecoder(failing(), clock);

        assertThatThrownBy(() -> decoder.decode("a.b.c"))
                .isInstanceOf(BadJwtException.class)
                .hasCauseInstanceOf(IllegalStateException.class);
    }

    @Test
    void aFailedDiscoveryIsNotRetriedUntilTheCooldownPasses() {
        LazyIssuerJwtDecoder decoder = new LazyIssuerJwtDecoder(failing(), clock);

        assertThatThrownBy(() -> decoder.decode("a.b.c")).isInstanceOf(BadJwtException.class);
        assertThatThrownBy(() -> decoder.decode("a.b.c")).isInstanceOf(BadJwtException.class);
        assertThat(attempts).hasValue(1);

        clock.advance(LazyIssuerJwtDecoder.RETRY_AFTER);
        assertThatThrownBy(() -> decoder.decode("a.b.c")).isInstanceOf(BadJwtException.class);
        assertThat(attempts).hasValue(2);
    }

    @Test
    void aSuccessfulDiscoveryIsBuiltOnceAndThenDecodes() {
        JwtDecoder delegate = mock(JwtDecoder.class);
        Jwt jwt = mock(Jwt.class);
        when(delegate.decode("a.b.c")).thenReturn(jwt);
        LazyIssuerJwtDecoder decoder =
                new LazyIssuerJwtDecoder(
                        () -> {
                            attempts.incrementAndGet();
                            return delegate;
                        },
                        clock);

        assertThat(decoder.decode("a.b.c")).isSameAs(jwt);
        assertThat(decoder.decode("a.b.c")).isSameAs(jwt);
        assertThat(attempts).hasValue(1);
    }
}

/** A clock the test moves by hand. */
class SettableClock extends Clock {

    private Instant now;

    SettableClock(Instant now) {
        this.now = now;
    }

    void advance(java.time.Duration by) {
        now = now.plus(by);
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }

    @Override
    public Instant instant() {
        return now;
    }
}
