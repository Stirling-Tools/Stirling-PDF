package stirling.software.proprietary.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.KeyValueCache;
import stirling.software.proprietary.model.ToolChainStat;
import stirling.software.proprietary.repository.ToolChainStatRepository;
import stirling.software.proprietary.repository.ToolUsageStatRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

/**
 * Serves the scoring signals as tool -> weighted count maps. A caller's own signals are cheap
 * indexed reads and stay uncached so their activity shows up immediately. Team and install-wide
 * aggregates scan far more rows, so they are cached and shared: 50,000 users browsing tools cost
 * one scan per TTL, not 50,000.
 *
 * <p>Two tiers behind one key. A bounded Caffeine cache per node answers the common case without
 * touching anything; behind it {@link KeyValueCache} shares the same entry across the cluster, so
 * with a Valkey backplane a scan one node paid for serves them all. On the default in-process
 * backplane the second tier is a local map and changes nothing.
 */
@Slf4j
@Service
public class ToolUsageSignalService {

    static final String CACHE_NAME = "toolRecommendationSignals";

    private static final Duration TTL = Duration.ofMinutes(5);

    /** Bounded so a long-lived node cannot accumulate a cache entry per team per day forever. */
    private static final int MAX_LOCAL_ENTRIES = 10_000;

    // Bounds the IN clause for very large teams; signal saturates well before this.
    private static final int MAX_TEAM_PRINCIPALS = 500;

    private static final TypeReference<Map<String, Double>> TOOL_SCORES = new TypeReference<>() {};

    private static final TypeReference<Map<String, Map<String, Double>>> TOOL_EDGES =
            new TypeReference<>() {};

    private static final TypeReference<List<ToolChainSummary>> CHAIN_SUMMARIES =
            new TypeReference<>() {};

    /**
     * Owned rather than injected: these are private cache payloads, so they must not follow
     * whatever the application's mapper is configured to do with dates or unknown fields. The app
     * has no ObjectMapper bean in any case - the other services here do the same.
     */
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ToolUsageStatRepository usageRepository;
    private final ToolChainStatRepository chainRepository;
    private final Optional<UserRepository> userRepository;
    private final Optional<TeamMembershipRepository> membershipRepository;
    private final KeyValueCache sharedCache;

    private final Cache<String, Object> localCache =
            Caffeine.newBuilder().maximumSize(MAX_LOCAL_ENTRIES).expireAfterWrite(TTL).build();

    public ToolUsageSignalService(
            ToolUsageStatRepository usageRepository,
            ToolChainStatRepository chainRepository,
            Optional<UserRepository> userRepository,
            Optional<TeamMembershipRepository> membershipRepository,
            KeyValueCache sharedCache) {
        this.usageRepository = usageRepository;
        this.chainRepository = chainRepository;
        this.userRepository = userRepository;
        this.membershipRepository = membershipRepository;
        this.sharedCache = sharedCache;
    }

    /** An observed workflow: the ordered tools, and how many documents took that path. */
    public record ToolChainSummary(List<String> tools, long count) {}

    /**
     * The teams a caller shares with other people, and everyone in them. Deliberately includes the
     * caller: the team aggregates are cached under the team ids alone, so the roster must be
     * identical for everyone on those teams or the first caller's list would be served to the rest.
     *
     * <p>{@code resolved} separates "this caller has no team" from "the lookup failed", so only the
     * first is worth remembering.
     */
    public record TeamScope(List<Long> teamIds, List<String> principals, boolean resolved) {

        public static TeamScope none() {
            return new TeamScope(List.of(), List.of(), true);
        }

        /** A lookup that failed rather than came back empty; never cached. */
        public static TeamScope unresolved() {
            return new TeamScope(List.of(), List.of(), false);
        }

        /** A one-person team is just the caller again, so it adds nothing to their own signal. */
        public boolean hasMembers() {
            return principals.size() > 1;
        }

        /** Identifies the roster, so everyone with the same team set shares a cache entry. */
        public String cacheKey() {
            StringBuilder key = new StringBuilder();
            for (Long id : teamIds) {
                key.append(id).append('-');
            }
            return key.toString();
        }
    }

