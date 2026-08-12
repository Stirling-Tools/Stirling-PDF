package stirling.software.proprietary.failure;

import lombok.Getter;

/**
 * Why an action could not be dispatched. Carries a {@link Reason} rather than an HTTP status, so
 * the service stays web-agnostic and the controller owns the mapping.
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
         * a document whose destination is what failed) cannot be dispatched even by hand.
         *
         * <p>Unreachable today: both kinds declare both actions, so no request can trip this guard
         * until a kind ships with a restricted action set. Declared now because the guard must
         * exist before that kind does, not after.
         */
        ACTION_NOT_DECLARED,

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
}
