package stirling.software.SPDF.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import lombok.extern.slf4j.Slf4j;

/**
 * Global exception handler that creates structured error responses with translation information for
 * frontend internationalization support.
 */
@ControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    public static class ErrorResponse {
        public String error;
        public String message;
        public String trace;
        public String translationKey;
        public List<String> translationArgs;

        public ErrorResponse(
                String error,
                String message,
                String trace,
                String translationKey,
                List<String> translationArgs) {
            this.error = error;
            this.message = message;
            this.trace = trace;
            this.translationKey = translationKey;
            this.translationArgs = translationArgs;
        }
    }

    @ExceptionHandler(stirling.software.common.util.TranslatableException.class)
    public ResponseEntity<ErrorResponse> handleTranslatableException(
            stirling.software.common.util.TranslatableException e) {
        List<String> translationArgs = null;
        if (e.getTranslationArgs() != null) {
            translationArgs = Arrays.stream(e.getTranslationArgs()).map(String::valueOf).toList();
        }

        ErrorResponse errorResponse =
                new ErrorResponse(
                        "Bad Request",
                        e.getMessage(),
                        getStackTrace(e),
                        e.getTranslationKey(),
                        translationArgs);

        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgumentException(
            IllegalArgumentException e) {
        ErrorResponse errorResponse =
                new ErrorResponse("Bad Request", e.getMessage(), getStackTrace(e), null, null);

        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ErrorResponse> handleRuntimeException(RuntimeException e) {
        ErrorResponse errorResponse =
                new ErrorResponse(
                        "Internal Server Error", e.getMessage(), getStackTrace(e), null, null);

        return new ResponseEntity<>(errorResponse, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception e) {
        ErrorResponse errorResponse =
                new ErrorResponse(
                        "Internal Server Error", e.getMessage(), getStackTrace(e), null, null);

        return new ResponseEntity<>(errorResponse, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    private String getStackTrace(Exception e) {
        if (e.getCause() != null) {
            return e.getCause().toString();
        }
        return e.getClass().getSimpleName() + ": " + e.getMessage();
    }
}
