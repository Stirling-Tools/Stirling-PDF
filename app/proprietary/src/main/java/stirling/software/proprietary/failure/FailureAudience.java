package stirling.software.proprietary.failure;

/**
 * Who an offered action is for. The read scope has already decided the caller may see the incident;
 * this decides which of its actions are theirs to take.
 *
 * <p>The distinction is possession, not seniority: a reviewer clearing up after a colleague cannot
 * supply that colleague's password or reach a document only their browser holds.
 */
public enum FailureAudience {

    /** The person whose work failed, whose own client still holds the document. */
    OWNER,

    /** Anyone who triages the team's incidents, whoever hit them. */
    TEAM_REVIEWER,

    /** Everyone the incident is shown to at all. */
    ANYONE_WHO_SEES
}
