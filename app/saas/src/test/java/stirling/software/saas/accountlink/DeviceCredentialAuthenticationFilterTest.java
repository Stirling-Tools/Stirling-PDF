package stirling.software.saas.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import jakarta.servlet.ServletException;

@ExtendWith(MockitoExtension.class)
class DeviceCredentialAuthenticationFilterTest {

    @Mock private LinkedInstanceRepository repo;

    private DeviceCredentialAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        filter = new DeviceCredentialAuthenticationFilter(repo);
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static LinkedInstance instanceWithSecret(String secret) {
        LinkedInstance i = new LinkedInstance();
        i.setInstanceId(1L);
        i.setTeamId(42L);
        i.setDeviceId("dev-1");
        i.setDeviceSecretHash(AccountLinkService.sha256Hex(secret));
        return i;
    }

    private static MockHttpServletRequest instanceRequest(String deviceId, String secret) {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/instance/whoami");
        if (deviceId != null) {
            req.addHeader("X-Device-Id", deviceId);
        }
        if (secret != null) {
            req.addHeader("X-Device-Secret", secret);
        }
        return req;
    }

    @Test
    void validCredentialAuthenticatesAsInstanceBoundToTeam() throws ServletException, IOException {
        when(repo.findByDeviceIdAndRevokedAtIsNull("dev-1"))
                .thenReturn(Optional.of(instanceWithSecret("s3cr3t")));

        filter.doFilter(
                instanceRequest("dev-1", "s3cr3t"),
                new MockHttpServletResponse(),
                new MockFilterChain());

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertInstanceOf(LinkedInstanceAuthenticationToken.class, auth);
        LinkedInstanceAuthenticationToken token = (LinkedInstanceAuthenticationToken) auth;
        assertEquals(42L, token.getTeamId());
        assertEquals(1L, token.getInstanceId());
        assertEquals(
                "ROLE_LINKED_INSTANCE", token.getAuthorities().iterator().next().getAuthority());
    }

    @Test
    void successfulAuthStampsLastSeen() throws ServletException, IOException {
        LinkedInstance instance = instanceWithSecret("s3cr3t");
        when(repo.findByDeviceIdAndRevokedAtIsNull("dev-1")).thenReturn(Optional.of(instance));

        filter.doFilter(
                instanceRequest("dev-1", "s3cr3t"),
                new MockHttpServletResponse(),
                new MockFilterChain());

        assertNotNull(instance.getLastSeenAt(), "last_seen_at stamped on successful auth");
        verify(repo).save(instance);
    }

    @Test
    void wrongSecretDoesNotAuthenticate() throws ServletException, IOException {
        when(repo.findByDeviceIdAndRevokedAtIsNull("dev-1"))
                .thenReturn(Optional.of(instanceWithSecret("right-secret")));

        filter.doFilter(
                instanceRequest("dev-1", "wrong-secret"),
                new MockHttpServletResponse(),
                new MockFilterChain());

        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    void unknownOrRevokedDeviceDoesNotAuthenticate() throws ServletException, IOException {
        when(repo.findByDeviceIdAndRevokedAtIsNull("dev-1")).thenReturn(Optional.empty());

        filter.doFilter(
                instanceRequest("dev-1", "whatever"),
                new MockHttpServletResponse(),
                new MockFilterChain());

        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    void nonInstancePathIsSkippedEntirely() throws ServletException, IOException {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/payg/wallet");
        req.addHeader("X-Device-Id", "dev-1");
        req.addHeader("X-Device-Secret", "s3cr3t");

        filter.doFilter(req, new MockHttpServletResponse(), new MockFilterChain());

        // Path-scoped: the device credential never even reaches the repo on a non-instance path.
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verifyNoInteractions(repo);
    }
}
