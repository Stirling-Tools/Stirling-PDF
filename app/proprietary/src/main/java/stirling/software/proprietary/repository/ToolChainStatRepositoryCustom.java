package stirling.software.proprietary.repository;

/**
 * The day's-first tool-chain insert. A fragment rather than {@code save()} because a merge would
 * overwrite the concurrent winner's row instead of losing the primary key race.
 */
public interface ToolChainStatRepositoryCustom {

    void insertCount(String principal, String chainKey, long epochDay, int chainLength, long delta);
}
