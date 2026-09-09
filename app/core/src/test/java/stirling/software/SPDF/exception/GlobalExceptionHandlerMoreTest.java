package stirling.software.SPDF.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.MessageSource;
import org.springframework.core.MethodParameter;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindingResult;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.server.ResponseStatusException;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Covers GlobalExceptionHandler branches not exercised by the original test: validation field
 * errors, media-type-not-supported, malformed-body with/without cause, ResponseStatusException
 * 4xx/5xx, NoResourceFound non-api path, and dev-mode caching.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("GlobalExceptionHandler extra coverage")
class GlobalExceptionHandlerMoreTest {

    @Mock private MessageSource messageSource;
    @Mock private Environment environment;
    @Mock private HttpServletRequest request;

    private GlobalExceptionHandler handler;

    @BeforeEach
    void setUp() {
        handler = new GlobalExceptionHandler(messageSource, environment);
        lenient().when(request.getRequestURI()).thenReturn("/api/test");
        lenient().when(request.getMethod()).thenReturn("POST");
        lenient()
                .when(messageSource.getMessage(anyString(), any(), anyString(), any(Locale.class)))
                .thenAnswer(inv -> inv.getArgument(2));
        lenient()
                .when(messageSource.getMessage(anyString(), any(), any(Locale.class)))
                .thenReturn(null);
        lenient().when(environment.getActiveProfiles()).thenReturn(new String[] {});
    }

    @Nested
    @DisplayName("handleMethodArgumentNotValid")
    class MethodArgNotValid {

        @Test
        @DisplayName("returns 400 with a flattened errors list")
        void returns400WithErrors() throws Exception {
            BindingResult br = new BeanPropertyBindingResult(new Object(), "target");
            br.rejectValue(null, "code", "must not be null");
            MethodParameter mp = mock(MethodParameter.class);
            MethodArgumentNotValidException ex = new MethodArgumentNotValidException(mp, br);

            ResponseEntity<ProblemDetail> resp = handler.handleMethodArgumentNotValid(ex, request);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(resp.getBody().getProperties()).containsKey("errors");
            assertThat(resp.getBody().getProperties()).containsKey("actionRequired");
        }
    }

    @Nested
    @DisplayName("handleMediaTypeNotSupported")
    class MediaTypeNotSupported {

        @Test
        @DisplayName("returns 415 with content type properties")
        void returns415() {
            HttpMediaTypeNotSupportedException ex =
                    new HttpMediaTypeNotSupportedException(
                            MediaType.TEXT_PLAIN, List.of(MediaType.APPLICATION_JSON));

            ResponseEntity<ProblemDetail> resp = handler.handleMediaTypeNotSupported(ex, request);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
            assertThat(resp.getBody().getProperties()).containsKey("supportedMediaTypes");
        }
    }

    @Nested
    @DisplayName("handleMessageNotReadable")
    class MessageNotReadable {

        private ServletServerHttpRequest httpInput() {
            return new ServletServerHttpRequest(request);
        }

        @Test
        @DisplayName("returns 400 for malformed body without a cause")
        void noCause() {
            HttpMessageNotReadableException ex =
                    new HttpMessageNotReadableException("bad json", httpInput());

            ResponseEntity<ProblemDetail> resp = handler.handleMessageNotReadable(ex, request);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("includes cause detail when present")
        void withCause() {
            HttpMessageNotReadableException ex =
                    new HttpMessageNotReadableException(
                            "bad json", new RuntimeException("unexpected token"), httpInput());

            ResponseEntity<ProblemDetail> resp = handler.handleMessageNotReadable(ex, request);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(resp.getBody().getDetail()).contains("unexpected token");
        }
    }

    @Nested
    @DisplayName("handleResponseStatusException")
    class ResponseStatus {

        @Test
        @DisplayName("propagates a 4xx status and reason")
        void clientError() {
            ResponseStatusException ex =
                    new ResponseStatusException(HttpStatus.CONFLICT, "already exists");

            ResponseEntity<ProblemDetail> resp = handler.handleResponseStatusException(ex, request);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
            assertThat(resp.getBody().getDetail()).isEqualTo("already exists");
        }

        @Test
        @DisplayName("propagates a 5xx status and logs at error level")
        void serverError() {
            ResponseStatusException ex = new ResponseStatusException(HttpStatus.BAD_GATEWAY, null);

            ResponseEntity<ProblemDetail> resp = handler.handleResponseStatusException(ex, request);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
            // null reason falls back to the status reason phrase
            assertThat(resp.getBody().getDetail())
                    .isEqualTo(HttpStatus.BAD_GATEWAY.getReasonPhrase());
        }
    }

    @Nested
    @DisplayName("handleNoResourceFound")
    class NoResourceFound {

        @Test
        @DisplayName("non-api path still returns 404 (logged at debug)")
        void nonApiPath() {
            when(request.getRequestURI()).thenReturn("/favicon.ico");
            when(request.getMethod()).thenReturn("GET");
            org.springframework.web.servlet.resource.NoResourceFoundException ex =
                    new org.springframework.web.servlet.resource.NoResourceFoundException(
                            org.springframework.http.HttpMethod.GET, "/favicon.ico", "");

            ResponseEntity<ProblemDetail> resp = handler.handleNoResourceFound(ex, request);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("isDevelopmentMode caching")
    class DevModeCaching {

        @Test
        @DisplayName("active profiles are scanned once and cached across calls")
        void cachedAcrossCalls() {
            when(environment.getActiveProfiles()).thenReturn(new String[] {"dev"});
            jakarta.servlet.http.HttpServletResponse response =
                    mock(jakarta.servlet.http.HttpServletResponse.class);
            when(response.isCommitted()).thenReturn(false);

            // First call computes and caches dev mode = true.
            ResponseEntity<ProblemDetail> first =
                    handler.handleGenericException(new Exception("a"), request, response);
            // Second call should reuse the cached value (still includes debug info).
            ResponseEntity<ProblemDetail> second =
                    handler.handleGenericException(new Exception("b"), request, response);

            assertThat(first.getBody().getProperties()).containsKey("debugMessage");
            assertThat(second.getBody().getProperties()).containsKey("debugMessage");
            // getActiveProfiles consulted exactly once due to caching.
            org.mockito.Mockito.verify(environment).getActiveProfiles();
        }
    }
}
