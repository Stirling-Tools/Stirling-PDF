package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.exception.CacheUnavailableException;

import tools.jackson.databind.ObjectMapper;

/**
 * Unit tests for {@link ConvertPdfJsonExceptionHandler}. A real ObjectMapper exercises the happy
 * path; a throwing mock drives the serialization-failure fallback branches.
 */
@DisplayName("ConvertPdfJsonExceptionHandler")
class ConvertPdfJsonExceptionHandlerTest {

    @Nested
    @DisplayName("handleCacheUnavailable - success")
    class Success {

        @Test
        @DisplayName("serializes a 410 GONE JSON body with the error details")
        void serializesGoneResponse() {
            ConvertPdfJsonExceptionHandler handler =
                    new ConvertPdfJsonExceptionHandler(new ObjectMapper());

            ResponseEntity<byte[]> response =
                    handler.handleCacheUnavailable(new CacheUnavailableException("cache is gone"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GONE);
            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.APPLICATION_JSON);
            String json = new String(response.getBody());
            assertThat(json).contains("cache_unavailable");
            assertThat(json).contains("reupload");
            assertThat(json).contains("cache is gone");
        }

        @Test
        @DisplayName("tolerates a null exception message")
        void toleratesNullMessage() {
            ConvertPdfJsonExceptionHandler handler =
                    new ConvertPdfJsonExceptionHandler(new ObjectMapper());

            ResponseEntity<byte[]> response =
                    handler.handleCacheUnavailable(new CacheUnavailableException(null));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GONE);
            assertThat(response.getBody()).isNotEmpty();
        }
    }

    @Nested
    @DisplayName("handleCacheUnavailable - fallback")
    class Fallback {

        @Test
        @DisplayName("uses the literal JSON fallback when every serialization attempt fails")
        void literalFallbackWhenAllSerializationFails() {
            ObjectMapper mapper = Mockito.mock(ObjectMapper.class);
            // Both the primary and the secondary writeValueAsBytes calls fail.
            Mockito.when(mapper.writeValueAsBytes(any())).thenThrow(new RuntimeException("boom"));
            ConvertPdfJsonExceptionHandler handler = new ConvertPdfJsonExceptionHandler(mapper);

            ResponseEntity<byte[]> response =
                    handler.handleCacheUnavailable(new CacheUnavailableException("nope"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GONE);
            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.APPLICATION_JSON);
            // Last-ditch hand-written JSON literal.
            String json = new String(response.getBody());
            assertThat(json).contains("cache_unavailable");
            assertThat(json).contains("Cache unavailable");
        }

        @Test
        @DisplayName("recovers via the second serialization attempt when only the first fails")
        void secondAttemptSucceeds() {
            ObjectMapper mapper = Mockito.mock(ObjectMapper.class);
            byte[] fallbackJson = "{\"error\":\"cache_unavailable\"}".getBytes();
            // First call throws, second returns serialized bytes.
            Mockito.when(mapper.writeValueAsBytes(any()))
                    .thenThrow(new RuntimeException("first fails"))
                    .thenReturn(fallbackJson);
            ConvertPdfJsonExceptionHandler handler = new ConvertPdfJsonExceptionHandler(mapper);

            ResponseEntity<byte[]> response =
                    handler.handleCacheUnavailable(new CacheUnavailableException("retry"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GONE);
            assertThat(response.getBody()).isEqualTo(fallbackJson);
        }
    }
}
