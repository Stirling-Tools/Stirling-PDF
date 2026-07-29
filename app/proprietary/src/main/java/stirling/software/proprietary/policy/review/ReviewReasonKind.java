package stirling.software.proprietary.policy.review;

/** Why a file (or failed run) was sent to the review bucket. */
public enum ReviewReasonKind {
    /** An assigned label is on the team's watch list. */
    WATCHED_LABEL,
    /** An assigned label's confidence fell below the configured threshold. */
    LOW_CONFIDENCE,
    /** Classification ran but assigned no label at all. */
    NO_LABEL,
    /** The model seriously considered a watched label but was too unsure to assign it. */
    SKIPPED_LABEL,
    /** The run itself failed before delivering. */
    RUN_FAILED
}
