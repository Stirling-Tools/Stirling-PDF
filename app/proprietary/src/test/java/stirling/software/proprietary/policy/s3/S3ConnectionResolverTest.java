package stirling.software.proprietary.policy.s3;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.proprietary.access.service.OwnershipService;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/**
 * Tests for {@link S3ConnectionResolver}: connection dereferencing with per-use overrides, the
 * legacy embedded fallback, and the save-time access check that background sweeps skip.
 */
@ExtendWith(MockitoExtension.class)
class S3ConnectionResolverTest {

    @Mock private IntegrationConfigRepository connections;
    @Mock private OwnershipService ownership;
    @Mock private UserService userService;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void resolvesAConnectionAndMergesPerUseOptions() {
        when(connections.findById(9L)).thenReturn(Optional.of(s3Connection(9L, true)));

        S3Config config =
                resolver()
                        .resolve(
                                Map.of(
                                        "connectionId", 9L,
                                        "prefix", "incoming/",
                                        "mode", "snapshot"));

        assertEquals("inbox", config.bucket());
        assertEquals("AKIAEXAMPLE", config.accessKeyId());
        assertEquals("incoming/", config.prefix());
        assertTrue(config.snapshot());
    }

    @Test
    void acceptsAStringConnectionReference() {
        when(connections.findById(9L)).thenReturn(Optional.of(s3Connection(9L, true)));

        assertEquals("inbox", resolver().resolve(Map.of("connectionId", "9")).bucket());
    }

    @Test
    void fallsBackToLegacyEmbeddedCredentials() {
        S3Config config =
                resolver()
                        .resolve(
                                Map.of(
                                        "bucket", "legacy",
                                        "accessKeyId", "AKIAEXAMPLE",
                                        "secretAccessKey", "shh"));

        assertEquals("legacy", config.bucket());
    }

    @Test
    void rejectsUnknownDisabledOrWrongTypeConnections() {
        when(connections.findById(1L)).thenReturn(Optional.empty());
        assertThrows(
                IllegalArgumentException.class,
                () -> resolver().resolve(Map.of("connectionId", 1L)));

        when(connections.findById(2L)).thenReturn(Optional.of(s3Connection(2L, false)));
        assertThrows(
                IllegalArgumentException.class,
                () -> resolver().resolve(Map.of("connectionId", 2L)));

        IntegrationConfig mcp = s3Connection(3L, true);
        mcp.setIntegrationType(IntegrationType.MCP);
        when(connections.findById(3L)).thenReturn(Optional.of(mcp));
        assertThrows(
                IllegalArgumentException.class,
                () -> resolver().resolve(Map.of("connectionId", 3L)));
    }

    @Test
    void anAuthenticatedSaverMustBeAllowedToUseTheConnection() {
        when(connections.findById(9L)).thenReturn(Optional.of(s3Connection(9L, true)));
        User saver = new User();
        saver.setUsername("alice");
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(saver, null, java.util.List.of()));
        when(ownership.canUse(any(), any(IntegrationConfig.class), eq(saver))).thenReturn(false);

        assertThrows(
                IllegalArgumentException.class,
                () -> resolver().resolve(Map.of("connectionId", 9L)));
    }

    @Test
    void backgroundSweepsWithNoUserSkipTheAccessCheck() {
        when(connections.findById(9L)).thenReturn(Optional.of(s3Connection(9L, true)));

        // No authentication in the context: resolution succeeds without consulting ownership.
        assertEquals("inbox", resolver().resolve(Map.of("connectionId", 9L)).bucket());
    }

    private S3ConnectionResolver resolver() {
        return new S3ConnectionResolver(connections, ownership, userService);
    }

    private static IntegrationConfig s3Connection(long id, boolean enabled) {
        IntegrationConfig connection = new IntegrationConfig();
        connection.setId(id);
        connection.setIntegrationType(IntegrationType.S3);
        connection.setName("Claims bucket");
        connection.setEnabled(enabled);
        connection.setConfig(
                "{\"bucket\":\"inbox\",\"accessKeyId\":\"AKIAEXAMPLE\","
                        + "\"secretAccessKey\":\"shh\"}");
        return connection;
    }
}
