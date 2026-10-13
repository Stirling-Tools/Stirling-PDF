package stirling.software.proprietary.mcp.oauth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpHeaders;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Client ID Metadata Document resolution and its SSRF guards. */
class McpClientMetadataFetcherTest {

    private static final String CLIENT_ID = "https://chatgpt.com/oauth/client.json";
    private static final String REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";

    private McpClientMetadataFetcher fetcher;

    @BeforeEach
    void setUp() {
        fetcher = spy(new McpClientMetadataFetcher());
        doReturn(true).when(fetcher).isPublicHost("chatgpt.com");
        doReturn(true).when(fetcher).isPublicHost("cdn.chatgpt.com");
        doReturn(false).when(fetcher).isPublicHost("internal.example");
    }

    @Test
    void recognisesOnlyHttpsClientIdsAsMetadataUrls() {
        assertTrue(McpClientMetadataFetcher.isMetadataClientId(CLIENT_ID));
        assertTrue(McpClientMetadataFetcher.isMetadataClientId("HTTPS://x.example/a"));
        assertFalse(McpClientMetadataFetcher.isMetadataClientId("http://x.example/a"));
        assertFalse(McpClientMetadataFetcher.isMetadataClientId("Zm9vYmFy"));
        assertFalse(McpClientMetadataFetcher.isMetadataClientId(null));
    }

    @Test
    void clientIdUrlShapeIsEnforced() {
        McpClientMetadataFetcher.validateClientIdUrl(CLIENT_ID);
        for (String bad :
                List.of(
                        "http://chatgpt.com/client.json",
                        "https://chatgpt.com",
                        "https://chatgpt.com/",
                        "https://user:pw@chatgpt.com/client.json",
                        "https://chatgpt.com/client.json#frag",
                        "https://chatgpt.com/a/../client.json",
                        "https://chatgpt.com/./client.json")) {
            assertThrows(
                    McpOAuthException.class,
                    () -> McpClientMetadataFetcher.validateClientIdUrl(bad),
                    bad);
        }
    }

    @Test
    void parsesNameAndRedirectUris() {
        McpClientMetadataFetcher.ClientMetadata metadata =
                McpClientMetadataFetcher.parse(CLIENT_ID, json(document(CLIENT_ID, "none")));
        assertEquals("ChatGPT", metadata.clientName());
        assertEquals(List.of(REDIRECT), metadata.redirectUris());
    }

    @Test
    void documentMustNameItself() {
        assertThrows(
                McpOAuthException.class,
                () ->
                        McpClientMetadataFetcher.parse(
                                CLIENT_ID,
                                json(document("https://evil.example/client.json", "none"))));
    }

    @Test
    void documentMustDescribeAPublicClient() {
        assertThrows(
                McpOAuthException.class,
                () ->
                        McpClientMetadataFetcher.parse(
                                CLIENT_ID, json(document(CLIENT_ID, "client_secret_basic"))));
        assertThrows(
                McpOAuthException.class,
                () ->
                        McpClientMetadataFetcher.parse(
                                CLIENT_ID,
                                json(
                                        "{\"client_id\":\""
                                                + CLIENT_ID
                                                + "\",\"client_secret\":\"x\",\"redirect_uris\":[\""
                                                + REDIRECT
                                                + "\"]}")));
    }

    @Test
    void documentNeedsRedirectUrisAndValidJson() {
        assertThrows(
                McpOAuthException.class,
                () ->
                        McpClientMetadataFetcher.parse(
                                CLIENT_ID, json("{\"client_id\":\"" + CLIENT_ID + "\"}")));
        assertThrows(
                McpOAuthException.class,
                () -> McpClientMetadataFetcher.parse(CLIENT_ID, json("not json")));
        assertThrows(
                McpOAuthException.class,
                () -> McpClientMetadataFetcher.parse(CLIENT_ID, json("[1,2]")));
    }

    @Test
    void oversizedDocumentIsRefused() {
        byte[] big = new byte[McpClientMetadataFetcher.MAX_BYTES + 10];
        assertThrows(
                McpOAuthException.class,
                () -> McpClientMetadataFetcher.readCapped(new ByteArrayInputStream(big)));
    }

    @Test
    void privateHostIsRefusedBeforeAnyRequest() {
        assertThrows(
                McpOAuthException.class,
                () -> fetcher.fetch("https://internal.example/client.json"));
        verify(fetcher, never()).send(any());
    }

    @Test
    void fetchesAndCachesTheDocument() {
        HttpResponse<InputStream> ok = response(200, document(CLIENT_ID, "none"), null);
        doReturn(ok).when(fetcher).send(URI.create(CLIENT_ID));

        assertEquals("ChatGPT", fetcher.fetch(CLIENT_ID).clientName());
        assertEquals("ChatGPT", fetcher.fetch(CLIENT_ID).clientName());

        verify(fetcher, times(1)).send(any());
    }

    @Test
    void redirectsAreFollowedOnlyToPublicHttpsHosts() {
        HttpResponse<InputStream> toCdn =
                response(302, "", "https://cdn.chatgpt.com/oauth/client.json");
        HttpResponse<InputStream> ok = response(200, document(CLIENT_ID, "none"), null);
        doReturn(toCdn).when(fetcher).send(URI.create(CLIENT_ID));
        doReturn(ok).when(fetcher).send(URI.create("https://cdn.chatgpt.com/oauth/client.json"));
        assertEquals(List.of(REDIRECT), fetcher.fetch(CLIENT_ID).redirectUris());

        McpClientMetadataFetcher other = spy(new McpClientMetadataFetcher());
        doReturn(true).when(other).isPublicHost("chatgpt.com");
        doReturn(false).when(other).isPublicHost("internal.example");
        HttpResponse<InputStream> toPrivate =
                response(302, "", "https://internal.example/client.json");
        doReturn(toPrivate).when(other).send(URI.create(CLIENT_ID));
        assertThrows(McpOAuthException.class, () -> other.fetch(CLIENT_ID));
        verify(other, never()).send(URI.create("https://internal.example/client.json"));

        McpClientMetadataFetcher plain = spy(new McpClientMetadataFetcher());
        doReturn(true).when(plain).isPublicHost("chatgpt.com");
        HttpResponse<InputStream> toHttp = response(302, "", "http://chatgpt.com/client.json");
        doReturn(toHttp).when(plain).send(URI.create(CLIENT_ID));
        assertThrows(McpOAuthException.class, () -> plain.fetch(CLIENT_ID));
    }

    @Test
    void nonSuccessStatusIsAnInvalidClient() {
        HttpResponse<InputStream> missing = response(404, "", null);
        doReturn(missing).when(fetcher).send(URI.create(CLIENT_ID));
        McpOAuthException e = assertThrows(McpOAuthException.class, () -> fetcher.fetch(CLIENT_ID));
        assertEquals("invalid_client", e.getError());
    }

    private static String document(String clientId, String authMethod) {
        return "{\"client_id\":\""
                + clientId
                + "\",\"client_name\":\"ChatGPT\",\"redirect_uris\":[\""
                + REDIRECT
                + "\"],\"token_endpoint_auth_method\":\""
                + authMethod
                + "\"}";
    }

    private static byte[] json(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse<InputStream> response(int status, String body, String location) {
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(new ByteArrayInputStream(json(body)));
        Map<String, List<String>> headers =
                location == null ? Map.of() : Map.of("Location", List.of(location));
        when(response.headers()).thenReturn(HttpHeaders.of(headers, (a, b) -> true));
        return response;
    }
}
