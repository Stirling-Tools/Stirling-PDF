package stirling.software.saas.ai.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.Part;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.service.UserService;

/**
 * Unit tests for {@link AiProxyService}.
 *
 * <p>The service forwards HTTP requests to an AI backend. It constructs its own {@link HttpClient}
 * internally (no constructor injection), so each test swaps in a mocked client via {@link
 * ReflectionTestUtils} and captures the outgoing {@link HttpRequest} to assert on URL, method and
 * headers. All collaborators ({@link HttpServletRequest}, {@link UserService}, {@link
 * UserRepository}) are mocked; no Spring context, DB or real network is involved.
 *
 * <p>Header semantics under test: Authorization is forwarded when present/non-blank; X-API-KEY is
 * taken from the request header first and otherwise resolved from the authenticated user; Accept is
 * overridden to {@code text/event-stream} when SSE is requested; the target URL is assembled from
 * the configured base URL, the path and the query string.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiProxyServiceTest {

    private static final String BASE_URL = "http://ai-backend:5001";

    @Mock private UserRepository userRepository;
    @Mock private UserService userService;
    @Mock private HttpServletRequest request;
    @Mock private HttpClient httpClient;

    @SuppressWarnings("unchecked")
    private final HttpResponse<InputStream> response =
            (HttpResponse<InputStream>) org.mockito.Mockito.mock(HttpResponse.class);

    private AiProxyService service;

    @BeforeEach
    void setUp() throws Exception {
        service = new AiProxyService(BASE_URL, userRepository, userService);
        // Swap the internally-built client for our mock so no real network call happens.
        ReflectionTestUtils.setField(service, "httpClient", httpClient);
        // Default: the mocked client returns our stub response for any send().
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(response);
    }

    /** Capture the single HttpRequest the service hands to the client. */
    private HttpRequest captureSentRequest() throws Exception {
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any(HttpResponse.BodyHandler.class));
        return captor.getValue();
    }

    private static String header(HttpRequest req, String name) {
        return req.headers().firstValue(name).orElse(null);
    }

    @Nested
    @DisplayName("target URL assembly")
    class UrlAssembly {

        @Test
        @DisplayName("joins base + leading-slash path + query string")
        void joinsBasePathAndQuery() throws Exception {
            when(request.getQueryString()).thenReturn("model=foo&n=2");

            service.forward("GET", "/v1/chat", request, false);

            HttpRequest sent = captureSentRequest();
            assertThat(sent.uri())
                    .isEqualTo(URI.create("http://ai-backend:5001/v1/chat?model=foo&n=2"));
        }

        @Test
        @DisplayName("prepends a slash when the path lacks one")
        void prependsMissingSlash() throws Exception {
            when(request.getQueryString()).thenReturn(null);

            service.forward("GET", "v1/health", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://ai-backend:5001/v1/health"));
        }

        @Test
        @DisplayName("blank query string is ignored")
        void blankQueryIgnored() throws Exception {
            when(request.getQueryString()).thenReturn("   ");

            service.forward("GET", "/v1/ping", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://ai-backend:5001/v1/ping"));
        }

        @Test
        @DisplayName("trailing slash on the configured base URL is trimmed")
        void trimsTrailingSlashOnBase() throws Exception {
            AiProxyService svc =
                    new AiProxyService("http://ai-backend:5001/", userRepository, userService);
            ReflectionTestUtils.setField(svc, "httpClient", httpClient);
            when(request.getQueryString()).thenReturn(null);

            svc.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://ai-backend:5001/v1/x"));
        }

        @Test
        @DisplayName("surrounding whitespace on the base URL is trimmed")
        void trimsWhitespaceOnBase() throws Exception {
            AiProxyService svc =
                    new AiProxyService("  http://ai-backend:5001  ", userRepository, userService);
            ReflectionTestUtils.setField(svc, "httpClient", httpClient);
            when(request.getQueryString()).thenReturn(null);

            svc.forward("GET", "/v1/y", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://ai-backend:5001/v1/y"));
        }

        @Test
        @DisplayName("blank base URL falls back to the localhost default")
        void blankBaseUrlFallsBackToDefault() throws Exception {
            AiProxyService svc = new AiProxyService("   ", userRepository, userService);
            ReflectionTestUtils.setField(svc, "httpClient", httpClient);
            when(request.getQueryString()).thenReturn(null);

            svc.forward("GET", "/v1/z", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://localhost:5001/v1/z"));
        }

        @Test
        @DisplayName("null base URL falls back to the localhost default")
        void nullBaseUrlFallsBackToDefault() throws Exception {
            AiProxyService svc = new AiProxyService(null, userRepository, userService);
            ReflectionTestUtils.setField(svc, "httpClient", httpClient);
            when(request.getQueryString()).thenReturn(null);

            svc.forward("GET", "/v1/q", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://localhost:5001/v1/q"));
        }
    }

    @Nested
    @DisplayName("Authorization header forwarding")
    class AuthorizationForwarding {

        @Test
        @DisplayName("forwards a present Authorization header verbatim")
        void forwardsPresentAuth() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("Authorization")).thenReturn("Bearer abc.def");

            service.forward("GET", "/v1/x", request, false);

            assertThat(header(captureSentRequest(), "Authorization")).isEqualTo("Bearer abc.def");
        }

        @Test
        @DisplayName("omits the header when Authorization is null")
        void omitsWhenNull() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("Authorization")).thenReturn(null);

            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("Authorization")).isEmpty();
        }

        @Test
        @DisplayName("omits the header when Authorization is blank")
        void omitsWhenBlank() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("Authorization")).thenReturn("   ");

            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("Authorization")).isEmpty();
        }
    }

    @Nested
    @DisplayName("X-API-KEY resolution")
    class ApiKeyResolution {

        @Test
        @DisplayName("uses the X-API-KEY header from the request when present (no user lookup)")
        void usesRequestHeaderAndSkipsUserLookup() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("X-API-KEY")).thenReturn("req-key-123");

            service.forward("GET", "/v1/x", request, false);

            assertThat(header(captureSentRequest(), "X-API-KEY")).isEqualTo("req-key-123");
            // Header short-circuits the authenticated-user fallback entirely.
            verifyNoInteractions(userService);
        }

        @Test
        @DisplayName("falls back to the authenticated user's API key when the header is absent")
        void fallsBackToUserApiKey() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("X-API-KEY")).thenReturn(null);
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(userService.getApiKeyForUser("alice")).thenReturn("user-key-xyz");

            service.forward("GET", "/v1/x", request, false);

            assertThat(header(captureSentRequest(), "X-API-KEY")).isEqualTo("user-key-xyz");
            verify(userService).getApiKeyForUser("alice");
        }

        @Test
        @DisplayName("falls back to the user key when the header is blank")
        void blankHeaderTriggersFallback() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("X-API-KEY")).thenReturn("  ");
            when(userService.getCurrentUsername()).thenReturn("bob");
            when(userService.getApiKeyForUser("bob")).thenReturn("bob-key");

            service.forward("GET", "/v1/x", request, false);

            assertThat(header(captureSentRequest(), "X-API-KEY")).isEqualTo("bob-key");
        }

        @Test
        @DisplayName("no X-API-KEY header set when there is no authenticated user")
        void noUser_noHeader() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("X-API-KEY")).thenReturn(null);
            when(userService.getCurrentUsername()).thenReturn(null);

            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("X-API-KEY")).isEmpty();
            // Username was null/blank, so the key lookup is never attempted.
            verify(userService, never()).getApiKeyForUser(any());
        }

        @Test
        @DisplayName("blank username from the security context yields no header")
        void blankUsername_noHeader() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("X-API-KEY")).thenReturn(null);
            when(userService.getCurrentUsername()).thenReturn("   ");

            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("X-API-KEY")).isEmpty();
            verify(userService, never()).getApiKeyForUser(any());
        }

        @Test
        @DisplayName("a resolved-but-blank user key is not forwarded")
        void blankResolvedKey_noHeader() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("X-API-KEY")).thenReturn(null);
            when(userService.getCurrentUsername()).thenReturn("carol");
            when(userService.getApiKeyForUser("carol")).thenReturn("");

            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("X-API-KEY")).isEmpty();
        }

        @Test
        @DisplayName("an exception while resolving the user key is swallowed; no header forwarded")
        void userKeyLookupThrows_isSwallowed() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("X-API-KEY")).thenReturn(null);
            when(userService.getCurrentUsername()).thenReturn("dave");
            when(userService.getApiKeyForUser("dave"))
                    .thenThrow(new RuntimeException("key store offline"));

            // Must not propagate: extractUserApiKey() catches and returns null.
            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("X-API-KEY")).isEmpty();
        }
    }

    @Nested
    @DisplayName("Accept header handling")
    class AcceptHandling {

        @Test
        @DisplayName("acceptEventStream overrides any inbound Accept with text/event-stream")
        void eventStreamOverrides() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("Accept")).thenReturn("application/json");

            service.forward("GET", "/v1/stream", request, true);

            assertThat(header(captureSentRequest(), "Accept")).isEqualTo("text/event-stream");
        }

        @Test
        @DisplayName("event stream is requested even with no inbound Accept header")
        void eventStreamWithoutInboundAccept() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("Accept")).thenReturn(null);

            service.forward("GET", "/v1/stream", request, true);

            assertThat(header(captureSentRequest(), "Accept")).isEqualTo("text/event-stream");
        }

        @Test
        @DisplayName("passes a non-stream Accept header through unchanged")
        void passesInboundAcceptThrough() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("Accept")).thenReturn("application/json");

            service.forward("GET", "/v1/x", request, false);

            assertThat(header(captureSentRequest(), "Accept")).isEqualTo("application/json");
        }

        @Test
        @DisplayName("no Accept header set when inbound Accept is absent and SSE not requested")
        void noAcceptWhenAbsentAndNotStreaming() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("Accept")).thenReturn(null);

            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("Accept")).isEmpty();
        }

        @Test
        @DisplayName("blank inbound Accept is not forwarded when SSE not requested")
        void blankAcceptNotForwarded() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("Accept")).thenReturn("  ");

            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("Accept")).isEmpty();
        }
    }

    @Nested
    @DisplayName("HTTP method and body publisher selection")
    class MethodAndBody {

        @Test
        @DisplayName("GET sends no body and never reads the request input stream")
        void getHasNoBody() throws Exception {
            when(request.getQueryString()).thenReturn(null);

            service.forward("GET", "/v1/x", request, false);

            HttpRequest sent = captureSentRequest();
            assertThat(sent.method()).isEqualTo("GET");
            assertThat(sent.bodyPublisher()).isPresent();
            assertThat(sent.bodyPublisher().get().contentLength()).isZero();
            // GET/DELETE short-circuit before touching the body.
            verify(request, never()).getInputStream();
            verify(request, never()).getParts();
        }

        @Test
        @DisplayName("DELETE sends no body and never reads the request input stream")
        void deleteHasNoBody() throws Exception {
            when(request.getQueryString()).thenReturn(null);

            service.forward("DELETE", "/v1/item/9", request, false);

            HttpRequest sent = captureSentRequest();
            assertThat(sent.method()).isEqualTo("DELETE");
            assertThat(sent.bodyPublisher().get().contentLength()).isZero();
            verify(request, never()).getInputStream();
        }

        @Test
        @DisplayName("method name matching is case-insensitive for the no-body branch")
        void lowercaseGetStillNoBody() throws Exception {
            when(request.getQueryString()).thenReturn(null);

            service.forward("get", "/v1/x", request, false);

            HttpRequest sent = captureSentRequest();
            // Lowercase still routes through the GET/DELETE no-body branch.
            assertThat(sent.method()).isEqualToIgnoringCase("get");
            assertThat(sent.bodyPublisher().get().contentLength()).isZero();
            verify(request, never()).getInputStream();
        }

        @Test
        @DisplayName("POST with a plain content type streams the request input stream as the body")
        void postStreamsInputStream() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("application/json");
            ServletInputStream sis =
                    servletInputStream("{\"x\":1}".getBytes(StandardCharsets.UTF_8));
            when(request.getInputStream()).thenReturn(sis);

            service.forward("POST", "/v1/chat", request, false);

            HttpRequest sent = captureSentRequest();
            assertThat(sent.method()).isEqualTo("POST");
            // ofInputStream publishes with an unknown length (-1).
            assertThat(sent.bodyPublisher()).isPresent();
            // Inbound Content-Type is propagated since the body publisher provides none.
            assertThat(header(sent, "Content-Type")).isEqualTo("application/json");
        }

        @Test
        @DisplayName("POST with no inbound content type sets no Content-Type header")
        void postWithoutContentType() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn(null);
            when(request.getInputStream())
                    .thenReturn(servletInputStream("raw".getBytes(StandardCharsets.UTF_8)));

            service.forward("POST", "/v1/chat", request, false);

            assertThat(captureSentRequest().headers().firstValue("Content-Type")).isEmpty();
        }
    }

    @Nested
    @DisplayName("multipart/form-data re-encoding")
    class Multipart {

        @Test
        @DisplayName("re-encodes parts and sets a generated multipart boundary Content-Type")
        void reencodesMultipartBody() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("multipart/form-data; boundary=inbound");

            Part field = textPart("prompt", "hello world");
            Part file = filePart("file", "doc.pdf", "application/pdf", "PDF-BYTES");
            when(request.getParts()).thenReturn(List.of(field, file));

            service.forward("POST", "/v1/upload", request, false);

            HttpRequest sent = captureSentRequest();
            String contentType = header(sent, "Content-Type");
            assertThat(contentType).startsWith("multipart/form-data; boundary=----spdf-");
            // A fresh boundary is generated rather than reusing the inbound one.
            assertThat(contentType).doesNotContain("inbound");
            // Body has a known length (ofByteArray), unlike the streamed-input branch.
            assertThat(sent.bodyPublisher()).isPresent();
            assertThat(sent.bodyPublisher().get().contentLength()).isPositive();
        }

        @Test
        @DisplayName("the generated boundary in the header matches the one used in the body bytes")
        void boundaryHeaderMatchesBody() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("multipart/form-data");
            Part textPart = textPart("k", "v");
            when(request.getParts()).thenReturn(List.of(textPart));

            service.forward("POST", "/v1/upload", request, false);

            HttpRequest sent = captureSentRequest();
            String contentType = header(sent, "Content-Type");
            String boundary =
                    contentType.substring(contentType.indexOf("boundary=") + "boundary=".length());

            String body = drainBody(sent.bodyPublisher().get());
            assertThat(body).contains("--" + boundary);
            assertThat(body).contains("--" + boundary + "--");
            assertThat(body).contains("Content-Disposition: form-data; name=\"k\"").contains("v");
        }

        @Test
        @DisplayName("a file part renders a filename in its Content-Disposition")
        void filePartRendersFilename() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("multipart/form-data");
            Part filePart = filePart("file", "a.pdf", "application/pdf", "DATA");
            when(request.getParts()).thenReturn(List.of(filePart));

            service.forward("POST", "/v1/upload", request, false);

            String body = drainBody(captureSentRequest().bodyPublisher().get());
            assertThat(body)
                    .contains("Content-Disposition: form-data; name=\"file\"; filename=\"a.pdf\"")
                    .contains("Content-Type: application/pdf")
                    .contains("DATA");
        }

        @Test
        @DisplayName("an empty parts collection still produces a valid closing boundary")
        void emptyPartsClosesBoundary() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("multipart/form-data");
            when(request.getParts()).thenReturn(List.of());

            service.forward("POST", "/v1/upload", request, false);

            HttpRequest sent = captureSentRequest();
            String contentType = header(sent, "Content-Type");
            String boundary =
                    contentType.substring(contentType.indexOf("boundary=") + "boundary=".length());
            // Closing delimiter line + the trailing empty writeLine each append CRLF.
            assertThat(drainBody(sent.bodyPublisher().get()))
                    .isEqualTo("--" + boundary + "--\r\n\r\n");
        }

        @Test
        @DisplayName("a getParts() failure is surfaced as IOException")
        void getPartsFailureBecomesIoException() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("multipart/form-data");
            when(request.getParts())
                    .thenThrow(new jakarta.servlet.ServletException("bad multipart"));

            assertThatThrownBy(() -> service.forward("POST", "/v1/upload", request, false))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("Failed to proxy multipart request");
            // Failed before reaching the client: send() is never invoked.
            verify(httpClient, never())
                    .send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        }
    }

    @Nested
    @DisplayName("response propagation and send delegation")
    class SendDelegation {

        @Test
        @DisplayName("returns exactly the response produced by the underlying client")
        void returnsClientResponse() throws Exception {
            when(request.getQueryString()).thenReturn(null);

            HttpResponse<InputStream> result = service.forward("GET", "/v1/x", request, false);

            assertThat(result).isSameAs(response);
        }

        @Test
        @DisplayName("an IOException from the client propagates to the caller")
        void clientIoExceptionPropagates() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                    .thenThrow(new IOException("connection refused"));

            assertThatThrownBy(() -> service.forward("GET", "/v1/x", request, false))
                    .isInstanceOf(IOException.class)
                    .hasMessage("connection refused");
        }

        @Test
        @DisplayName("an InterruptedException from the client propagates to the caller")
        void clientInterruptedExceptionPropagates() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                    .thenThrow(new InterruptedException("interrupted"));

            assertThatThrownBy(() -> service.forward("GET", "/v1/x", request, false))
                    .isInstanceOf(InterruptedException.class);
            // Clear the interrupt flag the thrown InterruptedException may have left.
            Thread.interrupted();
        }
    }

    // --- helpers ------------------------------------------------------------------------------

    private static Part textPart(String name, String value) throws IOException {
        Part p = org.mockito.Mockito.mock(Part.class);
        when(p.getName()).thenReturn(name);
        when(p.getSubmittedFileName()).thenReturn(null);
        when(p.getContentType()).thenReturn(null);
        when(p.getInputStream())
                .thenReturn(new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8)));
        return p;
    }

    private static Part filePart(String name, String filename, String contentType, String value)
            throws IOException {
        Part p = org.mockito.Mockito.mock(Part.class);
        when(p.getName()).thenReturn(name);
        when(p.getSubmittedFileName()).thenReturn(filename);
        when(p.getContentType()).thenReturn(contentType);
        when(p.getInputStream())
                .thenReturn(new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8)));
        return p;
    }

    private static String drainBody(HttpRequest.BodyPublisher publisher) {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        java.util.concurrent.Flow.Subscriber<java.nio.ByteBuffer> subscriber =
                new java.util.concurrent.Flow.Subscriber<>() {
                    @Override
                    public void onSubscribe(java.util.concurrent.Flow.Subscription s) {
                        s.request(Long.MAX_VALUE);
                    }

                    @Override
                    public void onNext(java.nio.ByteBuffer item) {
                        byte[] chunk = new byte[item.remaining()];
                        item.get(chunk);
                        out.write(chunk, 0, chunk.length);
                    }

                    @Override
                    public void onError(Throwable t) {
                        throw new RuntimeException(t);
                    }

                    @Override
                    public void onComplete() {}
                };
        publisher.subscribe(subscriber);
        return out.toString(StandardCharsets.UTF_8);
    }

    /** Minimal ServletInputStream over a fixed byte array for streaming-body tests. */
    private static ServletInputStream servletInputStream(byte[] data) {
        ByteArrayInputStream delegate = new ByteArrayInputStream(data);
        return new ServletInputStream() {
            @Override
            public int read() {
                return delegate.read();
            }

            @Override
            public boolean isFinished() {
                return delegate.available() == 0;
            }

            @Override
            public boolean isReady() {
                return true;
            }

            @Override
            public void setReadListener(jakarta.servlet.ReadListener readListener) {
                // no-op: synchronous reads only in tests
            }
        };
    }
}
