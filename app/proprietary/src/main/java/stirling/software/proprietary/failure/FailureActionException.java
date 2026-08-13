package stirling.software.proprietary.failure;

import org.springframework.http.HttpStatus;

import lombok.Getter;

/**
 * Why an action could not be dispatched. Thrown carrying a {@link Reason} rather than an HTTP
 * status, so the service stays web-agnostic and only a controller ever reaches for {@link
 * #statusOf}.
 */
@Getter
public class FailureActionException extends RuntimeException {

    public enum Reason {
        /**
         * No such event, it belongs to another team, or the caller's team did not resolve. One
         * reason for all three, so the response does not vary with which it was. Unrelated to
         * {@link FailureKind#UNKNOWN}, which is an unclassified failure rather than a refused
         * action.
         */
        EVENT_NOT_FOUND,

        /** The action id is not in the vocabulary at all, or has no registered handler. */
        ACTION_NOT_RECOGNISED,

        /**
         * The action exists but this kind does not declare it, so an incoherent pairing (releasing
         * a document whose destination is what failed) cannot be dispatched even by hand. Reachable
         * as of the kinds that stopped offering {@link FailureActionId#ACKNOWLEDGE}.
         */
        ACTION_NOT_DECLARED,

        /**
         * The kind offers it, but the client is what runs it (see {@link
         * FailureActionId.Execution#CLIENT}), so it is refused rather than half-performed.
         */
        ACTION_NOT_DISPATCHABLE,

        /** The event is already closed, so no further transition is possible. */
        ALREADY_CLOSED
    }

    private final Reason reason;

    public FailureActionException(Reason reason, String message) {
        this(reason, message, null);
    }

    /** For a refusal that follows from a lower-level failure, so its stack is not dropped. */
    public FailureActionException(Reason reason, String message, Throwable cause) {
        super(message, cause);
        this.reason = reason;
    }

    /**
     * The HTTP status each refusal reason answers with. Lives with the reasons it maps, so the two
     * surfaces that dispatch actions, the failure queue and the notification bell, cannot drift
     * apart and a client's error handling does not depend on which one it called.
     *
     * <p>A closed row is a conflict rather than a bad request: the request was well-formed and
     * would have been valid a moment earlier. A missing row is a 404 whether it never existed,
     * belongs to another team or is a colleague's, so trying does not confirm which.
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
