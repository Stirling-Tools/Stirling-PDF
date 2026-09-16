package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import stirling.software.common.cluster.inprocess.InProcessKeyValueCache;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.repository.ToolChainStatRepository;
import stirling.software.proprietary.repository.ToolUsageStatRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.service.ToolUsageSignalService.TeamScope;
import stirling.software.proprietary.service.ToolUsageSignalService.ToolChainSummary;

@ExtendWith(MockitoExtension.class)
class ToolUsageSignalServiceTest {

    @Mock private ToolUsageStatRepository usageRepository;
    @Mock private ToolChainStatRepository chainRepository;
    @Mock private UserRepository userRepository;
    @Mock private TeamMembershipRepository membershipRepository;

    private ToolUsageSignalService service;

    @BeforeEach
    void setUp() {
        service = signalService(Optional.of(userRepository));
        // Most tests describe a self-hosted install, where the legacy team column is the roster.
        lenient().when(membershipRepository.findTeamIdsByUsername(any())).thenReturn(List.of());
        lenient()
                .when(membershipRepository.findUsernamesByTeamIds(anyCollection(), any()))
                .thenReturn(List.of());
    }

    private ToolUsageSignalService signalService(Optional<UserRepository> users) {
        return new ToolUsageSignalService(
                usageRepository,
                chainRepository,
                users,
                Optional.of(membershipRepository),
                new InProcessKeyValueCache());
    }

    private static Object[] row(String tool, long recent, long total) {
        return new Object[] {tool, recent, total};
    }

    private static Object[] edgeRow(String fromTool, String tool, Long recent, Long total) {
        return new Object[] {fromTool, tool, recent, total};
    }

    private static Object[] chainRow(String chainKey, int length, long total) {
        return new Object[] {chainKey, length, total};
    }

    private static User user(String username, Team team) {
        User user = new User();
        user.setUsername(username);
        user.setTeam(team);
        return user;
    }

    private static Team team(long id) {
        Team team = new Team();
        team.setId(id);
        return team;
    }

    /** Stands in for the projection query, which returns usernames already ordered and capped. */
    private void teamRoster(long teamId, List<String> usernames) {
        when(userRepository.findUsernamesByTeamIds(eq(List.of(teamId)), any(Pageable.class)))
                .thenReturn(usernames);
    }

    @Test
    @DisplayName("recent-window events count double on top of the total")
    void recentEventsCountDouble() {
        when(usageRepository.sumByPrincipal("alice", 10, 20))
                .thenReturn(List.<Object[]>of(row("ocr", 3, 10), row("merge", 0, 10)));

        Map<String, Double> signal = service.userFrequency("alice", 10, 20);

        assertThat(signal).containsEntry("ocr", 13.0).containsEntry("merge", 10.0);
    }

    @Test
    @DisplayName("zero-count rows are dropped so they cannot skew normalization")
    void zeroRowsDropped() {
        when(usageRepository.sumGlobal(10, 20))
                .thenReturn(List.<Object[]>of(row("ocr", 0, 0), row("merge", 1, 2)));

        assertThat(service.globalFrequency(10, 20)).containsOnlyKeys("merge");
    }

    @Test
    @DisplayName("null aggregate values are treated as zero")
    void nullAggregatesTolerated() {
        when(usageRepository.edgesGlobal(10, 20))
                .thenReturn(List.<Object[]>of(edgeRow("compare", "ocr", null, 4L)));

        assertThat(service.globalTransitions(10, 20)).containsEntry("compare", Map.of("ocr", 4.0));
    }

