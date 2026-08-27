package stirling.software.proprietary.failure;

/**
 * Who an offered action is for, the read scope having already decided they may see the incident.
 * The distinction is possession, not seniority: a reviewer cannot reach a document only its owner
 * holds.
 */
public enum FailureAudience {
    OWNER,

    /** Anyone who triages the team's incidents, whoever hit them. */
    TEAM_REVIEWER,

    ANYONE_WHO_SEES
}
