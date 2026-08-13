package stirling.software.proprietary.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.model.ToolUsageStat;
import stirling.software.proprietary.model.ToolUsageStatId;

/**
 * Every aggregate returns rows of [toolKey, recentCount, totalCount] over the scoring window, so
 * callers can weight recent activity without a second query. Frequency queries group away {@code
 * fromTool}; transition queries filter on it.
 */
@Repository
public interface ToolUsageStatRepository extends JpaRepository<ToolUsageStat, ToolUsageStatId> {

    String SELECT_TOTALS =
            "SELECT s.toolKey, "
                    + "SUM(CASE WHEN s.epochDay >= :recentCutoff THEN s.count ELSE 0 END), "
                    + "SUM(s.count) FROM ToolUsageStat s WHERE ";

    String GROUP = " GROUP BY s.toolKey";

    @Query(SELECT_TOTALS + "s.principal = :principal AND s.epochDay >= :cutoff" + GROUP)
    List<Object[]> sumByPrincipal(
            @Param("principal") String principal,
            @Param("cutoff") long cutoff,
            @Param("recentCutoff") long recentCutoff);

    @Query(SELECT_TOTALS + "s.principal IN :principals AND s.epochDay >= :cutoff" + GROUP)
    List<Object[]> sumByPrincipals(
            @Param("principals") Collection<String> principals,
            @Param("cutoff") long cutoff,
            @Param("recentCutoff") long recentCutoff);

    @Query(SELECT_TOTALS + "s.epochDay >= :cutoff" + GROUP)
    List<Object[]> sumGlobal(
            @Param("cutoff") long cutoff, @Param("recentCutoff") long recentCutoff);

    @Query(
            SELECT_TOTALS
                    + "s.principal = :principal AND s.fromTool = :fromTool "
                    + "AND s.epochDay >= :cutoff"
                    + GROUP)
    List<Object[]> sumByPrincipalAndFrom(
            @Param("principal") String principal,
            @Param("fromTool") String fromTool,
            @Param("cutoff") long cutoff,
            @Param("recentCutoff") long recentCutoff);

    @Query(
            SELECT_TOTALS
                    + "s.principal IN :principals AND s.fromTool = :fromTool "
                    + "AND s.epochDay >= :cutoff"
                    + GROUP)
    List<Object[]> sumByPrincipalsAndFrom(
            @Param("principals") Collection<String> principals,
            @Param("fromTool") String fromTool,
            @Param("cutoff") long cutoff,
            @Param("recentCutoff") long recentCutoff);

    @Query(SELECT_TOTALS + "s.fromTool = :fromTool AND s.epochDay >= :cutoff" + GROUP)
    List<Object[]> sumByFrom(
            @Param("fromTool") String fromTool,
            @Param("cutoff") long cutoff,
            @Param("recentCutoff") long recentCutoff);

    /** Returns 0 when today's row does not exist yet, telling the caller to insert it. */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
            "UPDATE ToolUsageStat s SET s.count = s.count + :delta "
                    + "WHERE s.principal = :principal AND s.fromTool = :fromTool "
                    + "AND s.toolKey = :toolKey AND s.epochDay = :epochDay")
    int incrementCount(
            @Param("principal") String principal,
            @Param("fromTool") String fromTool,
            @Param("toolKey") String toolKey,
            @Param("epochDay") long epochDay,
            @Param("delta") long delta);

    /**
     * Native insert so a concurrent first-run-of-day loses the primary key race instead of silently
     * overwriting the winner - {@code save()} would merge, resetting their count.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
            value =
                    "INSERT INTO tool_usage_stats (principal, from_tool, tool_key, epoch_day,"
                            + " count) VALUES (:principal, :fromTool, :toolKey, :epochDay, :delta)",
            nativeQuery = true)
    void insertCount(
            @Param("principal") String principal,
            @Param("fromTool") String fromTool,
            @Param("toolKey") String toolKey,
            @Param("epochDay") long epochDay,
            @Param("delta") long delta);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("DELETE FROM ToolUsageStat s WHERE s.epochDay < :cutoff")
    int deleteOlderThan(@Param("cutoff") long cutoff);

    /** Erasure: rows key on the raw username, so a recreated name would inherit the ranking. */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("DELETE FROM ToolUsageStat s WHERE s.principal = :principal")
    int deleteByPrincipal(@Param("principal") String principal);
}
