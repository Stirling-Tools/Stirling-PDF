package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.microsoft.GraphEndpoints;
import stirling.software.proprietary.security.model.User;

class ConnectedAccountCallbackTest {

    private final ConnectedAccountService service = mock(ConnectedAccountService.class);

    private ConnectedAccountController controller() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSystem().setFrontendUrl("https://stirling.example");
        return new ConnectedAccountController(
                service,
                properties,
                new GraphEndpoints(
                        GraphEndpoints.DEFAULT_GRAPH_URL, GraphEndpoints.DEFAULT_LOGIN_URL));
    }

    @Test
    void neverEchoesTheProviderErrorText() {
        String page =
                controller()
                        .callback(
                                "microsoft",
                                null,
                                null,
                                "server_error",
                                "Visit evil.example to fix your account",
                                null)
                        .getBody();

        assertThat(page).doesNotContain("evil.example").doesNotContain("server_error");
        assertThat(page).contains("The provider refused the sign-in.");
    }

    @Test
    void neverEchoesAnUnknownProviderSegment() {
        String page = controller().callback("evilprovider", "c", "s", null, null, null).getBody();

        assertThat(page).doesNotContain("evilprovider");
        assertThat(page).contains("The account could not be connected.");
    }

    @Test
    void hidesTheExceptionDetailWhenConnectingFails() throws Exception {
        when(service.completeConnect(any(), anyString(), anyString(), any()))
                .thenThrow(new IOException("token endpoint said secret-detail"));

        String page =
                controller().callback("microsoft", "code", "state", null, null, "n").getBody();

        assertThat(page).doesNotContain("secret-detail");
        assertThat(page).contains("The account could not be connected.");
    }

    @Test
    void redirectUrisUseTheConfiguredFrontendUrl() {
        assertThat(controller().redirectUris(new User()))
                .containsEntry(
                        "microsoft",
                        "https://stirling.example/api/v1/connected-accounts/callback/microsoft")
                .containsEntry(
                        "google",
                        "https://stirling.example/api/v1/connected-accounts/callback/google");
    }

    @Test
    void explainsWhichProviderIsNotSetUp() {
        ResponseStatusException failure =
                assertThrows(
                        ResponseStatusException.class,
                        () -> controller().connect("google", new User()));

        assertThat(failure.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(failure.getReason())
                .isEqualTo("Google account connections are not set up on this server.");
    }
}
