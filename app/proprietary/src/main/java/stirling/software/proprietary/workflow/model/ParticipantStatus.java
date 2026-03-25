package stirling.software.proprietary.workflow.model;

/**
 * Defines the status of a participant in a workflow session. Tracks participant progress through
 * the workflow lifecycle.
 */
public enum ParticipantStatus {
    /** Participant has been added but not yet notified */
    PENDING,

    /** Participant has been notified via email or other means */
    NOTIFIED,

    /** Participant has viewed the document */
    VIEWED,

    /** Participant has completed their action (e.g., signed the document) */
    SIGNED,

    /** Participant has declined to participate or rejected the action */
    DECLINED
}
