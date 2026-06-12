package stirling.software.SPDF.controller.api.converters;

import java.nio.charset.StandardCharsets;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.exception.CacheUnavailableException;

import tools.jackson.databind.ObjectMapper;

// NOTE: The original @ControllerAdvice was scoped to ConvertPdfJsonController only
// (assignableTypes). JAX-RS ExceptionMappers are global; CacheUnavailableException is
// expected to be specific to this controller's flow, so global mapping is acceptable.
@Provider
@Slf4j
@RequiredArgsConstructor
public class ConvertPdfJsonExceptionHandler
        implements ExceptionMapper<CacheUnavailableException> {

    private final ObjectMapper objectMapper;

    @Override
    public Response toResponse(CacheUnavailableException ex) {
        try {
            byte[] body =
                    objectMapper.writeValueAsBytes(
                            java.util.Map.of(
                                    "error", "cache_unavailable",
                                    "action", "reupload",
                                    "message", ex.getMessage()));
            return Response.status(Response.Status.GONE)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(body)
                    .build();
        } catch (Exception e) {
            log.warn("Failed to serialize cache_unavailable response", e);
            var fallbackBody =
                    java.util.Map.of(
                            "error", "cache_unavailable",
                            "action", "reupload",
                            "message", String.valueOf(ex.getMessage()));
            try {
                return Response.status(Response.Status.GONE)
                        .type(MediaType.APPLICATION_JSON)
                        .entity(objectMapper.writeValueAsBytes(fallbackBody))
                        .build();
            } catch (Exception ignored) {
                // Truly last-ditch fallback
                return Response.status(Response.Status.GONE)
                        .type(MediaType.APPLICATION_JSON)
                        .entity(
                                "{\"error\":\"cache_unavailable\",\"action\":\"reupload\",\"message\":\"Cache unavailable\"}"
                                        .getBytes(StandardCharsets.UTF_8))
                        .build();
            }
        }
    }
}