    @Test
    @DisplayName("one scan returns every source tool's row, so no caller can ask for a new one")
    void transitionsComeBackAsAMatrix() {
        when(usageRepository.edgesGlobal(10, 20))
                .thenReturn(
                        List.<Object[]>of(
                                edgeRow("compress", "addPassword", 1L, 2L),
                                edgeRow("compress", "split", 0L, 1L),
                                edgeRow("ocr", "redact", 0L, 5L)));

        Map<String, Map<String, Double>> edges = service.globalTransitions(10, 20);

        assertThat(edges).containsOnlyKeys("compress", "ocr");
        assertThat(edges.get("compress"))
                .containsEntry("addPassword", 3.0)
                .containsEntry("split", 1.0);
        assertThat(edges.get("ocr")).containsEntry("redact", 5.0);
        verify(usageRepository, times(1)).edgesGlobal(10, 20);
    }

    @Test
    @DisplayName("every member of a team resolves to the same roster, so the cache key holds")
    void teamScopeIsIdenticalForEveryMember() {
        Team team = team(7L);
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(user("alice", team)));
        when(userRepository.findByUsernameIgnoreCase("bob"))
                .thenReturn(Optional.of(user("bob", team)));
        teamRoster(7L, List.of("alice", "bob"));

        TeamScope forAlice = service.resolveTeamScope("alice");
        TeamScope forBob = service.resolveTeamScope("bob");

