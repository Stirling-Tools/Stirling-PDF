package stirling.software.proprietary.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.repository.ToolUsageStatRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

/**
 * Serves the scoring signals as tool -> weighted count maps. User-scoped signals are cheap indexed
 * reads and stay uncached so a user's own activity shows up immediately. Team and install-wide
 * aggregates scan far more rows, so they are cached and shared: 50,000 users browsing tools cost
 * one scan per TTL, not 50,000.
 *
 * <p>Separate bean from {@link ToolRecommendationService} on purpose - Spring's cache proxy only
 * applies to calls that cross a bean boundary.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ToolUsageSignalService {

    public static final String CACHE_NAME = "toolRecommendationSignals";

    // Bounds the IN clause for very large teams; signal saturates well before this.
    private static final int MAX_TEAM_PRINCIPALS = 500;

    private final ToolUsageStatRepository usageRepository;
    private final Optional<UserRepository> userRepository;

    /**
     * A team's members, resolved once per TTL; empty when the caller has no team. Deliberately
     * includes the caller: the team aggregates are cached under {@code teamId} alone, so the roster
     * must be identical for everyone on the team or the first caller's list would be served to the
     * rest.
     */
    public record TeamScope(Long teamId, List<String> principals) {
        public static TeamScope none() {
            return new TeamScope(null, List.of());
        }

        /** A one-person team is just the caller again, so it adds nothing to their own signal. */
        public boolean hasMembers() {
            return principals.size() > 1;
        }
    }

    public Map<String, Double> userFrequency(String principal, long cutoff, long recentCutoff) {
        return weight(usageRepository.sumByPrincipal(principal, cutoff, recentCutoff));
    }

    public Map<String, Double> userTransitions(
            String principal, String fromTool, long cutoff, long recentCutoff) {
        return weight(
                usageRepository.sumByPrincipalAndFrom(principal, fromTool, cutoff, recentCutoff));
    }

    @Cacheable(
            value = CACHE_NAME,
            key = "'teamFreq|' + #scope.teamId() + '|' + #cutoff + '|' + #recentCutoff")
    public Map<String, Double> teamFrequency(TeamScope scope, long cutoff, long recentCutoff) {
        return weight(usageRepository.sumByPrincipals(scope.principals(), cutoff, recentCutoff));
    }

    @Cacheable(
            value = CACHE_NAME,
            key =
                    "'teamTrans|' + #scope.teamId() + '|' + #fromTool + '|' + #cutoff + '|' +"
                            + " #recentCutoff")
    public Map<String, Double> teamTransitions(
            TeamScope scope, String fromTool, long cutoff, long recentCutoff) {
        return weight(
                usageRepository.sumByPrincipalsAndFrom(
                        scope.principals(), fromTool, cutoff, recentCutoff));
    }

    @Cacheable(value = CACHE_NAME, key = "'globalFreq|' + #cutoff + '|' + #recentCutoff")
    public Map<String, Double> globalFrequency(long cutoff, long recentCutoff) {
        return weight(usageRepository.sumGlobal(cutoff, recentCutoff));
    }

    @Cacheable(
            value = CACHE_NAME,
            key = "'globalTrans|' + #fromTool + '|' + #cutoff + '|' + #recentCutoff")
    public Map<String, Double> globalTransitions(String fromTool, long cutoff, long recentCutoff) {
        return weight(usageRepository.sumByFrom(fromTool, cutoff, recentCutoff));
    }

    /** {@code unless} keeps a transient lookup failure from being cached as "no team". */
    @Cacheable(
            value = CACHE_NAME,
            key = "'team|' + #principal",
            unless = "#result.teamId() == null")
    public TeamScope resolveTeamScope(String principal) {
        if (userRepository.isEmpty()) {
            return TeamScope.none();
        }
        try {
            return userRepository
                    .get()
                    .findByUsernameIgnoreCase(principal)
                    .map(User::getTeam)
                    .map(team -> new TeamScope(team.getId(), teamPrincipals(team.getId())))
                    .orElseGet(TeamScope::none);
        } catch (Exception e) {
            log.debug("Team resolution failed for {}: {}", principal, e.getMessage());
            return TeamScope.none();
        }
    }

    /** Sorted so the {@link #MAX_TEAM_PRINCIPALS} cap picks the same members every time. */
    private List<String> teamPrincipals(Long teamId) {
        return userRepository.get().findAllByTeamId(teamId).stream()
                .map(User::getUsername)
                .filter(Objects::nonNull)
                .sorted()
                .limit(MAX_TEAM_PRINCIPALS)
                .toList();
    }

    /** Collapses [tool, recentCount, totalCount] rows; recent-window events count double. */
    private static Map<String, Double> weight(List<Object[]> rows) {
        Map<String, Double> weighted = new HashMap<>();
        for (Object[] row : rows) {
            long recent = row[1] == null ? 0 : ((Number) row[1]).longValue();
            long total = row[2] == null ? 0 : ((Number) row[2]).longValue();
            if (total + recent > 0) {
                weighted.put((String) row[0], (double) (total + recent));
            }
        }
        return weighted;
    }
}
