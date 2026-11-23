package stirling.software.proprietary.repository;

/**
 * The day's-first tool-usage insert. A fragment rather than {@code save()} because a merge would
 * overwrite the concurrent winner's row instead of losing the primary key race.
 */
public interface ToolUsageStatRepositoryCustom {

    void insertCount(String principal, String fromTool, String toolKey, long epochDay, long delta);
}
