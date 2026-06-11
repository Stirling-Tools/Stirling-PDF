package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.atMost;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisSystemException;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;

import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.SslVerifyMode;

import stirling.software.proprietary.cluster.valkey.ValkeyConnectionConfiguration.Endpoint;

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

    @Nested
    @DisplayName("parseUrl()")
    class ParseUrl {

        @Test
        @DisplayName("host + explicit port, no auth, no TLS")
        void hostAndPort() {
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://valkey.internal:6380");
            assertEquals("valkey.internal", e.host());
            assertEquals(6380, e.port());
            assertFalse(e.tls());
            assertNull(e.username());
            assertNull(e.password());
        }

        @Test
        @DisplayName("missing port defaults to 6379")
        void defaultPort() {
            assertEquals(6379, ValkeyConnectionConfiguration.parseUrl("redis://host").port());
        }

        @Test
        @DisplayName("rediss:// scheme selects TLS")
        void redissSelectsTls() {
            assertTrue(ValkeyConnectionConfiguration.parseUrl("rediss://host:6379").tls());
        }

        @Test
        @DisplayName("user:password@ sets both credentials")
        void userAndPassword() {
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://alice:s3cret@host");
            assertEquals("alice", e.username());
            assertEquals("s3cret", e.password());
        }

        @Test
        @DisplayName("empty user (:pw@) is password-only auth, username stays null")
        void passwordOnlyEmptyUser() {
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://:s3cret@host");
            assertNull(e.username(), "empty user must NOT become an empty-string username");
            assertEquals("s3cret", e.password());
        }

        @Test
        @DisplayName("single userinfo token (no colon) is treated as the password")
        void passwordOnlyNoColon() {
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://s3cret@host");
            assertNull(e.username());
            assertEquals("s3cret", e.password());
        }

        @Test
        @DisplayName("only the first colon splits user/password (colons allowed in password)")
        void colonInPassword() {
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://user:pa:ss:word@host");
            assertEquals("user", e.username());
            assertEquals("pa:ss:word", e.password());
        }

        @Test
        @DisplayName("percent-encoded reserved chars are decoded in the password")
        void percentEncodedPassword() {
            // %40 -> '@', %23 -> '#': both must be encoded or URI parses them structurally.
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://:p%40ss%23word@host");
            assertNull(e.username());
            assertEquals("p@ss#word", e.password());
        }

        @Test
        @DisplayName("blank url throws with a backplane-config message")
        void blankUrlThrows() {
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> ValkeyConnectionConfiguration.parseUrl("   "));
            assertTrue(ex.getMessage().contains("cluster.valkey.url must be set"));
        }

        @Test
        @DisplayName("null url throws")
        void nullUrlThrows() {
            assertThrows(
                    IllegalStateException.class,
                    () -> ValkeyConnectionConfiguration.parseUrl(null));
        }

        @Test
        @DisplayName("url with no host throws a clear error (scheme-less host:port pitfall)")
        void noHostThrows() {
            // "localhost:6379" parses 'localhost' as the scheme, leaving no authority/host.
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> ValkeyConnectionConfiguration.parseUrl("localhost:6379"));
            assertTrue(
                    ex.getMessage().contains("has no host"),
                    "message must name the missing host; got: " + ex.getMessage());
        }

        @Test
        @DisplayName("non-numeric port yields no host (URI registry-authority fallback)")
        void nonNumericPortHasNoHost() {
            // java.net.URI does not throw on a bad port; it falls back to registry authority and
            // reports host=null, so this must surface as the clear no-host error, not a NPE later.
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> ValkeyConnectionConfiguration.parseUrl("redis://host:notaport"));
            assertTrue(ex.getMessage().contains("has no host"));
        }

        @Test
        @DisplayName("syntactically invalid uri throws with the offending url")
        void invalidUriThrows() {
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> ValkeyConnectionConfiguration.parseUrl("redis://ho st:6379"));
            assertTrue(ex.getMessage().contains("not a valid URI"));
            assertTrue(ex.getMessage().contains("redis://ho st:6379"));
        }
    }
}
