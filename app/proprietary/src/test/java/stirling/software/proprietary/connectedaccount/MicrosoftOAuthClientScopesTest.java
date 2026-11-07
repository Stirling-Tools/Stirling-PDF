package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.microsoft.GraphEndpoints;

class MicrosoftOAuthClientScopesTest {

    private static MicrosoftOAuthClient client(boolean rightsManagement) {
        ApplicationProperties properties = new ApplicationProperties();
        properties
                .getPremium()
                .getProFeatures()
                .getMicrosoft()
                .getRightsManagement()
                .setEnabled(rightsManagement);
        return new MicrosoftOAuthClient(
                properties,
                new GraphEndpoints(
                        "https://graph.microsoft.com/v1.0", "https://login.microsoftonline.com"));
    }

    @Test
    void asksForTheResourcesTheInformationProtectionSdkRequestsWhenEnabled() {
        assertThat(client(true).authorizeScopes())
                .contains("https://aadrm.com/user_impersonation")
                .contains("https://syncservice.o365syncservice.com/UnifiedPolicy.User.Read");
    }

    @Test
    void leavesSignInUnchangedWhenDisabled() {
        assertThat(client(false).authorizeScopes())
                .doesNotContain("aadrm.com")
                .doesNotContain("o365syncservice.com");
    }
}
