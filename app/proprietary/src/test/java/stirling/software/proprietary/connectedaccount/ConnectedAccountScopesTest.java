package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.util.Arrays;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.google.GoogleEndpoints;
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

    @Test
    void googleTokensForTheBrowserAreReadOnly() {
        assertThat(controller.scopesFor(CloudProvider.GOOGLE, "drive"))
                .containsExactly("https://www.googleapis.com/auth/drive.readonly");
    }

    private static ApplicationProperties.Premium.ProFeatures.GoogleDrive drive(
            String accountScope) {
        ApplicationProperties.Premium.ProFeatures.GoogleDrive app =
                new ApplicationProperties.Premium.ProFeatures.GoogleDrive();
        app.setAccountScope(accountScope);
        return app;
    }

    @ParameterizedTest
    @CsvSource({
        "drive, drive.readonly",
        "drive.readonly, drive.readonly",
        "drive.file, drive.file"
    })
    void googleBrowserScopeNeverAllowsWrites(String configured, String expected) {
        assertThat(GoogleOAuthClient.browserScope(drive(configured)))
                .isEqualTo("https://www.googleapis.com/auth/" + expected);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"bogus", "drive.full"})
    void googleBrowserScopeRefusesAnUnknownAccountScope(String configured) {
        assertThatThrownBy(() -> GoogleOAuthClient.browserScope(drive(configured)))
                .isInstanceOf(IllegalStateException.class);
    }

    @ParameterizedTest
    @CsvSource({
        "drive, drive drive.readonly",
        "drive.readonly, drive.readonly",
        "drive.file, drive.file"
    })
    void googleConsentIncludesTheBrowserScope(String configured, String expected) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPremium().getProFeatures().getGoogleDrive().setAccountScope(configured);
        GoogleOAuthClient client = new GoogleOAuthClient(properties, mock(GoogleEndpoints.class));

        String driveScopes =
                Arrays.stream(expected.split(" "))
                        .map(scope -> "https://www.googleapis.com/auth/" + scope)
                        .collect(Collectors.joining(" "));
        assertThat(client.consentScopes()).isEqualTo("openid email profile " + driveScopes);
    }

    @Test
    void googleRefusesOtherResources() {
        assertThatThrownBy(() -> controller.scopesFor(CloudProvider.GOOGLE, "gmail"))
                .isInstanceOf(ResponseStatusException.class);
    }
}
