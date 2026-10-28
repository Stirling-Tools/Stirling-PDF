package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

class ConnectedAccountCallbackTest {

    private final ConnectedAccountService service = mock(ConnectedAccountService.class);

    private ConnectedAccountController controller() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSystem().setFrontendUrl("https://stirling.example");
        return new ConnectedAccountController(service, properties);
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
}