        assertThat(forAlice).isEqualTo(forBob);
        assertThat(forAlice.teamIds()).containsExactly(7L);
        assertThat(forAlice.principals()).containsExactly("alice", "bob");
        assertThat(forAlice.hasMembers()).isTrue();
    }

    @Test
    @DisplayName("teams joined through memberships count, which is how SaaS models them")
    void membershipTeamsAreIncluded() {
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(user("alice", null)));
        when(membershipRepository.findTeamIdsByUsername("alice")).thenReturn(List.of(42L));
        when(userRepository.findUsernamesByTeamIds(eq(List.of(42L)), any(Pageable.class)))
                .thenReturn(List.of());
        when(membershipRepository.findUsernamesByTeamIds(eq(List.of(42L)), any(Pageable.class)))
                .thenReturn(List.of("alice", "bob"));

        TeamScope scope = service.resolveTeamScope("alice");

        assertThat(scope.teamIds()).containsExactly(42L);
        assertThat(scope.principals()).containsExactly("alice", "bob");
        assertThat(scope.hasMembers()).isTrue();
    }

    @Test
    @DisplayName("a team of one is just the caller, so it contributes no separate signal")
    void soloTeamHasNoSignal() {
        Team team = team(7L);
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(user("alice", team)));
        teamRoster(7L, List.of("alice"));

        assertThat(service.resolveTeamScope("alice").hasMembers()).isFalse();
    }

    @Test
    @DisplayName("a user with no team yields an empty scope")
    void noTeamYieldsEmptyScope() {
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(user("alice", null)));

        assertThat(service.resolveTeamScope("alice")).isEqualTo(TeamScope.none());
    }

    @Test
    @DisplayName("an empty scope is a resolved answer, so it is worth caching")
    void emptyScopeIsResolved() {
        when(userRepository.findByUsernameIgnoreCase("alice")).thenReturn(Optional.empty());

        assertThat(service.resolveTeamScope("alice").resolved()).isTrue();
    }

    @Test
    @DisplayName("a repository failure is unresolved, so a blip is never cached as 'no team'")
    void teamLookupFailureIsNotCacheable() {
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenThrow(new RuntimeException("db down"));

        TeamScope scope = service.resolveTeamScope("alice");

        assertThat(scope.hasMembers()).isFalse();
        assertThat(scope.resolved()).isFalse();
    }

    @Test
    @DisplayName("core builds without a user repository never attempt team scoping")
    void noUserRepositoryMeansNoTeam() {
        ToolUsageSignalService coreService = signalService(Optional.empty());

        assertThat(coreService.resolveTeamScope("alice")).isEqualTo(TeamScope.none());
        verifyNoInteractions(userRepository);
    }

    @Test
    @DisplayName("team aggregates query only the scope's principals")
    void teamAggregatesUseScopePrincipals() {
        TeamScope scope = new TeamScope(List.of(7L), List.of("bob", "carol"), true);
        when(usageRepository.sumByPrincipals(scope.principals(), 10, 20))
                .thenReturn(List.<Object[]>of(row("ocr", 1, 2)));

        assertThat(service.teamFrequency(scope, 10, 20)).containsEntry("ocr", 3.0);
        verify(usageRepository).sumByPrincipals(List.of("bob", "carol"), 10, 20);
    }

    @Test
    @DisplayName("teams with the same members share a cache key, and different ones do not")
    void cacheKeyIdentifiesTheRoster() {
        assertThat(new TeamScope(List.of(7L, 9L), List.of("a", "b"), true).cacheKey())
                .isEqualTo(new TeamScope(List.of(7L, 9L), List.of("a", "b"), true).cacheKey())
                .isNotEqualTo(new TeamScope(List.of(7L), List.of("a", "b"), true).cacheKey());
    }

    @Test
    @DisplayName("very large teams are capped so the IN clause stays bounded")
    void largeTeamsAreCapped() {
        Team team = team(7L);
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(user("alice", team)));
        List<String> members = IntStream.range(0, 900).mapToObj(i -> "user" + i).toList();
        when(userRepository.findUsernamesByTeamIds(eq(List.of(7L)), any(Pageable.class)))
                .thenReturn(members);

        assertThat(service.resolveTeamScope("alice").principals()).hasSize(500);
    }

    @Test
    @DisplayName("the roster is ordered and limited by the database, not after loading entities")
    void rosterIsPagedInTheDatabase() {
        Team team = team(7L);
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(user("alice", team)));
        teamRoster(7L, List.of("alice", "bob"));

        service.resolveTeamScope("alice");

        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
        ArgumentCaptor<Collection<Long>> ids = ArgumentCaptor.captor();
        verify(userRepository).findUsernamesByTeamIds(ids.capture(), page.capture());
        assertThat(ids.getValue()).containsExactly(7L);
        assertThat(page.getValue().getPageSize()).isEqualTo(500);
    }

    @Test
    @DisplayName("chain rows are decoded back into ordered tool lists")
    void chainRowsDecoded() {
        when(chainRepository.topByPrincipal(eq("alice"), eq(10L), eq(2), any(Pageable.class)))
                .thenReturn(List.<Object[]>of(chainRow("compress>watermark", 2, 4)));

        assertThat(service.userChains("alice", 10, 2, 6))
                .containsExactly(new ToolChainSummary(List.of("compress", "watermark"), 4));
    }

    @Test
    @DisplayName("the requested limit bounds the page asked of the database")
    void chainLimitBoundsThePage() {
        when(chainRepository.topGlobal(eq(10L), eq(2), any(Pageable.class))).thenReturn(List.of());

        service.globalChains(10, 2, 3);

        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
        verify(chainRepository).topGlobal(eq(10L), eq(2), page.capture());
        assertThat(page.getValue().getPageSize()).isEqualTo(3);
    }

    @Test
    @DisplayName("single-tool and zero-count chain rows are not workflows")
    void nonWorkflowChainRowsDropped() {
        when(chainRepository.topByPrincipal(eq("alice"), eq(10L), eq(2), any(Pageable.class)))
                .thenReturn(
                        List.<Object[]>of(
                                chainRow("compress", 1, 9), chainRow("compress>ocr", 2, 0)));

        assertThat(service.userChains("alice", 10, 2, 6)).isEmpty();
    }

    @Test
    @DisplayName("user-scoped reads hit the database directly so new activity shows immediately")
    void userScopedReadsAreDirect() {
        when(usageRepository.sumByPrincipal("alice", 10, 20)).thenReturn(List.of());

        service.userFrequency("alice", 10, 20);
        service.userFrequency("alice", 10, 20);

        verify(usageRepository, times(2)).sumByPrincipal("alice", 10, 20);
    }
}
