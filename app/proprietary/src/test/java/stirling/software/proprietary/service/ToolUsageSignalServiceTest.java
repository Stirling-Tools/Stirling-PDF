package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.repository.ToolUsageStatRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.ToolUsageSignalService.TeamScope;

@ExtendWith(MockitoExtension.class)
class ToolUsageSignalServiceTest {

    @Mock private ToolUsageStatRepository usageRepository;
    @Mock private UserRepository userRepository;

    private ToolUsageSignalService service;

    @BeforeEach
    void setUp() {
        service = new ToolUsageSignalService(usageRepository, Optional.of(userRepository));
    }

    private static Object[] row(String tool, long recent, long total) {
        return new Object[] {tool, recent, total};
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
        when(usageRepository.sumByFrom("compare", 10, 20))
                .thenReturn(List.<Object[]>of(new Object[] {"ocr", null, 4L}));

        assertThat(service.globalTransitions("compare", 10, 20)).containsEntry("ocr", 4.0);
    }

    @Test
    @DisplayName("every member of a team resolves to the same roster, so the cache key holds")
    void teamScopeIsIdenticalForEveryMember() {
        Team team = team(7L);
        List<User> members = List.of(user("bob", team), user("alice", team));
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(user("alice", team)));
        when(userRepository.findByUsernameIgnoreCase("bob"))
                .thenReturn(Optional.of(user("bob", team)));
        when(userRepository.findAllByTeamId(7L)).thenReturn(members);

        TeamScope forAlice = service.resolveTeamScope("alice");
        TeamScope forBob = service.resolveTeamScope("bob");

        assertThat(forAlice).isEqualTo(forBob);
        assertThat(forAlice.teamId()).isEqualTo(7L);
        assertThat(forAlice.principals()).containsExactly("alice", "bob");
        assertThat(forAlice.hasMembers()).isTrue();
    }

    @Test
    @DisplayName("a team of one is just the caller, so it contributes no separate signal")
    void soloTeamHasNoSignal() {
        Team team = team(7L);
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(user("alice", team)));
        when(userRepository.findAllByTeamId(7L)).thenReturn(List.of(user("alice", team)));

        assertThat(service.resolveTeamScope("alice").hasMembers()).isFalse();
    }

    @Test
    @DisplayName("a user with no team yields an empty scope")
    void noTeamYieldsEmptyScope() {
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(user("alice", null)));

        assertThat(service.resolveTeamScope("alice").hasMembers()).isFalse();
    }

    @Test
    @DisplayName("a repository failure degrades to an empty scope rather than throwing")
    void teamLookupFailureDegrades() {
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenThrow(new RuntimeException("db down"));

        assertThat(service.resolveTeamScope("alice")).isEqualTo(TeamScope.none());
    }

    @Test
    @DisplayName("core builds without a user repository never attempt team scoping")
    void noUserRepositoryMeansNoTeam() {
        ToolUsageSignalService coreService =
                new ToolUsageSignalService(usageRepository, Optional.empty());

        assertThat(coreService.resolveTeamScope("alice")).isEqualTo(TeamScope.none());
        verifyNoInteractions(userRepository);
    }

    @Test
    @DisplayName("team aggregates query only the scope's principals")
    void teamAggregatesUseScopePrincipals() {
        TeamScope scope = new TeamScope(7L, List.of("bob", "carol"));
        when(usageRepository.sumByPrincipals(scope.principals(), 10, 20))
                .thenReturn(List.<Object[]>of(row("ocr", 1, 2)));

        assertThat(service.teamFrequency(scope, 10, 20)).containsEntry("ocr", 3.0);
        verify(usageRepository).sumByPrincipals(List.of("bob", "carol"), 10, 20);
    }

    @Test
    @DisplayName("very large teams are capped deterministically so the IN clause stays bounded")
    void largeTeamsAreCappedDeterministically() {
        Team team = team(7L);
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(user("alice", team)));
        List<User> members = IntStream.range(0, 900).mapToObj(i -> user("user" + i, team)).toList();
        when(userRepository.findAllByTeamId(7L)).thenReturn(members).thenReturn(members.reversed());

        List<String> first = service.resolveTeamScope("alice").principals();
        List<String> second = service.resolveTeamScope("alice").principals();

        assertThat(first).hasSize(500);
        // Row order from the database must not change which members are kept.
        assertThat(second).isEqualTo(first);
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
