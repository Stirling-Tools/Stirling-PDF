package stirling.software.SPDF.controller.api.converters;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseBody;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.exception.CacheUnavailableException;

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
            return ResponseEntity.status(HttpStatus.GONE).body(body);
        } catch (Exception e) {
            log.warn("Failed to serialize cache_unavailable response: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.GONE)
                    .body(
                            ("{\"error\":\"cache_unavailable\",\"action\":\"reupload\",\"message\":\""
                                            + ex.getMessage()
                                            + "\"}")
                                    .getBytes());
        }
    }
}
