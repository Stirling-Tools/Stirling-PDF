package stirling.software.proprietary.policy.source;

/**
 * The Editor as a virtual, always-present source. Unlike a persisted {@link Source} it is neither
 * stored nor configurable: it stands for the documents a team processes by running policies from
 * the in-app editor (the {@code POST /api/v1/policies/{id}/run} path). Its throughput is tracked
 * through {@link SourceDocCounter} under a synthetic, team-scoped key, so each team sees only its
 * own editor activity and the client is only ever handed the opaque {@link #ID}, never a team.
 */
public final class EditorSource {

    /** The single, stable id and type the client sees for the editor row. */
    public static final String ID = "editor";

    public static final String TYPE = "editor";

    private EditorSource() {}

    /**
     * The per-team {@link SourceDocCounter} key. A {@code null} team (login disabled / self-hosted
     * single user) shares one global bucket; otherwise counts are partitioned by team so a team's
     * total aggregates every member's editor runs and no other team's.
     */
    public static String counterKey(Long teamId) {
        return teamId == null ? ID : ID + ":" + teamId;
    }
}
