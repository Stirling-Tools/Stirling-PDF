package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.integration.crypto.TestCredentialKey;
import stirling.software.proprietary.policy.microsoft.FakeGraphServer;
import stirling.software.proprietary.security.model.User;

class ConnectedAccountServiceTest {

    private static final String REDIRECT =
            "https://stirling.example/api/v1/connected-accounts/callback/microsoft";

    private FakeGraphServer microsoft;
    private InMemoryConnectedAccounts store;
    private ApplicationProperties properties;
    private ConnectedAccountService service;
    private User pat;

    @BeforeEach
    void setUp() throws Exception {
        TestCredentialKey.install();
        microsoft = new FakeGraphServer();
        properties = new ApplicationProperties();
        ApplicationProperties.Premium.ProFeatures.Microsoft app =
                properties.getPremium().getProFeatures().getMicrosoft();
        app.setEnabled(true);
        app.setClientId("client-1");
        app.setClientSecret("server-secret");
        store = new InMemoryConnectedAccounts();
        service =
                new ConnectedAccountService(
                        store.repository,
                        List.of(new MicrosoftOAuthClient(properties, microsoft.endpoints())));
        pat = new User();
        pat.setId(5L);
    }

    @AfterEach
    void tearDown() {
        microsoft.close();
    }

    @Test
    void connectingStoresTheAccountWithItsRefreshToken() throws Exception {
        ConnectedAccountService.ConnectStart start =
                service.startConnect(pat, CloudProvider.MICROSOFT, REDIRECT);
        Map<String, String> query = query(start.authorizationUrl());

        assertThat(start.authorizationUrl()).startsWith(microsoft.baseUrl() + "/login/common/");
        assertThat(query).containsEntry("client_id", "client-1");
        assertThat(query).containsEntry("code_challenge_method", "S256");
        assertThat(query.get("scope")).contains("offline_access").contains("Files.ReadWrite.All");

        ConnectedAccount account =
                service.completeConnect(
                        CloudProvider.MICROSOFT,
                        query.get("state"),
                        FakeGraphServer.GOOD_CODE,
                        start.nonce());

        assertThat(account.getOwnerUserId()).isEqualTo(5L);
        assertThat(account.getEmail()).isEqualTo("pat@contoso.com");
        assertThat(account.getTenantId()).isEqualTo("tenant-guid");
        assertThat(account.getRefreshToken()).isEqualTo("rt-1");
        assertThat(account.getStatus()).isEqualTo(ConnectedAccount.STATUS_CONNECTED);
        Map<String, String> exchange = microsoft.tokenForms.getLast();
        assertThat(exchange.get("code_verifier")).isNotBlank();
        assertThat(exchange).containsEntry("redirect_uri", REDIRECT);
    }

    @Test
    void aSignInFinishedInAnotherBrowserIsRejected() {
        ConnectedAccountService.ConnectStart start =
                service.startConnect(pat, CloudProvider.MICROSOFT, REDIRECT);
        String state = query(start.authorizationUrl()).get("state");

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        service.completeConnect(
                                CloudProvider.MICROSOFT, state, FakeGraphServer.GOOD_CODE, null));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        service.completeConnect(
                                CloudProvider.MICROSOFT,
                                state,
                                FakeGraphServer.GOOD_CODE,
                                "someone-elses-nonce"));
        assertThat(store.rows).isEmpty();
    }

    @Test
    void aForgedOrMismatchedStateIsRejected() {
        ConnectedAccountService.ConnectStart start =
                service.startConnect(pat, CloudProvider.MICROSOFT, REDIRECT);
        String state = query(start.authorizationUrl()).get("state");
        String tampered =
                state.substring(0, state.length() - 2) + (state.endsWith("A") ? "BB" : "AA");

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        service.completeConnect(
                                CloudProvider.MICROSOFT,
                                tampered,
                                FakeGraphServer.GOOD_CODE,
                                start.nonce()));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        service.completeConnect(
                                CloudProvider.GOOGLE,
                                state,
                                FakeGraphServer.GOOD_CODE,
                                start.nonce()));
    }

    @Test
    void reconnectingUpdatesTheSameAccount() throws Exception {
        connect();
        connect();
        assertThat(store.rows).hasSize(1);
        assertThat(store.rows.values().iterator().next().getRefreshToken()).isEqualTo("rt-2");
    }

    @Test
    void accessTokensAreCachedAndRefreshTokensRotate() throws Exception {
        ConnectedAccount account = connect();
        int requestsAfterConnect = microsoft.tokenRequests.get();

        String first = service.accessToken(account.getId(), List.of());
        assertThat(microsoft.tokenRequests.get()).isEqualTo(requestsAfterConnect);

        String sharePoint =
                service.accessToken(
                        account.getId(), List.of("https://contoso.sharepoint.com/.default"));
        assertThat(sharePoint).isNotEqualTo(first);
        assertThat(microsoft.tokenForms.getLast().get("scope"))
                .isEqualTo("offline_access https://contoso.sharepoint.com/.default");
        assertThat(store.rows.get(account.getId()).getRefreshToken()).isEqualTo("rt-2");
    }

    @Test
    void aRevokedGrantAsksTheUserToReconnect() throws Exception {
        ConnectedAccount account = connect();
        microsoft.revokedRefreshTokens.add("rt-1");

        AccountReconnectRequiredException failure =
                assertThrows(
                        AccountReconnectRequiredException.class,
                        () -> service.accessToken(account.getId(), List.of("Sites.Read.All")));

        assertThat(failure.getMessage()).contains("pat@contoso.com").contains("sign in again");
        ConnectedAccount stored = store.rows.get(account.getId());
        assertThat(stored.getStatus()).isEqualTo(ConnectedAccount.STATUS_NEEDS_RECONNECT);
        assertThat(stored.getLastError()).contains("AADSTS700082").doesNotContain("Trace ID");
        int before = microsoft.tokenRequests.get();
        assertThrows(
                AccountReconnectRequiredException.class,
                () -> service.accessToken(account.getId(), List.of("Sites.Read.All")));
        assertThat(microsoft.tokenRequests.get()).isEqualTo(before);
    }

    @Test
    void connectionsCanBeTurnedOffByTheAdmin() {
        properties.getPremium().getProFeatures().getMicrosoft().setAllowAccountConnections(false);
        assertThat(service.isAvailable(CloudProvider.MICROSOFT)).isFalse();
        assertThrows(
                IllegalStateException.class,
                () -> service.startConnect(pat, CloudProvider.MICROSOFT, REDIRECT));
    }

    @Test
    void onlyTheOwnerCanDisconnect() throws Exception {
        ConnectedAccount account = connect();
        User other = new User();
        other.setId(9L);

        assertThrows(
                IllegalArgumentException.class, () -> service.disconnect(other, account.getId()));
        service.disconnect(pat, account.getId());
        assertThat(store.rows).isEmpty();
    }

    private ConnectedAccount connect() throws Exception {
        ConnectedAccountService.ConnectStart start =
                service.startConnect(pat, CloudProvider.MICROSOFT, REDIRECT);
        return service.completeConnect(
                CloudProvider.MICROSOFT,
                query(start.authorizationUrl()).get("state"),
                FakeGraphServer.GOOD_CODE,
                start.nonce());
    }

    private static Map<String, String> query(String url) {
        Map<String, String> params = new HashMap<>();
        for (String pair : URI.create(url).getRawQuery().split("&")) {
            int eq = pair.indexOf('=');
            params.put(
                    pair.substring(0, eq),
                    URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return params;
    }
}
