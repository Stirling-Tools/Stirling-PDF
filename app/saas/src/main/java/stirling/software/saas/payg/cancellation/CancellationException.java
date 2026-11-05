package stirling.software.saas.payg.cancellation;

import org.springframework.http.HttpStatus;

/** A refusal the cancel endpoints answer as {@code {"error": code}} with the given status. */
public class CancellationException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public CancellationException(HttpStatus status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }
}
