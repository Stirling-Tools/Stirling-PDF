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

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import tools.jackson.databind.ObjectMapper;

/**
 * Stubs the {@link HttpClient} so the SaaS endpoint is never actually called. Confirms register
 * relays the JWT and parses the credential, and that entitlement parsing + the fail-open (null on
 * unreachable) behaviour hold.
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

    @Test
    @SuppressWarnings("unchecked")
    void registerRelaysJwtAndParsesCredential() throws Exception {
        // Build the stub response first: nesting response() inside when() trips Mockito's
        // unfinished-stubbing check (inner when() runs mid outer when()).
        HttpResponse<String> resp =
                response(201, "{\"deviceId\":\"dev-1\",\"deviceSecret\":\"sec-1\",\"teamId\":42}");
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        when(httpClient.send(captor.capture(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(resp);

        AccountLinkClient.RegisterResult result = client.register("jwt-token", "My Server");

        assertEquals("dev-1", result.deviceId());
        assertEquals("sec-1", result.deviceSecret());
        assertEquals(42L, result.teamId());

        HttpRequest sent = captor.getValue();
        assertEquals("Bearer jwt-token", sent.headers().firstValue("Authorization").orElse(null));
        assertEquals(
                "https://saas.example.com/api/v1/account-link/register", sent.uri().toString());
    }

    @Test
    @SuppressWarnings("unchecked")
    void registerThrowsUpstreamExceptionWithStatusOnNon2xx() throws Exception {
        HttpResponse<String> resp = response(401, "{\"error\":\"unauthorized\"}");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(resp);
        AccountLinkClient.UpstreamException ex =
                assertThrows(
                        AccountLinkClient.UpstreamException.class,
                        () -> client.register("jwt", null));
        assertEquals(401, ex.status());
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
}
