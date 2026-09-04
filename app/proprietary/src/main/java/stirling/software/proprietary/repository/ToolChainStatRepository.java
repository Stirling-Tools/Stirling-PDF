package stirling.software.proprietary.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.model.ToolChainStat;
import stirling.software.proprietary.model.ToolChainStatId;

/**
 * Aggregates return rows of [chainKey, chainLength, totalCount] ordered by count, so the caller can
 * take the top N workflows without loading the table.
 */
@Repository
public interface ToolChainStatRepository extends JpaRepository<ToolChainStat, ToolChainStatId> {

    String SELECT_TOP =
            "SELECT c.chainKey, MAX(c.chainLength), SUM(c.count) FROM ToolChainStat c WHERE ";

    String GROUP_ORDER = " GROUP BY c.chainKey ORDER BY SUM(c.count) DESC, c.chainKey ASC";

    @Query(
            SELECT_TOP
                    + "c.principal = :principal AND c.epochDay >= :cutoff "
                    + "AND c.chainLength >= :minLength"
                    + GROUP_ORDER)
    List<Object[]> topByPrincipal(
            @Param("principal") String principal,
            @Param("cutoff") long cutoff,
            @Param("minLength") int minLength,
            Pageable pageable);

    @Query(
            SELECT_TOP
                    + "c.principal IN :principals AND c.epochDay >= :cutoff "
                    + "AND c.chainLength >= :minLength"
                    + GROUP_ORDER)
    List<Object[]> topByPrincipals(
            @Param("principals") Collection<String> principals,
            @Param("cutoff") long cutoff,
            @Param("minLength") int minLength,
            Pageable pageable);

    @Query(SELECT_TOP + "c.epochDay >= :cutoff AND c.chainLength >= :minLength" + GROUP_ORDER)
    List<Object[]> topGlobal(
            @Param("cutoff") long cutoff, @Param("minLength") int minLength, Pageable pageable);

    /** Returns 0 when today's row does not exist yet, telling the caller to insert it. */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
            "UPDATE ToolChainStat c SET c.count = c.count + :delta "
                    + "WHERE c.principal = :principal AND c.chainKey = :chainKey "
                    + "AND c.epochDay = :epochDay")
    int incrementCount(
            @Param("principal") String principal,
            @Param("chainKey") String chainKey,
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
                    "INSERT INTO tool_chain_stats (principal, chain_key, epoch_day, chain_length,"
                            + " count) VALUES (:principal, :chainKey, :epochDay, :chainLength,"
                            + " :delta)",
            nativeQuery = true)
    void insertCount(
            @Param("principal") String principal,
            @Param("chainKey") String chainKey,
            @Param("epochDay") long epochDay,
            @Param("chainLength") int chainLength,
            @Param("delta") long delta);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("DELETE FROM ToolChainStat c WHERE c.epochDay < :cutoff")
    int deleteOlderThan(@Param("cutoff") long cutoff);

    // Erasure: rows key on the raw username, so a recreated name would inherit the history.
    // No clearAutomatically: a clear would detach the User deleteUser deletes right after this.
    @Modifying
    @Transactional
    @Query("DELETE FROM ToolChainStat c WHERE c.principal = :principal")
    int deleteByPrincipal(@Param("principal") String principal);
}