    public Map<String, Double> userFrequency(String principal, long cutoff, long recentCutoff) {
        return weight(usageRepository.sumByPrincipal(principal, cutoff, recentCutoff));
    }

    /**
     * The caller's own "what followed what" matrix, keyed by the tool each transition came from.
     */
    public Map<String, Map<String, Double>> userTransitions(
            String principal, long cutoff, long recentCutoff) {
        return edges(usageRepository.edgesByPrincipal(principal, cutoff, recentCutoff));
    }

    public Map<String, Double> teamFrequency(TeamScope scope, long cutoff, long recentCutoff) {
        return cached(
                key("teamFreq", scope.cacheKey(), cutoff, recentCutoff),
                TOOL_SCORES,
                () ->
                        weight(
                                usageRepository.sumByPrincipals(
                                        scope.principals(), cutoff, recentCutoff)));
    }

    public Map<String, Map<String, Double>> teamTransitions(
            TeamScope scope, long cutoff, long recentCutoff) {
        return cached(
                key("teamTrans", scope.cacheKey(), cutoff, recentCutoff),
                TOOL_EDGES,
                () ->
                        edges(
                                usageRepository.edgesByPrincipals(
                                        scope.principals(), cutoff, recentCutoff)));
    }

    public Map<String, Double> globalFrequency(long cutoff, long recentCutoff) {
        return cached(
                key("globalFreq", cutoff, recentCutoff),
                TOOL_SCORES,
                () -> weight(usageRepository.sumGlobal(cutoff, recentCutoff)));
    }

    public Map<String, Map<String, Double>> globalTransitions(long cutoff, long recentCutoff) {
        return cached(
                key("globalTrans", cutoff, recentCutoff),
                TOOL_EDGES,
                () -> edges(usageRepository.edgesGlobal(cutoff, recentCutoff)));
    }

    public List<ToolChainSummary> userChains(
            String principal, long cutoff, int minLength, int limit) {
        return chains(chainRepository.topByPrincipal(principal, cutoff, minLength, page(limit)));
    }

    public List<ToolChainSummary> teamChains(
            TeamScope scope, long cutoff, int minLength, int limit) {
        return cached(
                key("teamChains", scope.cacheKey(), cutoff, minLength, limit),
                CHAIN_SUMMARIES,
                () ->
                        chains(
                                chainRepository.topByPrincipals(
                                        scope.principals(), cutoff, minLength, page(limit))));
    }

    public List<ToolChainSummary> globalChains(long cutoff, int minLength, int limit) {
        return cached(
                key("globalChains", cutoff, minLength, limit),
                CHAIN_SUMMARIES,
                () -> chains(chainRepository.topGlobal(cutoff, minLength, page(limit))));
    }

    private static String key(Object... parts) {
        StringBuilder key = new StringBuilder();
        for (Object part : parts) {
            key.append(part).append('|');
        }
        return key.toString();
    }

    /**
     * Local cache, then the cluster, then the query. Any cache failure falls through to the query -
     * the signal is advisory, and a broken backplane must not take the ranking down with it.
     */
    @SuppressWarnings("unchecked")
    private <T> T cached(String key, TypeReference<T> type, Supplier<T> loader) {
        Object local = localCache.getIfPresent(key);
        if (local != null) {
            return (T) local;
        }
        T value = fromClusterOrLoad(key, type, loader);
        localCache.put(key, value);
        return value;
    }

    private <T> T fromClusterOrLoad(String key, TypeReference<T> type, Supplier<T> loader) {
        try {
            Optional<String> shared = sharedCache.get(CACHE_NAME, key);
            if (shared.isPresent()) {
                return MAPPER.readValue(shared.get(), type);
            }
        } catch (Exception e) {
            log.debug("Shared signal cache read failed for {}: {}", key, e.getMessage());
        }
        T value = loader.get();
        try {
            sharedCache.put(CACHE_NAME, key, MAPPER.writeValueAsString(value), TTL);
        } catch (Exception e) {
            log.debug("Shared signal cache write failed for {}: {}", key, e.getMessage());
        }
        return value;
    }

    private static Pageable page(int limit) {
        return PageRequest.of(0, Math.max(1, limit));
    }

