package stirling.software.proprietary.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import stirling.software.proprietary.model.ToolRecommendationDismissal;
import stirling.software.proprietary.model.ToolRecommendationDismissalId;
import stirling.software.proprietary.model.ToolUsageStat;

/** Exercises the windowed CASE aggregation and increment queries against H2. */
@DataJpaTest
class ToolRecommendationRepositoriesTest {

    private static final long DAY = 20_000;
    private static final String NONE = ToolUsageStat.NO_PREVIOUS_TOOL;

    @Autowired private ToolUsageStatRepository usageRepository;
    @Autowired private ToolRecommendationDismissalRepository dismissalRepository;

    private static Map<String, long[]> byTool(List<Object[]> rows) {
        return rows.stream()
                .collect(
                        Collectors.toMap(
                                r -> (String) r[0],
                                r ->
                                        new long[] {
                                            ((Number) r[1]).longValue(), ((Number) r[2]).longValue()
                                        }));
    }

    @Test
    @DisplayName("frequency splits the recent window out of the total and ignores older rows")
    void usageSumsSplitRecentFromTotal() {
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", DAY, 3));
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", DAY - 10, 7));
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", DAY - 60, 100));
        usageRepository.save(new ToolUsageStat("bob", NONE, "merge", DAY, 5));

        Map<String, long[]> sums =
                byTool(usageRepository.sumByPrincipal("alice", DAY - 30, DAY - 7));

        assertThat(sums).containsOnlyKeys("ocr");
        assertThat(sums.get("ocr")[0]).isEqualTo(3);
        assertThat(sums.get("ocr")[1]).isEqualTo(10);
    }

    @Test
    @DisplayName("frequency sums a tool across every predecessor it followed")
    void frequencyGroupsAwayFromTool() {
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", DAY, 2));
        usageRepository.save(new ToolUsageStat("alice", "compare", "ocr", DAY, 3));
        usageRepository.save(new ToolUsageStat("alice", "merge", "ocr", DAY, 4));

        Map<String, long[]> sums =
                byTool(usageRepository.sumByPrincipal("alice", DAY - 30, DAY - 7));

        assertThat(sums.get("ocr")[1]).isEqualTo(9);
    }

    @Test
    @DisplayName("scoping by principals covers a team without leaking other users")
    void usageSumsScopeByPrincipals() {
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", DAY, 1));
        usageRepository.save(new ToolUsageStat("bob", NONE, "ocr", DAY, 2));
        usageRepository.save(new ToolUsageStat("carol", NONE, "ocr", DAY, 4));

        Map<String, long[]> team =
                byTool(usageRepository.sumByPrincipals(List.of("alice", "bob"), DAY - 30, DAY - 7));
        Map<String, long[]> global = byTool(usageRepository.sumGlobal(DAY - 30, DAY - 7));

        assertThat(team.get("ocr")[1]).isEqualTo(3);
        assertThat(global.get("ocr")[1]).isEqualTo(7);
    }

    @Test
    @DisplayName("transitions filter by the tool the user came from")
    void transitionSumsFilterByFromTool() {
        usageRepository.save(new ToolUsageStat("alice", "compare", "ocr", DAY, 2));
        usageRepository.save(new ToolUsageStat("alice", "compare", "ocr", DAY - 10, 3));
        usageRepository.save(new ToolUsageStat("alice", "compare", "merge", DAY, 1));
        usageRepository.save(new ToolUsageStat("alice", "split", "ocr", DAY, 9));
        usageRepository.save(new ToolUsageStat("bob", "compare", "ocr", DAY, 5));

        Map<String, long[]> mine =
                byTool(
                        usageRepository.sumByPrincipalAndFrom(
                                "alice", "compare", DAY - 30, DAY - 7));
        Map<String, long[]> everyone =
                byTool(usageRepository.sumByFrom("compare", DAY - 30, DAY - 7));

        assertThat(mine.keySet()).containsExactlyInAnyOrder("ocr", "merge");
        assertThat(mine.get("ocr")[0]).isEqualTo(2);
        assertThat(mine.get("ocr")[1]).isEqualTo(5);
        assertThat(everyone.get("ocr")[1]).isEqualTo(10);
    }

    @Test
    @DisplayName("runs with no predecessor never surface as transitions")
    void sentinelRowsExcludedFromTransitions() {
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", DAY, 5));

        assertThat(usageRepository.sumByPrincipalAndFrom("alice", "compare", DAY - 30, DAY - 7))
                .isEmpty();
        assertThat(byTool(usageRepository.sumByPrincipal("alice", DAY - 30, DAY - 7)))
                .containsKey("ocr");
    }

    @Test
    @DisplayName("increment updates only the exact row, reporting a miss otherwise")
    void incrementUpdatesExistingRowOnly() {
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", DAY, 1));

        int hit = usageRepository.incrementCount("alice", NONE, "ocr", DAY, 4);
        int missDay = usageRepository.incrementCount("alice", NONE, "ocr", DAY + 1, 4);
        int missFrom = usageRepository.incrementCount("alice", "compare", "ocr", DAY, 4);

        assertThat(hit).isEqualTo(1);
        assertThat(missDay).isZero();
        assertThat(missFrom).isZero();
        List<ToolUsageStat> rows = usageRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getCount()).isEqualTo(5);
    }

    @Test
    @DisplayName("inserting over an existing row fails instead of clobbering its count")
    void insertNeverOverwritesAnExistingCount() {
        // The concurrency contract: a losing racer must hit the primary key, not
        // silently reset the winner's tally the way an entity merge would.
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", DAY, 500));

        assertThatThrownBy(() -> usageRepository.insertCount("alice", NONE, "ocr", DAY, 1))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("insert creates the row when none exists")
    void insertCreatesMissingRow() {
        usageRepository.insertCount("alice", "compare", "ocr", DAY, 1);

        List<ToolUsageStat> rows = usageRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getFromTool()).isEqualTo("compare");
        assertThat(rows.get(0).getCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("the retention sweep prunes only rows past the cutoff")
    void deleteOlderThanPrunes() {
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", DAY - 200, 1));
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", DAY, 1));

        assertThat(usageRepository.deleteOlderThan(DAY - 180)).isEqualTo(1);
        assertThat(usageRepository.findAll()).hasSize(1);
    }

    @Test
    @DisplayName("saving the same dismissal twice leaves one row")
    void dismissalsAreIdempotent() {
        dismissalRepository.saveAndFlush(
                new ToolRecommendationDismissal("alice", "compare", "ocr"));
        dismissalRepository.saveAndFlush(
                new ToolRecommendationDismissal("alice", "compare", "ocr"));

        assertThat(dismissalRepository.findByPrincipal("alice")).hasSize(1);
    }

    @Test
    @DisplayName("dismissals are addressable by their full composite key")
    void dismissalsAddressableByKey() {
        dismissalRepository.saveAndFlush(
                new ToolRecommendationDismissal("alice", "compare", "ocr"));
        dismissalRepository.saveAndFlush(new ToolRecommendationDismissal("alice", "merge", "ocr"));

        assertThat(
                        dismissalRepository.findById(
                                new ToolRecommendationDismissalId("alice", "compare", "ocr")))
                .isPresent();
        assertThat(
                        dismissalRepository.findById(
                                new ToolRecommendationDismissalId("alice", "split", "ocr")))
                .isEmpty();
        assertThat(dismissalRepository.findByPrincipal("alice")).hasSize(2);
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model",
                "stirling.software.proprietary.access.model"
            })
    @EnableJpaRepositories(basePackages = {"stirling.software.proprietary.repository"})
    static class TestApp {}
}
