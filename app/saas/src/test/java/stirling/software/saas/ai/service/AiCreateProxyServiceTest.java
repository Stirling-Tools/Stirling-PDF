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
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

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

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.service.UserService;

/**
 * Unit tests for {@link AiCreateProxyService}.
 *
 * <p>The service forwards an inbound HTTP request to the AI "create" backend. It builds its own
 * {@link HttpClient} in the constructor (no injection), so each test swaps in a mocked client via
 * {@link ReflectionTestUtils} and captures the outgoing {@link HttpRequest} to assert on the URL,
 * method and headers. All collaborators ({@link HttpServletRequest}, {@link UserService}, {@link
 * UserRepository}) are mocked; no Spring context, DB or real network is involved.
 *
 * <p>Header semantics under test: Content-Type and Authorization are forwarded only when present
 * and non-blank; X-API-KEY is taken from the inbound header first and otherwise resolved from the
 * authenticated user (any lookup failure is swallowed); Accept is overridden to {@code
 * text/event-stream} when SSE is requested. GET/DELETE send no body; other methods stream the
 * request input stream lazily.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiCreateProxyServiceTest {

    private static final String BASE_URL = "http://ai-backend:5001";

    @Mock private UserRepository userRepository;
    @Mock private UserService userService;
    @Mock private HttpServletRequest request;
    @Mock private HttpClient httpClient;

    @SuppressWarnings("unchecked")
    private final HttpResponse<InputStream> response =
            (HttpResponse<InputStream>) org.mockito.Mockito.mock(HttpResponse.class);

    private AiCreateProxyService service;

    @BeforeEach
    void setUp() throws Exception {
        service = new AiCreateProxyService(BASE_URL, userRepository, userService);
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

    /** Build a fresh service backed by the shared mock client for base-URL variations. */
    private AiCreateProxyService serviceWithBase(String base) {
        AiCreateProxyService svc = new AiCreateProxyService(base, userRepository, userService);
        ReflectionTestUtils.setField(svc, "httpClient", httpClient);
        return svc;
    }

    @Nested
    @DisplayName("target URL assembly")
    class UrlAssembly {

        @Test
        @DisplayName("joins base + leading-slash path + query string")
        void joinsBasePathAndQuery() throws Exception {
            when(request.getQueryString()).thenReturn("model=foo&n=2");

            service.forward("GET", "/v1/chat", request, false);

            assertThat(captureSentRequest().uri())
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
        @DisplayName("null query string is ignored")
        void nullQueryIgnored() throws Exception {
            when(request.getQueryString()).thenReturn(null);

            service.forward("GET", "/v1/ping", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://ai-backend:5001/v1/ping"));
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
            AiCreateProxyService svc = serviceWithBase("http://ai-backend:5001/");
            when(request.getQueryString()).thenReturn(null);

            svc.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://ai-backend:5001/v1/x"));
        }

        @Test
        @DisplayName("surrounding whitespace on the base URL is trimmed")
        void trimsWhitespaceOnBase() throws Exception {
            AiCreateProxyService svc = serviceWithBase("  http://ai-backend:5001  ");
            when(request.getQueryString()).thenReturn(null);

            svc.forward("GET", "/v1/y", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://ai-backend:5001/v1/y"));
        }

        @Test
        @DisplayName("blank base URL falls back to the localhost default")
        void blankBaseUrlFallsBackToDefault() throws Exception {
            AiCreateProxyService svc = serviceWithBase("   ");
            when(request.getQueryString()).thenReturn(null);

            svc.forward("GET", "/v1/z", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://localhost:5001/v1/z"));
        }

        @Test
        @DisplayName("null base URL falls back to the localhost default")
        void nullBaseUrlFallsBackToDefault() throws Exception {
            AiCreateProxyService svc = serviceWithBase(null);
            when(request.getQueryString()).thenReturn(null);

            svc.forward("GET", "/v1/q", request, false);

            assertThat(captureSentRequest().uri())
                    .isEqualTo(URI.create("http://localhost:5001/v1/q"));
        }
    }

    @Nested
    @DisplayName("Content-Type header forwarding")
    class ContentTypeForwarding {

        @Test
        @DisplayName("forwards a present inbound Content-Type on a body-bearing request")
        void forwardsPresentContentType() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("application/json");
            when(request.getInputStream())
                    .thenReturn(servletInputStream("{}".getBytes(StandardCharsets.UTF_8)));

            service.forward("POST", "/v1/chat", request, false);

            assertThat(header(captureSentRequest(), "Content-Type")).isEqualTo("application/json");
        }

        @Test
        @DisplayName("omits Content-Type when the inbound value is null")
        void omitsWhenNull() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn(null);

            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("Content-Type")).isEmpty();
        }

        @Test
        @DisplayName("omits Content-Type when the inbound value is blank")
        void omitsWhenBlank() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("   ");

            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("Content-Type")).isEmpty();
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
        @DisplayName("falls back to the user key when the inbound header is blank")
        void blankHeaderTriggersFallback() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("X-API-KEY")).thenReturn("  ");
            when(userService.getCurrentUsername()).thenReturn("bob");
            when(userService.getApiKeyForUser("bob")).thenReturn("bob-key");

            service.forward("GET", "/v1/x", request, false);

            assertThat(header(captureSentRequest(), "X-API-KEY")).isEqualTo("bob-key");
        }

        @Test
        @DisplayName("no X-API-KEY header is set when there is no authenticated user")
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
        @DisplayName("a null resolved user key is not forwarded")
        void nullResolvedKey_noHeader() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("X-API-KEY")).thenReturn(null);
            when(userService.getCurrentUsername()).thenReturn("dan");
            when(userService.getApiKeyForUser("dan")).thenReturn(null);

            service.forward("GET", "/v1/x", request, false);

            assertThat(captureSentRequest().headers().firstValue("X-API-KEY")).isEmpty();
        }

        @Test
        @DisplayName("an exception while resolving the user key is swallowed; no header forwarded")
        void userKeyLookupThrows_isSwallowed() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getHeader("X-API-KEY")).thenReturn(null);
            when(userService.getCurrentUsername()).thenReturn("erin");
            when(userService.getApiKeyForUser("erin"))
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
        @DisplayName("GET sends an empty body and never reads the request input stream")
        void getHasNoBody() throws Exception {
            when(request.getQueryString()).thenReturn(null);

            service.forward("GET", "/v1/x", request, false);

            HttpRequest sent = captureSentRequest();
            assertThat(sent.method()).isEqualTo("GET");
            assertThat(sent.bodyPublisher()).isPresent();
            assertThat(sent.bodyPublisher().get().contentLength()).isZero();
            // GET/DELETE short-circuit before touching the body.
            verify(request, never()).getInputStream();
        }

        @Test
        @DisplayName("DELETE sends an empty body and never reads the request input stream")
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
            assertThat(sent.method()).isEqualToIgnoringCase("get");
            assertThat(sent.bodyPublisher().get().contentLength()).isZero();
            verify(request, never()).getInputStream();
        }

        @Test
        @DisplayName("lowercase delete also routes through the no-body branch")
        void lowercaseDeleteNoBody() throws Exception {
            when(request.getQueryString()).thenReturn(null);

            service.forward("delete", "/v1/item/1", request, false);

            HttpRequest sent = captureSentRequest();
            assertThat(sent.bodyPublisher().get().contentLength()).isZero();
            verify(request, never()).getInputStream();
        }

        @Test
        @DisplayName("POST streams the request input stream as an unknown-length body")
        void postStreamsInputStream() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("application/json");
            byte[] payload = "{\"x\":1}".getBytes(StandardCharsets.UTF_8);
            when(request.getInputStream()).thenReturn(servletInputStream(payload));

            service.forward("POST", "/v1/chat", request, false);

            HttpRequest sent = captureSentRequest();
            assertThat(sent.method()).isEqualTo("POST");
            assertThat(sent.bodyPublisher()).isPresent();
            // ofInputStream publishes with an unknown content length (-1).
            assertThat(sent.bodyPublisher().get().contentLength()).isEqualTo(-1L);
        }

        @Test
        @DisplayName("PUT also streams the request body via the input-stream publisher")
        void putStreamsInputStream() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn(null);
            when(request.getInputStream())
                    .thenReturn(servletInputStream("raw".getBytes(StandardCharsets.UTF_8)));

            service.forward("PUT", "/v1/item/3", request, false);

            HttpRequest sent = captureSentRequest();
            assertThat(sent.method()).isEqualTo("PUT");
            assertThat(sent.bodyPublisher().get().contentLength()).isEqualTo(-1L);
        }

        @Test
        @DisplayName(
                "the streamed body publisher lazily emits the exact request bytes when drained")
        void streamedBodyContainsRequestBytes() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("application/json");
            when(request.getInputStream())
                    .thenReturn(servletInputStream("hello-body".getBytes(StandardCharsets.UTF_8)));

            service.forward("POST", "/v1/chat", request, false);

            HttpRequest sent = captureSentRequest();
            // The supplier is lazy: getInputStream() is only invoked once the body is consumed.
            String body = drainBody(sent.bodyPublisher().get());
            assertThat(body).isEqualTo("hello-body");
        }

        @Test
        @DisplayName(
                "an IOException while opening the request stream surfaces as UncheckedIOException")
        void inputStreamFailureBecomesUnchecked() throws Exception {
            when(request.getQueryString()).thenReturn(null);
            when(request.getContentType()).thenReturn("application/json");
            when(request.getInputStream()).thenThrow(new IOException("stream gone"));

            service.forward("POST", "/v1/chat", request, false);

            // The failure only triggers when the lazy supplier runs at body-drain time.
            HttpRequest sent = captureSentRequest();
            assertThatThrownBy(() -> drainBody(sent.bodyPublisher().get()))
                    .isInstanceOf(UncheckedIOException.class)
                    .hasRootCauseInstanceOf(IOException.class);
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

    /** Drain a BodyPublisher to a UTF-8 string, propagating any error the supplier throws. */
    private static String drainBody(HttpRequest.BodyPublisher publisher) {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        java.util.concurrent.atomic.AtomicReference<Throwable> error =
                new java.util.concurrent.atomic.AtomicReference<>();
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
                        error.set(t);
                    }

                    @Override
                    public void onComplete() {}
                };
        publisher.subscribe(subscriber);
        Throwable t = error.get();
        if (t instanceof RuntimeException re) {
            throw re;
        }
        if (t != null) {
            throw new RuntimeException(t);
        }
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
