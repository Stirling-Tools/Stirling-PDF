package stirling.software.proprietary.failure;

import org.springframework.http.HttpStatus;

import lombok.Getter;

/** Carries a {@link Reason} rather than an HTTP status, so the service stays web-agnostic. */
@Getter
public class FailureActionException extends RuntimeException {

    public enum Reason {
        /**
         * No such event, another team's, or an unresolved team: one reason, so the answer cannot
         * vary.
         */
        EVENT_NOT_FOUND,

        /** The action id is not in the vocabulary at all, or has no registered handler. */
        ACTION_NOT_RECOGNISED,

        /**
         * The action exists but this kind does not offer it, so it cannot be dispatched by hand.
         */
        ACTION_NOT_DECLARED,

        /** Offered, but the client is what runs it, so refused rather than half-performed. */
        ACTION_NOT_DISPATCHABLE,

        /** The event is already closed, so no further transition is possible. */
        ALREADY_CLOSED
    }

    private final Reason reason;

    public FailureActionException(Reason reason, String message) {
        this(reason, message, null);
    }

    public FailureActionException(Reason reason, String message, Throwable cause) {
        super(message, cause);
        this.reason = reason;
    }

    /**
     * Lives with the reasons it maps, so every surface that dispatches an action answers alike. A
     * closed row is a conflict, not a bad request: it was well-formed and valid a moment earlier.
     */
    public static HttpStatus statusOf(Reason reason) {
        return switch (reason) {
            case EVENT_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case ACTION_NOT_RECOGNISED, ACTION_NOT_DECLARED, ACTION_NOT_DISPATCHABLE ->
                    HttpStatus.BAD_REQUEST;
            case ALREADY_CLOSED -> HttpStatus.CONFLICT;
        };
    }
}
