package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.cluster.KeyValueCache;
import stirling.software.common.cluster.inprocess.InProcessKeyValueCache;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.repository.ToolChainStatRepository;
import stirling.software.proprietary.repository.ToolUsageStatRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.service.ToolUsageSignalService.TeamScope;

/**
 * The team and install-wide aggregates are the only expensive queries in this feature. These tests
 * pin down what the two cache tiers buy: repeat callers on one node cost one scan, and a second
 * node sharing a backplane does not pay for that scan again.
 */
class ToolUsageSignalCachingTest {

    private ToolUsageStatRepository usageRepository;
    private ToolChainStatRepository chainRepository;
    private UserRepository userRepository;
    private TeamMembershipRepository membershipRepository;
    private KeyValueCache backplane;

    private ToolUsageSignalService node;

    @BeforeEach
    void setUp() {
        usageRepository = mock(ToolUsageStatRepository.class);
        chainRepository = mock(ToolChainStatRepository.class);
        userRepository = mock(UserRepository.class);
        membershipRepository = mock(TeamMembershipRepository.class);
        backplane = new InProcessKeyValueCache();

        lenient()
                .when(usageRepository.sumGlobal(anyLong(), anyLong()))
                .thenReturn(List.<Object[]>of(new Object[] {"compress", 5L, 50L}));
        lenient()
                .when(usageRepository.edgesGlobal(anyLong(), anyLong()))
                .thenReturn(List.<Object[]>of(new Object[] {"compare", "ocr", 2L, 8L}));
        lenient()
                .when(usageRepository.sumByPrincipals(anyCollection(), anyLong(), anyLong()))
                .thenReturn(List.<Object[]>of(new Object[] {"merge", 1L, 4L}));
        lenient()
                .when(membershipRepository.findTeamIdsByUsername(anyString()))
                .thenReturn(List.of());
        lenient()
                .when(membershipRepository.findUsernamesByTeamIds(anyCollection(), any()))
                .thenReturn(List.of());

        node = nodeSharing(backplane);
    }

    /** Another application instance: its own local cache, the same cluster backplane. */
    private ToolUsageSignalService nodeSharing(KeyValueCache shared) {
        return nodeWith(Optional.of(shared));
    }

    private ToolUsageSignalService nodeWith(Optional<KeyValueCache> shared) {
        return new ToolUsageSignalService(
                usageRepository,
                chainRepository,
                Optional.of(userRepository),
                Optional.of(membershipRepository),
                shared);
    }

    private void teamOf(String username, long teamId, List<String> roster) {
        Team team = new Team();
        team.setId(teamId);
        User user = new User();
        user.setUsername(username);
        user.setTeam(team);
        when(userRepository.findByUsernameIgnoreCase(username)).thenReturn(Optional.of(user));
        lenient()
                .when(userRepository.findUsernamesByTeamIds(eq(List.of(teamId)), any()))
                .thenReturn(roster);
    }

    @Test
    @DisplayName("500 users asking for the global signal cost one install-wide scan")
    void globalFrequencyScansOncePerWindow() {
        for (int i = 0; i < 500; i++) {
            assertThat(node.globalFrequency(10, 20)).containsEntry("compress", 55.0);
        }

        verify(usageRepository, times(1)).sumGlobal(10, 20);
    }

    @Test
    @DisplayName("one scan serves every source tool, so a caller cannot ask for another")
    void transitionsScanOnceForAllSourceTools() {
        for (int i = 0; i < 100; i++) {
            assertThat(node.globalTransitions(10, 20)).containsKey("compare");
        }

        verify(usageRepository, times(1)).edgesGlobal(10, 20);
    }

    @Test
    @DisplayName("a second node reuses the scan the first one paid for")
    void clusterNodesShareOneScan() {
        ToolUsageSignalService otherNode = nodeSharing(backplane);

        assertThat(node.globalFrequency(10, 20)).containsEntry("compress", 55.0);
        assertThat(otherNode.globalFrequency(10, 20)).containsEntry("compress", 55.0);

        verify(usageRepository, times(1)).sumGlobal(10, 20);
    }

