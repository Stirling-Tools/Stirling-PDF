package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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

    @ParameterizedTest
    @ValueSource(strings = {"graph", "https://graph.microsoft.com"})
    void graphTokensForTheBrowserAreReadOnly(String resource) {
        assertThat(controller.scopesFor(CloudProvider.MICROSOFT, resource))
                .containsExactly(MicrosoftOAuthClient.BROWSER_SCOPE);
    }

    @Test
    void sharePointTokensAreScopedToThatHost() {
        assertThat(
                        controller.scopesFor(
                                CloudProvider.MICROSOFT, "https://contoso-my.sharepoint.com"))
                .containsExactly("https://contoso-my.sharepoint.com/.default");
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://evil.example", "https://contoso.sharepoint.com.evil.test"})
    void otherHostsAreRefused(String resource) {
        assertThatThrownBy(() -> controller.scopesFor(CloudProvider.MICROSOFT, resource))
                .isInstanceOf(ResponseStatusException.class);
    }
}
