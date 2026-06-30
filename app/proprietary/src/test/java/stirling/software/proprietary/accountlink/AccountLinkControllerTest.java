package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.proprietary.accountlink.AccountLinkController.LinkRequest;

/**
 * The local (self-hosted) account-link controller's error mapping: an upstream auth rejection
 * surfaces as 401/403 (so the portal can prompt a re-sign-in) while other upstream / transport
 * faults are a 502.
 */
class AccountLinkControllerTest {

    private AccountLinkService service;
    private AccountLinkController controller;

    @BeforeEach
    void setUp() {
        service = mock(AccountLinkService.class);
        controller = new AccountLinkController(service);
    }

    @Test
    void link_missingJwt_returns400() {
        ResponseEntity<?> resp = controller.link(new LinkRequest("  ", null));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void link_upstreamUnauthorized_maps401() throws Exception {
        when(service.link("jwt", null))
                .thenThrow(new AccountLinkClient.UpstreamException(401, "bad token"));
        ResponseEntity<?> resp = controller.link(new LinkRequest("jwt", null));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void link_upstreamForbidden_maps403() throws Exception {
        when(service.link("jwt", null))
                .thenThrow(new AccountLinkClient.UpstreamException(403, "forbidden"));
        ResponseEntity<?> resp = controller.link(new LinkRequest("jwt", null));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void link_upstreamServerError_maps502() throws Exception {
        when(service.link("jwt", null))
                .thenThrow(new AccountLinkClient.UpstreamException(500, "boom"));
        ResponseEntity<?> resp = controller.link(new LinkRequest("jwt", null));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    @Test
    void link_transportFailure_maps502() throws Exception {
        when(service.link("jwt", null)).thenThrow(new IOException("connection refused"));
        ResponseEntity<?> resp = controller.link(new LinkRequest("jwt", null));
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }
}
