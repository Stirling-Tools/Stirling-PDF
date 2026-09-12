package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.ConnectException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import tools.jackson.databind.ObjectMapper;

/**
 * Stubs the {@link HttpClient} so the SaaS endpoint is never actually called. Confirms the connect
 * handshake refuses an authorize URL it would not navigate to and carries no user token, and that
 * entitlement parsing + the fail-open (null on unreachable) behaviour hold.
 */
class AccountLinkClientTest {

    private AccountLinkProperties properties;
    private HttpClient httpClient;
    private AccountLinkClient client;

    @BeforeEach
    void setUp() {
        properties = new AccountLinkProperties();
        properties.setEnabled(true);
        properties.setSaasBaseUrl("https://saas.example.com");
        httpClient = mock(HttpClient.class);
        client = new AccountLinkClient(properties, new ObjectMapper(), httpClient);
    }

    @SuppressWarnings("unchecked")
    private HttpResponse<String> response(int status, String body) {
        HttpResponse<String> resp = mock(HttpResponse.class);
        when(resp.statusCode()).thenReturn(status);
        when(resp.body()).thenReturn(body);
        return resp;
    }

    // register() is gone with the JWT relay, and with it the two tests that asserted this client
    // sends an Authorization: Bearer header. Nothing here carries a user token any more.

