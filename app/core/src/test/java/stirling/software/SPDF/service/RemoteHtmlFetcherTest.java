package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.SPDF.service.RemoteHtmlFetcher.RemoteHtml;
import stirling.software.common.util.GeneralUtils;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

class RemoteHtmlFetcherTest {

    private MockWebServer server;

    @BeforeEach
    void setUp() throws IOException {
        server = new MockWebServer();
        server.start(InetAddress.getLoopbackAddress(), 0);
    }

    @AfterEach
    void tearDown() throws IOException {
        server.shutdown();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "file:///etc/passwd",
                "ftp://example.com/",
                "gopher://example.com/",
                "jar:file:/tmp/a.jar!/",
                "mailto:someone@example.com",
                "http:///no-host"
            })
    void rejects_non_http_urls_before_resolving(String url) {
        RemoteHtmlFetcher fetcher =
                new RemoteHtmlFetcher(
                        address -> false,
                        host -> {
                            throw new AssertionError("resolved " + host);
                        },
                        1024);

        assertThrows(IOException.class, () -> fetcher.fetch(url));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "127.0.0.1",
                "[::1]",
                "0.0.0.0",
                "10.0.0.5",
                "172.16.3.4",
                "192.168.1.1",
                "100.64.0.1",
                "169.254.169.254",
                "224.0.0.1",
                "[fe80::1]",
                "[fd00:ec2::254]",
                "[::ffff:127.0.0.1]",
                "[::ffff:169.254.169.254]"
            })
    void default_policy_rejects_sensitive_addresses(String host) {
        RemoteHtmlFetcher fetcher = new RemoteHtmlFetcher();

        assertThrows(
                UnknownHostException.class,
                () -> fetcher.requireAllowedUri(URI.create("http://" + host + "/")));
    }

    @Test
    void default_policy_allows_public_addresses() throws IOException {
        RemoteHtmlFetcher fetcher = new RemoteHtmlFetcher();

        fetcher.requireAllowedUri(URI.create("https://93.184.215.14/"));
        fetcher.requireAllowedUri(URI.create("https://[2606:4700:4700::1111]/"));
    }

    @Test
    void default_policy_never_contacts_a_loopback_server() {
        RemoteHtmlFetcher fetcher = new RemoteHtmlFetcher();
        server.enqueue(new MockResponse().setBody("<html>secret</html>"));

        assertThrows(IOException.class, () -> fetcher.fetch(server.url("/").toString()));
        assertEquals(0, server.getRequestCount());
    }

    @Test
    void rejects_host_when_any_resolved_address_is_sensitive() throws Exception {
        InetAddress publicAddress = InetAddress.getByName("93.184.215.14");
        RemoteHtmlFetcher fetcher =
                new RemoteHtmlFetcher(
                        GeneralUtils::isSensitiveAddress,
                        host -> new InetAddress[] {publicAddress, InetAddress.getLoopbackAddress()},
                        1024);

        assertThrows(IOException.class, () -> fetcher.fetch("http://rebind.test/"));
    }

    @Test
    void connects_to_the_validated_address_not_a_fresh_lookup() throws Exception {
        server.enqueue(new MockResponse().setBody("<html>ok</html>"));
        RemoteHtmlFetcher fetcher = fetcherResolving(Map.of("pinned.test", loopback()));

        RemoteHtml html = fetcher.fetch("http://pinned.test:" + server.getPort() + "/page");

        assertEquals("<html>ok</html>", html.content());
        assertEquals("http://pinned.test:" + server.getPort() + "/page", html.url());
        RecordedRequest request = server.takeRequest();
        assertEquals("pinned.test:" + server.getPort(), request.getHeader("Host"));
    }

    @Test
    void follows_redirects_and_returns_the_final_url() throws Exception {
        server.enqueue(new MockResponse().setResponseCode(302).addHeader("Location", "/final"));
        server.enqueue(new MockResponse().setBody("<html>final</html>"));
        RemoteHtmlFetcher fetcher = fetcherResolving(Map.of("site.test", loopback()));

        RemoteHtml html = fetcher.fetch("http://site.test:" + server.getPort() + "/start");

        assertEquals("<html>final</html>", html.content());
        assertEquals("http://site.test:" + server.getPort() + "/final", html.url());
        assertEquals(2, server.getRequestCount());
    }

    @Test
    void rejects_redirect_to_a_sensitive_address_without_following_it() throws Exception {
        server.enqueue(
                new MockResponse()
                        .setResponseCode(302)
                        .addHeader("Location", "http://metadata.test/latest/meta-data/"));
        RemoteHtmlFetcher fetcher =
                fetcherResolving(
                        Map.of(
                                "site.test",
                                loopback(),
                                "metadata.test",
                                InetAddress.getByName("169.254.169.254")));

        assertThrows(
                IOException.class,
                () -> fetcher.fetch("http://site.test:" + server.getPort() + "/"));
        assertEquals(1, server.getRequestCount());
    }

    @Test
    void rejects_redirect_to_a_non_http_scheme() {
        server.enqueue(
                new MockResponse()
                        .setResponseCode(301)
                        .addHeader("Location", "file:///etc/passwd"));
        RemoteHtmlFetcher fetcher = fetcherResolving(Map.of("site.test", loopback()));

        assertThrows(
                IOException.class,
                () -> fetcher.fetch("http://site.test:" + server.getPort() + "/"));
        assertEquals(1, server.getRequestCount());
    }

    @Test
    void stops_after_the_redirect_limit() {
        for (int i = 0; i <= RemoteHtmlFetcher.MAX_REDIRECTS + 1; i++) {
            server.enqueue(new MockResponse().setResponseCode(302).addHeader("Location", "/"));
        }
        RemoteHtmlFetcher fetcher = fetcherResolving(Map.of("site.test", loopback()));

        IOException error =
                assertThrows(
                        IOException.class,
                        () -> fetcher.fetch("http://site.test:" + server.getPort() + "/"));
        assertTrue(error.getMessage().contains("redirect limit"));
        assertEquals(RemoteHtmlFetcher.MAX_REDIRECTS + 1, server.getRequestCount());
    }

    @Test
    void rejects_a_declared_content_length_over_the_limit() {
        server.enqueue(new MockResponse().setBody("x".repeat(2048)));
        RemoteHtmlFetcher fetcher = fetcherResolving(Map.of("site.test", loopback()));

        IOException error =
                assertThrows(
                        IOException.class,
                        () -> fetcher.fetch("http://site.test:" + server.getPort() + "/"));
        assertTrue(error.getMessage().contains("size limit"));
    }

    @Test
    void rejects_a_chunked_body_over_the_limit() {
        server.enqueue(new MockResponse().setChunkedBody("x".repeat(4096), 256));
        RemoteHtmlFetcher fetcher = fetcherResolving(Map.of("site.test", loopback()));

        IOException error =
                assertThrows(
                        IOException.class,
                        () -> fetcher.fetch("http://site.test:" + server.getPort() + "/"));
        assertTrue(error.getMessage().contains("size limit"));
    }

    @Test
    void rejects_non_success_status() {
        server.enqueue(new MockResponse().setResponseCode(500).setBody("boom"));
        RemoteHtmlFetcher fetcher = fetcherResolving(Map.of("site.test", loopback()));

        assertThrows(
                IOException.class,
                () -> fetcher.fetch("http://site.test:" + server.getPort() + "/"));
    }

    private static InetAddress loopback() {
        return InetAddress.getLoopbackAddress();
    }

    private static RemoteHtmlFetcher fetcherResolving(Map<String, InetAddress> hosts) {
        return new RemoteHtmlFetcher(
                address -> !address.isLoopbackAddress() && GeneralUtils.isSensitiveAddress(address),
                host -> {
                    InetAddress address = hosts.get(host);
                    if (address == null) {
                        throw new UnknownHostException(host);
                    }
                    return new InetAddress[] {address};
                },
                1024);
    }
}
