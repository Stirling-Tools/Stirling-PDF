package stirling.software.SPDF.controller.api.converters;

import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseBody;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.exception.CacheUnavailableException;

import tools.jackson.databind.ObjectMapper;

@ControllerAdvice(assignableTypes = ConvertPdfJsonController.class)
@Slf4j
@RequiredArgsConstructor
public class ConvertPdfJsonExceptionHandler {

    private final ObjectMapper objectMapper;

    @ExceptionHandler(CacheUnavailableException.class)
    @ResponseBody
    public ResponseEntity<byte[]> handleCacheUnavailable(CacheUnavailableException ex) {
        try {
            byte[] body =
                    objectMapper.writeValueAsBytes(
                            java.util.Map.of(
                                    "error", "cache_unavailable",
                                    "action", "reupload",
                                    "message", ex.getMessage()));
            return ResponseEntity.status(HttpStatus.GONE)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body);
        } catch (Exception e) {
            log.warn("Failed to serialize cache_unavailable response", e);
            var fallbackBody =
                    java.util.Map.of(
                            "error", "cache_unavailable",
                            "action", "reupload",
                            "message", String.valueOf(ex.getMessage()));
            try {
                return ResponseEntity.status(HttpStatus.GONE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(objectMapper.writeValueAsBytes(fallbackBody));
            } catch (Exception ignored) {
                // Truly last-ditch fallback
                return ResponseEntity.status(HttpStatus.GONE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(
                                "{\"error\":\"cache_unavailable\",\"action\":\"reupload\",\"message\":\"Cache unavailable\"}"
                                        .getBytes(StandardCharsets.UTF_8));
            }
        }
    }
}
