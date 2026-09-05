package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * The local (self-hosted) account-link controller's error mapping. Every upstream or transport
 * failure is a 502, and the response body never echoes the exception, because a DNS or TLS message
 * can carry the configured SaaS host.
 */
class AccountLinkControllerTest {

    private AccountLinkService service;
    private ConnectService connectService;
    private UsageSyncService syncService;
    private ObjectProvider<UsageSyncService> syncProvider;
    private AccountLinkController controller;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        service = mock(AccountLinkService.class);
        connectService = mock(ConnectService.class);
        syncService = mock(UsageSyncService.class);
        syncProvider = mock(ObjectProvider.class);
        controller =
                new AccountLinkController(
                        service, connectService, mock(LocalUsageService.class), syncProvider);
    }

    // These asserted POST /link's error mapping, which distinguished 401/403 so the portal could
    // prompt a re-sign-in. That endpoint is gone with the JWT relay, and the distinction went with
    // it: connect/start carries no user token, so an upstream refusal is never the admin's session
    // and everything non-transport is a plain gateway failure.

    @Test
    void connectStart_upstreamFailure_maps502() throws Exception {
        when(connectService.start(any(), any()))
                .thenThrow(new AccountLinkClient.UpstreamException(500, "boom"));

        ResponseEntity<?> resp = controller.connectStart(null, request());

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    @Test
    void connectStart_transportFailure_maps502WithoutLeakingTheHost() throws Exception {
        when(connectService.start(any(), any()))
                .thenThrow(new IOException("connection refused to saas.internal:8081"));

        ResponseEntity<?> resp = controller.connectStart(null, request());

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        // The body must not echo the exception: a DNS/TLS message can carry the configured SaaS
        // host.
        assertThat(String.valueOf(resp.getBody())).doesNotContain("saas.internal");
    }

    @Test
    void connectReauth_onAnUnlinkedServer_maps502() throws Exception {
        when(connectService.startReauth(any())).thenThrow(new IOException("not linked"));

        ResponseEntity<?> resp = controller.connectReauth(null, request());

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    /** Minimal request: the controller only reads Origin and the forwarded/host details from it. */
    private static jakarta.servlet.http.HttpServletRequest request() {
        return new org.springframework.mock.web.MockHttpServletRequest();
    }

    @Test
    void syncNow_triggersSyncWhenMeteringOn() {
        when(syncProvider.getIfAvailable()).thenReturn(syncService);

        ResponseEntity<Void> resp = controller.syncNow();

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(syncService).syncNow();
    }

    @Test
    void syncNow_returns409WhenMeteringOff() {
        when(syncProvider.getIfAvailable()).thenReturn(null); // metering disabled → bean absent

        ResponseEntity<Void> resp = controller.syncNow();

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        verify(syncService, never()).syncNow();
    }
}
