package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.atMost;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisSystemException;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;

import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.SslVerifyMode;

/**
 * Unit tests for the auth-fast-fail behaviour of {@link
 * ValkeyConnectionConfiguration#eagerHandshake(LettuceConnectionFactory, String, int, boolean)} and
 * the auth-detection helper {@link ValkeyConnectionConfiguration#isAuthFailure(Throwable)}.
 *
 * <p>An auth-class failure (WRONGPASS / NOAUTH / NOPERM) is unrecoverable; retrying for 30 s only
 * delays the inevitable boot failure and floods logs. The handshake must surface auth errors after
 * exactly one attempt.
 */
class ValkeyConnectionConfigurationTest {

    @Test
    @DisplayName("WRONGPASS surfaces in one attempt (no 30s retry loop)")
    void wrongpass_failsImmediately_withoutRetries() throws Exception {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisConnection conn = mock(RedisConnection.class);
        when(factory.getConnection()).thenReturn(conn);
        // Spring Data Redis wraps RedisCommandExecutionException in RedisSystemException; we
        // simulate the exact wrapper Lettuce → spring-data-redis produces in production.
        RedisCommandExecutionException auth =
                new RedisCommandExecutionException("WRONGPASS invalid username-password pair");
        when(conn.ping()).thenThrow(new RedisSystemException("Error in execution", auth));

        long start = System.nanoTime();
        IllegalStateException ex =
                assertThrows(
                        IllegalStateException.class,
                        () ->
                                ValkeyConnectionConfiguration.eagerHandshake(
                                        factory, "valkey", 6379, false));
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        // Exactly one ping call. A retry loop would call it 10 times with 3 s sleeps.
        verify(factory, times(1)).getConnection();
        verify(conn, times(1)).ping();
        // Generous 1500 ms bound; the single attempt with a mocked connection is sub-ms in
        // practice. The contract is "no 3 s+ sleeps".
        assertTrue(
                elapsedMs < 1500,
                "Auth failure must short-circuit retries; elapsed=" + elapsedMs + " ms");
        assertTrue(
                ex.getMessage().contains("authentication failed"),
                "Error message must explain the auth failure; got: " + ex.getMessage());
        verify(factory, atMost(1)).destroy();
    }

    @Test
    @DisplayName("NOAUTH surfaces in one attempt")
    void noauth_failsImmediately() {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisConnection conn = mock(RedisConnection.class);
        when(factory.getConnection()).thenReturn(conn);
        when(conn.ping())
                .thenThrow(
                        new RedisSystemException(
                                "Error in execution",
                                new RedisCommandExecutionException(
                                        "NOAUTH Authentication required.")));

        assertThrows(
                IllegalStateException.class,
                () -> ValkeyConnectionConfiguration.eagerHandshake(factory, "v", 6379, false));
        verify(conn, times(1)).ping();
    }

    @Test
    @DisplayName("NOPERM surfaces in one attempt")
    void noperm_failsImmediately() {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisConnection conn = mock(RedisConnection.class);
        when(factory.getConnection()).thenReturn(conn);
        when(conn.ping())
                .thenThrow(
                        new RedisSystemException(
                                "Error in execution",
                                new RedisCommandExecutionException(
                                        "NOPERM this user has no permissions to run the 'ping'"
                                                + " command")));

        assertThrows(
                IllegalStateException.class,
                () -> ValkeyConnectionConfiguration.eagerHandshake(factory, "v", 6379, false));
        verify(conn, times(1)).ping();
    }

    @Test
    @DisplayName("isAuthFailure - direct RedisCommandExecutionException with auth prefix")
    void isAuthFailure_directRedisCommandExecutionException() {
        assertTrue(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new RedisCommandExecutionException("WRONGPASS bad password")));
        assertTrue(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new RedisCommandExecutionException("NOAUTH required")));
        assertTrue(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new RedisCommandExecutionException("NOPERM denied")));
    }

    @Test
    @DisplayName("isAuthFailure - wrapped inside RedisSystemException (production path)")
    void isAuthFailure_wrappedBySpring() {
        assertTrue(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new RedisSystemException(
                                "Error in execution",
                                new RedisCommandExecutionException("WRONGPASS bad password"))));
    }

    @Test
    @DisplayName("isAuthFailure - connection errors do NOT count as auth failures")
    void isAuthFailure_connectionErrorReturnsFalse() {
        // A transport-level failure must continue to retry.
        assertFalse(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new RedisSystemException(
                                "Redis connection failed",
                                new io.lettuce.core.RedisConnectionException(
                                        "Connection refused"))));
        assertFalse(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new IllegalStateException("Valkey PING returned 'foo' (expected PONG)")));
    }

    @Test
    @DisplayName("bad PONG (protocol error) is not an auth failure")
    void unexpectedPong_isNotAuthFailure() {
        // Sanity: a returned non-PONG string maps to IllegalStateException inside the try block
        // and must not be treated as auth, otherwise misclassified protocol errors would skip
        // the retry loop too.
        assertFalse(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new IllegalStateException("Valkey PING returned 'bar' (expected PONG)")));
    }

    // --------------------------------------------------------------------------------------
    // D5: TLS hostname/chain verification (default ON, opt-out for dev only)
    // --------------------------------------------------------------------------------------

    @Test
    @DisplayName("TLS on, skipCertVerification=false → useSsl + verifyPeer=FULL (default)")
    void tls_defaultEnforcesFullPeerVerification() {
        LettuceClientConfiguration cfg =
                ValkeyConnectionConfiguration.buildClientConfiguration(true, false);
        assertTrue(cfg.isUseSsl(), "TLS must be enabled");
        // FULL = chain + hostname. CA-only or NONE would be a silent downgrade and is why we
        // pin this explicitly rather than relying on the upstream Spring default.
        assertSame(SslVerifyMode.FULL, cfg.getVerifyMode());
        assertTrue(cfg.isVerifyPeer());
    }

    @Test
    @DisplayName("TLS on, skipCertVerification=true → verifyPeer=NONE (dev override)")
    void tls_skipCertVerificationOptOut() {
        LettuceClientConfiguration cfg =
                ValkeyConnectionConfiguration.buildClientConfiguration(true, true);
        assertTrue(cfg.isUseSsl());
        // The opt-out path is intentionally available for self-signed local dev certs, but
        // requires explicit operator action via cluster.valkey.tls.skip-cert-verification.
        assertSame(SslVerifyMode.NONE, cfg.getVerifyMode());
    }

    @Test
    @DisplayName("TLS off → no SSL, verify flag default (skipCertVerification ignored)")
    void noTls_ignoresSkipFlag() {
        // Without rediss:// we never call useSsl(), so the skip flag is a no-op. Confirming
        // here so we cannot accidentally trip TLS off on plain redis:// connections.
        LettuceClientConfiguration cfg =
                ValkeyConnectionConfiguration.buildClientConfiguration(false, true);
        assertFalse(cfg.isUseSsl());
    }
}