    @Test
    @SuppressWarnings("unchecked")
    void connectRequestRefusesAnAuthorizeUrlItWouldNotNavigateTo() throws Exception {
        // The reply drives a browser navigation, so a non-absolute or non-http(s) value must fail
        // loudly here rather than reach the admin.
        HttpResponse<String> resp =
                response(201, "{\"requestId\":\"req-1\",\"authorizeUrl\":\"/link?request=req-1\"}");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(resp);

        assertThrows(
                java.io.IOException.class,
                () -> client.connectRequest("n", "https://pdf.example.com/cb", "nonce", "secret"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void connectRequestParsesTheAuthorizeUrlItIsGiven() throws Exception {
        HttpResponse<String> resp =
                response(
                        201,
                        "{\"requestId\":\"req-1\",\"expiresIn\":900,"
                            + "\"authorizeUrl\":\"https://app.example.com/link?request=req-1\"}");
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        when(httpClient.send(captor.capture(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(resp);

        AccountLinkClient.ConnectRequestResult result =
                client.connectRequest("n", "https://pdf.example.com/cb", "nonce", "secret");

        assertEquals("req-1", result.requestId());
        assertEquals("https://app.example.com/link?request=req-1", result.authorizeUrl());
        // No user token on this call, by design.
        assertEquals(null, captor.getValue().headers().firstValue("Authorization").orElse(null));
    }

    @Test
    @SuppressWarnings("unchecked")
    void connectClaimGrantsTheCredentialOnSuccess() throws Exception {
        HttpResponse<String> resp =
                response(200, "{\"deviceId\":\"dev-1\",\"deviceSecret\":\"sec-1\",\"teamId\":7}");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(resp);

        AccountLinkClient.ConnectClaimResult result = client.connectClaim("req-1", "secret");

        assertEquals(AccountLinkClient.ConnectClaimOutcome.GRANTED, result.outcome());
        assertEquals("dev-1", result.deviceId());
        assertEquals("sec-1", result.deviceSecret());
    }

    @Test
    @SuppressWarnings("unchecked")
    void connectClaimMapsTheStatusItIsGiven() throws Exception {
        // The whole point of these four: a claim consumes the request server-side, so
        // reading 200 as anything but success loses the credential irrecoverably.
        assertEquals(AccountLinkClient.ConnectClaimOutcome.PENDING, claimOutcome(202, "{}"));
        assertEquals(AccountLinkClient.ConnectClaimOutcome.UNAVAILABLE, claimOutcome(503, "{}"));
        assertEquals(AccountLinkClient.ConnectClaimOutcome.REJECTED, claimOutcome(400, "{}"));
        assertEquals(
                AccountLinkClient.ConnectClaimOutcome.CONFIRMED,
                claimOutcome(200, "{\"status\":\"confirmed\",\"teamId\":7}"));
    }

    @SuppressWarnings("unchecked")
    private AccountLinkClient.ConnectClaimOutcome claimOutcome(int status, String body)
            throws Exception {
        // Built before the when(), not inside it: response() stubs a mock of its own, and
        // Mockito cannot have that happen mid-stubbing.
        HttpResponse<String> resp = response(status, body);
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(resp);
        return client.connectClaim("req-1", "secret").outcome();
    }

    @Test
    @SuppressWarnings("unchecked")
    void fetchEntitlementParsesSnapshotAndSendsDeviceHeaders() throws Exception {
        HttpResponse<String> resp =
                response(
                        200,
                        "{\"subscribed\":true,\"freeRemainingUnits\":0,\"periodSpendUnits\":10,\"periodCapUnits\":100,\"state\":\"OK\"}");
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        when(httpClient.send(captor.capture(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(resp);

        InstanceEntitlement e = client.fetchEntitlement("dev-1", "sec-1");

        assertNotNull(e);
        assertEquals(true, e.subscribed());
        assertEquals(10, e.periodSpendUnits());
        assertEquals(100L, e.periodCapUnits());
        assertEquals(EntitlementState.OK, e.state());

        HttpRequest sent = captor.getValue();
        assertEquals("dev-1", sent.headers().firstValue("X-Device-Id").orElse(null));
        assertEquals("sec-1", sent.headers().firstValue("X-Device-Secret").orElse(null));
    }

    @Test
    @SuppressWarnings("unchecked")
    void fetchEntitlementMapsOverLimitState() throws Exception {
        // Pins the consume side of the wire contract: InstanceController emits "OVER_LIMIT" (for a
        // DEGRADED team) and the client must map it to the gate-blocking state.
        HttpResponse<String> resp =
                response(
                        200,
                        "{\"subscribed\":true,\"freeRemainingUnits\":0,\"periodSpendUnits\":1300,\"periodCapUnits\":1250,\"state\":\"OVER_LIMIT\"}");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(resp);

        InstanceEntitlement e = client.fetchEntitlement("dev-1", "sec-1");

        assertNotNull(e);
        assertEquals(EntitlementState.OVER_LIMIT, e.state());
    }

    @Test
    @SuppressWarnings("unchecked")
    void fetchEntitlementReturnsNullWhenUnreachable() throws Exception {
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new ConnectException("refused"));
        // Null = unknown → the cache/gate fail open.
        assertNull(client.fetchEntitlement("dev-1", "sec-1"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void fetchEntitlementReturnsNullOnServerError() throws Exception {
        // 5xx is a transient/server failure, not a credential deny → null, the cache fails open.
        HttpResponse<String> resp = response(503, "{}");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(resp);
        assertNull(client.fetchEntitlement("dev-1", "sec-1"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void fetchEntitlementThrowsRevokedOnDeny() throws Exception {
        // 401/403 = authoritative deny (revoked/invalid credential) → RevokedException, NOT null:
        // the cache must block billable work rather than fail open on a stale snapshot.
        for (int status : new int[] {401, 403}) {
            HttpResponse<String> resp = response(status, "{}");
            when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(resp);
            AccountLinkClient.RevokedException ex =
                    assertThrows(
                            AccountLinkClient.RevokedException.class,
                            () -> client.fetchEntitlement("dev-1", "sec-1"));
            assertEquals(status, ex.status());
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void revokeSelfSendsDeviceHeadersAndReturnsTrueOn2xx() throws Exception {
        HttpResponse<String> resp = response(204, "");
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        when(httpClient.send(captor.capture(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(resp);

        assertEquals(true, client.revokeSelf("dev-1", "sec-1"));

        HttpRequest sent = captor.getValue();
        assertEquals("https://saas.example.com/api/v1/instance/revoke-self", sent.uri().toString());
        assertEquals("dev-1", sent.headers().firstValue("X-Device-Id").orElse(null));
        assertEquals("sec-1", sent.headers().firstValue("X-Device-Secret").orElse(null));
        assertEquals("POST", sent.method());
    }

    @Test
    @SuppressWarnings("unchecked")
    void revokeSelfReturnsFalseOnErrorStatus() throws Exception {
        HttpResponse<String> resp = response(403, "{}");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(resp);
        assertEquals(false, client.revokeSelf("dev-1", "sec-1"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void revokeSelfReturnsFalseWhenUnreachable() throws Exception {
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new ConnectException("refused"));
        assertEquals(false, client.revokeSelf("dev-1", "sec-1"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void reportUsagePostsToSyncWithDeviceHeadersAndParsesFreshEntitlement() throws Exception {
        HttpResponse<String> resp =
                response(
                        200,
                        "{\"subscribed\":true,\"freeRemainingUnits\":0,\"periodSpendUnits\":42,\"periodCapUnits\":100,\"state\":\"OK\"}");
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        when(httpClient.send(captor.capture(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(resp);

        InstanceEntitlement e =
                client.reportUsage(
                        "dev-1", "sec-1", 7L, LocalDateTime.of(2026, 6, 1, 0, 0), 12, 4, 8);

        assertNotNull(e);
        assertEquals(42, e.periodSpendUnits());
        assertEquals(EntitlementState.OK, e.state());

        HttpRequest sent = captor.getValue();
        assertEquals("https://saas.example.com/api/v1/instance/sync", sent.uri().toString());
        assertEquals("POST", sent.method());
        assertEquals("dev-1", sent.headers().firstValue("X-Device-Id").orElse(null));
        assertEquals("sec-1", sent.headers().firstValue("X-Device-Secret").orElse(null));
    }

    @Test
    @SuppressWarnings("unchecked")
    void reportUsageThrowsRevokedOnDeny() throws Exception {
        for (int status : new int[] {401, 403}) {
            HttpResponse<String> resp = response(status, "{}");
            when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(resp);
            AccountLinkClient.RevokedException ex =
                    assertThrows(
                            AccountLinkClient.RevokedException.class,
                            () ->
                                    client.reportUsage(
                                            "dev-1",
                                            "sec-1",
                                            1L,
                                            LocalDateTime.of(2026, 6, 1, 0, 0),
                                            1,
                                            0,
                                            0));
            assertEquals(status, ex.status());
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void reportUsageReturnsNullWhenUnreachable() throws Exception {
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new ConnectException("refused"));
        // Null = don't advance synced markers; the usage retries on the next sync.
        assertNull(
                client.reportUsage(
                        "dev-1", "sec-1", 1L, LocalDateTime.of(2026, 6, 1, 0, 0), 1, 0, 0));
    }

    @Test
    @SuppressWarnings("unchecked")
    void reportUsageReturnsNullOnServerError() throws Exception {
        HttpResponse<String> resp = response(503, "{}");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(resp);
        assertNull(
                client.reportUsage(
                        "dev-1", "sec-1", 1L, LocalDateTime.of(2026, 6, 1, 0, 0), 1, 0, 0));
    }
}
