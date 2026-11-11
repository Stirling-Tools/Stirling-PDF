package stirling.software.proprietary.connectedaccount;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.google.GoogleEndpoints;

class GoogleOAuthClientTest {

    private static GoogleOAuthClient client(String accountScope) {
        ApplicationProperties properties = new ApplicationProperties();
        ApplicationProperties.Premium.ProFeatures.GoogleDrive app =
                properties.getPremium().getProFeatures().getGoogleDrive();
        app.setEnabled(true);
        app.setClientId("google-client");
        app.setClientSecret("google-secret");
        app.setAccountScope(accountScope);
        return new GoogleOAuthClient(properties, mock(GoogleEndpoints.class));
    }

    @Test
    void requestsTheConfiguredScope() {
        GoogleOAuthClient client = client(" drive.file ");

        assertTrue(client.available());
        assertEquals("https://www.googleapis.com/auth/drive.file", client.driveScope());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"drive.full", "https://www.googleapis.com/auth/drive"})
    void anUnknownScopeTurnsConnectionsOffInsteadOfAskingForAllOfDrive(String accountScope) {
        GoogleOAuthClient client = client(accountScope);

        assertFalse(client.available());
        assertThrows(IllegalStateException.class, client::driveScope);
    }
}