    @Test
    @DisplayName("without a shared backplane each node pays for its own scan")
    void separateBackplanesDoNotShare() {
        ToolUsageSignalService otherNode = nodeSharing(new InProcessKeyValueCache());

        node.globalFrequency(10, 20);
        otherNode.globalFrequency(10, 20);

        verify(usageRepository, times(2)).sumGlobal(10, 20);
    }

    @Test
    @DisplayName("no backplane at all still caches locally, since the cluster tier is a bonus")
    void noBackplaneStillCachesLocally() {
        ToolUsageSignalService standalone = nodeWith(Optional.empty());

        assertThat(standalone.globalFrequency(10, 20)).containsEntry("compress", 55.0);
        assertThat(standalone.globalFrequency(10, 20)).containsEntry("compress", 55.0);

        verify(usageRepository, times(1)).sumGlobal(10, 20);
    }

    @Test
    @DisplayName("a broken backplane costs a query, never an error")
    void brokenBackplaneFallsThroughToTheQuery() {
        KeyValueCache broken = mock(KeyValueCache.class);
        when(broken.get(anyString(), anyString())).thenThrow(new RuntimeException("valkey down"));
        lenient()
                .doThrow(new RuntimeException("valkey down"))
                .when(broken)
                .put(anyString(), anyString(), anyString(), any(Duration.class));

        assertThat(nodeSharing(broken).globalFrequency(10, 20)).containsEntry("compress", 55.0);
    }

    @Test
    @DisplayName("team aggregates are shared by every member of that team")
    void teamAggregatesCachePerTeam() {
        TeamScope teamSeven = new TeamScope(List.of(7L), List.of("bob", "carol"), true);
        TeamScope teamEight = new TeamScope(List.of(8L), List.of("dave"), true);

        for (int i = 0; i < 50; i++) {
            node.teamFrequency(teamSeven, 10, 20);
        }
        node.teamFrequency(teamEight, 10, 20);

        verify(usageRepository, times(1)).sumByPrincipals(List.of("bob", "carol"), 10, 20);
        verify(usageRepository, times(1)).sumByPrincipals(List.of("dave"), 10, 20);
    }

    @Test
    @DisplayName("a new day's window is a new cache key, so data does not go stale forever")
    void windowChangeMissesCache() {
        node.globalFrequency(10, 20);
        node.globalFrequency(11, 21);

        verify(usageRepository, times(1)).sumGlobal(10, 20);
        verify(usageRepository, times(1)).sumGlobal(11, 21);
    }

    @Test
    @DisplayName("a transient team lookup failure is not cached as 'this user has no team'")
    void failedTeamResolutionIsNotCached() {
        Team team = new Team();
        team.setId(7L);
        User alice = new User();
        alice.setUsername("alice");
        alice.setTeam(team);
        // Chained, not re-stubbed: re-stubbing would invoke the throwing answer to do it.
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenThrow(new RuntimeException("pool exhausted"))
                .thenReturn(Optional.of(alice));
        when(userRepository.findUsernamesByTeamIds(eq(List.of(7L)), any()))
                .thenReturn(List.of("alice", "bob"));

        TeamScope duringOutage = node.resolveTeamScope("alice");

        assertThat(duringOutage.hasMembers()).isFalse();
        assertThat(duringOutage.resolved()).isFalse();
        assertThat(node.resolveTeamScope("alice").principals()).containsExactly("alice", "bob");
    }

    @Test
    @DisplayName("a successfully resolved team is cached")
    void resolvedTeamIsCached() {
        teamOf("alice", 7L, List.of("alice", "bob"));

        node.resolveTeamScope("alice");
        node.resolveTeamScope("alice");

        verify(userRepository, times(1)).findUsernamesByTeamIds(eq(List.of(7L)), any());
    }

    @Test
    @DisplayName("'this user has no team' is an answer, so it is cached too")
    void emptyTeamResolutionIsCached() {
        when(userRepository.findByUsernameIgnoreCase("solo")).thenReturn(Optional.empty());

        assertThat(node.resolveTeamScope("solo")).isEqualTo(TeamScope.none());
        assertThat(node.resolveTeamScope("solo")).isEqualTo(TeamScope.none());

        verify(userRepository, times(1)).findByUsernameIgnoreCase("solo");
    }
}