    /** Collapses [chainKey, chainLength, totalCount] rows; the query already ordered them. */
    private static List<ToolChainSummary> chains(List<Object[]> rows) {
        List<ToolChainSummary> summaries = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            long count = row[2] == null ? 0 : ((Number) row[2]).longValue();
            List<String> tools = ToolChainStat.fromChainKey((String) row[0]);
            if (count > 0 && tools.size() > 1) {
                summaries.add(new ToolChainSummary(tools, count));
            }
        }
        return List.copyOf(summaries);
    }

    /**
     * The teams the caller shares with other people. Reads {@code team_memberships}, which is the
     * real membership model in SaaS and where a self-hosted user's single team is mirrored, and
     * unions in the legacy {@code users.team_id} so an install whose memberships predate that table
     * still resolves.
     */
    public TeamScope resolveTeamScope(String principal) {
        if (userRepository.isEmpty()) {
            return TeamScope.none();
        }
        String cacheKey = key("team", principal);
        Object local = localCache.getIfPresent(cacheKey);
        if (local instanceof TeamScope scope) {
            return scope;
        }
        TeamScope scope = loadTeamScope(principal);
        // A failed lookup is not an answer; caching it would blank the team tier for a whole TTL.
        if (scope.resolved()) {
            localCache.put(cacheKey, scope);
        }
        return scope;
    }

    private TeamScope loadTeamScope(String principal) {
        try {
            Set<Long> teamIds = new LinkedHashSet<>();
            userRepository
                    .get()
                    .findByUsernameIgnoreCase(principal)
                    .map(user -> user.getTeam() == null ? null : user.getTeam().getId())
                    .ifPresent(teamIds::add);
            membershipRepository.ifPresent(
                    repo -> teamIds.addAll(repo.findTeamIdsByUsername(principal)));
            teamIds.remove(null);
            if (teamIds.isEmpty()) {
                return TeamScope.none();
            }
            List<Long> sorted = teamIds.stream().sorted().toList();
            return new TeamScope(sorted, teamPrincipals(sorted), true);
        } catch (Exception e) {
            log.debug("Team resolution failed for {}: {}", principal, e.getMessage());
            return TeamScope.unresolved();
        }
    }

    /**
     * Usernames only, ordered and limited by the database: hydrating whole {@code User} entities to
     * read one column loads every member of what is, on a self-hosted install, the team everybody
     * is in.
     */
    private List<String> teamPrincipals(Collection<Long> teamIds) {
        Pageable cap = page(MAX_TEAM_PRINCIPALS);
        Set<String> principals =
                new LinkedHashSet<>(userRepository.get().findUsernamesByTeamIds(teamIds, cap));
        membershipRepository.ifPresent(
                repo -> principals.addAll(repo.findUsernamesByTeamIds(teamIds, cap)));
        return principals.stream().sorted().limit(MAX_TEAM_PRINCIPALS).toList();
    }

    /** Collapses [tool, recentCount, totalCount] rows; recent-window events count double. */
    private static Map<String, Double> weight(List<Object[]> rows) {
        Map<String, Double> weighted = new HashMap<>();
        for (Object[] row : rows) {
            double value = weightOf(row[1], row[2]);
            if (value > 0) {
                weighted.put((String) row[0], value);
            }
        }
        return weighted;
    }

    /**
     * Collapses [fromTool, tool, recentCount, totalCount] rows into a from -> tool -> weight map.
     */
    private static Map<String, Map<String, Double>> edges(List<Object[]> rows) {
        Map<String, Map<String, Double>> byFromTool = new HashMap<>();
        for (Object[] row : rows) {
            double value = weightOf(row[2], row[3]);
            if (value > 0) {
                byFromTool
                        .computeIfAbsent((String) row[0], key -> new HashMap<>())
                        .put((String) row[1], value);
            }
        }
        return byFromTool;
    }

    private static double weightOf(Object recentCount, Object totalCount) {
        long recent = recentCount == null ? 0 : ((Number) recentCount).longValue();
        long total = totalCount == null ? 0 : ((Number) totalCount).longValue();
        return total + recent;
    }
}
