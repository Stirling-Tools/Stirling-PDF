package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.microsoft.GraphEndpoints;

class ConnectedAccountScopesTest {

    private final ConnectedAccountController controller =
            new ConnectedAccountController(
                    mock(ConnectedAccountService.class),
                    new ApplicationProperties(),
                    new GraphEndpoints(
                            GraphEndpoints.DEFAULT_GRAPH_URL, GraphEndpoints.DEFAULT_LOGIN_URL));

    @Test
    void graphTokensForTheBrowserAreReadOnly() {
        assertThat(controller.scopesFor(CloudProvider.MICROSOFT, "graph"))
                .containsExactly(MicrosoftOAuthClient.BROWSER_SCOPE);
        assertThat(controller.scopesFor(CloudProvider.MICROSOFT, "https://graph.microsoft.com"))
                .containsExactly(MicrosoftOAuthClient.BROWSER_SCOPE);
    }

    @Test
    void sharePointTokensAreScopedToThatHost() {
        assertThat(
                        controller.scopesFor(
                                CloudProvider.MICROSOFT, "https://contoso-my.sharepoint.com"))
                .isEqualTo(List.of("https://contoso-my.sharepoint.com/.default"));
    }

    @Test
    void otherHostsAreRefused() {
        assertThrows(
                ResponseStatusException.class,
                () -> controller.scopesFor(CloudProvider.MICROSOFT, "https://evil.example"));
        assertThrows(
                ResponseStatusException.class,
                () ->
                        controller.scopesFor(
                                CloudProvider.MICROSOFT,
                                "https://contoso.sharepoint.com.evil.test"));
    }
}
