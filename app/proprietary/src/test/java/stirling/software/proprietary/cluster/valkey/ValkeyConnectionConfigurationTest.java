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
 * Verifies auth-fast-fail on WRONGPASS/NOAUTH/NOPERM: these are unrecoverable so the handshake must
 * short-circuit after one attempt, not burn the 30 s retry loop.
 */
class ValkeyConnectionConfigurationTest {

    @Test
    @DisplayName("WRONGPASS surfaces in one attempt (no 30s retry loop)")
    void wrongpass_failsImmediately_withoutRetries() throws Exception {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisConnection conn = mock(RedisConnection.class);
        when(factory.getConnection()).thenReturn(conn);
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

        verify(factory, times(1)).getConnection();
        verify(conn, times(1)).ping();
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
        assertFalse(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new IllegalStateException("Valkey PING returned 'bar' (expected PONG)")));
    }

    @Test
    @DisplayName("TLS on, skipCertVerification=false → useSsl + verifyPeer=FULL (default)")
    void tls_defaultEnforcesFullPeerVerification() {
        LettuceClientConfiguration cfg =
                ValkeyConnectionConfiguration.buildClientConfiguration(true, false);
        assertTrue(cfg.isUseSsl(), "TLS must be enabled");
        assertSame(SslVerifyMode.FULL, cfg.getVerifyMode());
        assertTrue(cfg.isVerifyPeer());
    }

    @Test
    @DisplayName("TLS on, skipCertVerification=true → verifyPeer=NONE (dev override)")
    void tls_skipCertVerificationOptOut() {
        LettuceClientConfiguration cfg =
                ValkeyConnectionConfiguration.buildClientConfiguration(true, true);
        assertTrue(cfg.isUseSsl());
        assertSame(SslVerifyMode.NONE, cfg.getVerifyMode());
    }

    @Test
    @DisplayName("TLS off → no SSL, verify flag default (skipCertVerification ignored)")
    void noTls_ignoresSkipFlag() {
        LettuceClientConfiguration cfg =
                ValkeyConnectionConfiguration.buildClientConfiguration(false, true);
        assertFalse(cfg.isUseSsl());
    }
}
