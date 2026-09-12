package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.github.benmanes.caffeine.cache.Caffeine;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.repository.ToolChainStatRepository;
import stirling.software.proprietary.repository.ToolUsageStatRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.ToolUsageSignalService.TeamScope;

/**
 * The team and install-wide aggregates are the only expensive queries in this feature. These tests
 * run the service behind a real Spring cache proxy to prove many users cost one scan, not one each.
 */
class ToolUsageSignalCachingTest {

    private static ToolUsageStatRepository usageRepository;
    private static ToolChainStatRepository chainRepository;
    private static UserRepository userRepository;

    private AnnotationConfigApplicationContext context;
    private ToolUsageSignalService service;

    @Configuration
    @EnableCaching
    static class CachingTestConfig {

        @Bean
        CacheManager cacheManager() {
            CaffeineCacheManager manager = new CaffeineCacheManager();
            manager.setCaffeine(
                    Caffeine.newBuilder()
                            .maximumSize(1000)
                            .expireAfterWrite(Duration.ofMinutes(5)));
            return manager;
        }

        @Bean
        ToolUsageSignalService toolUsageSignalService() {
            return new ToolUsageSignalService(
                    usageRepository, chainRepository, Optional.of(userRepository));
        }
    }

    @BeforeEach
    void setUp() {
        usageRepository = mock(ToolUsageStatRepository.class);
        chainRepository = mock(ToolChainStatRepository.class);
        userRepository = mock(UserRepository.class);
        when(usageRepository.sumGlobal(anyLong(), anyLong()))
                .thenReturn(List.<Object[]>of(new Object[] {"compress", 5L, 50L}));
        when(usageRepository.sumByFrom(anyString(), anyLong(), anyLong()))
                .thenReturn(List.<Object[]>of(new Object[] {"ocr", 2L, 8L}));
        when(usageRepository.sumByPrincipals(anyCollection(), anyLong(), anyLong()))
                .thenReturn(List.<Object[]>of(new Object[] {"merge", 1L, 4L}));

        context = new AnnotationConfigApplicationContext(CachingTestConfig.class);
        service = context.getBean(ToolUsageSignalService.class);
    }

    @AfterEach
    void tearDown() {
        context.close();
    }

    @Test
    @DisplayName("500 users asking for the global signal cost one install-wide scan")
    void globalFrequencyScansOncePerWindow() {
        for (int i = 0; i < 500; i++) {
            assertThat(service.globalFrequency(10, 20)).containsEntry("compress", 55.0);
        }

        verify(usageRepository, times(1)).sumGlobal(10, 20);
    }

    @Test
    @DisplayName("global transitions cache per source tool, not per user")
    void globalTransitionsCachePerFromTool() {
        for (int i = 0; i < 100; i++) {
            service.globalTransitions("compare", 10, 20);
            service.globalTransitions("merge", 10, 20);
        }

        verify(usageRepository, times(1)).sumByFrom("compare", 10, 20);
        verify(usageRepository, times(1)).sumByFrom("merge", 10, 20);
    }

    @Test
    @DisplayName("team aggregates are shared by every member of that team")
    void teamAggregatesCachePerTeam() {
        TeamScope teamSeven = new TeamScope(7L, List.of("bob", "carol"));
        TeamScope teamEight = new TeamScope(8L, List.of("dave"));

        for (int i = 0; i < 50; i++) {
            service.teamFrequency(teamSeven, 10, 20);
        }
        service.teamFrequency(teamEight, 10, 20);

        verify(usageRepository, times(1)).sumByPrincipals(List.of("bob", "carol"), 10, 20);
        verify(usageRepository, times(1)).sumByPrincipals(List.of("dave"), 10, 20);
    }

    @Test
    @DisplayName("a new day's window is a new cache key, so data does not go stale forever")
    void windowChangeMissesCache() {
        service.globalFrequency(10, 20);
        service.globalFrequency(11, 21);

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
        User bob = new User();
        bob.setUsername("bob");
        bob.setTeam(team);
        when(userRepository.findByUsernameIgnoreCase("alice"))
                .thenThrow(new RuntimeException("pool exhausted"))
                .thenReturn(Optional.of(alice));
        when(userRepository.findAllByTeamId(7L)).thenReturn(List.of(alice, bob));

        TeamScope duringOutage = service.resolveTeamScope("alice");
        TeamScope afterRecovery = service.resolveTeamScope("alice");

        assertThat(duringOutage.hasMembers()).isFalse();
        assertThat(afterRecovery.principals()).containsExactly("alice", "bob");
    }

    @Test
    @DisplayName("a successfully resolved team is cached")
    void resolvedTeamIsCached() {
        Team team = new Team();
        team.setId(7L);
        User alice = new User();
        alice.setUsername("alice");
        alice.setTeam(team);
        User bob = new User();
        bob.setUsername("bob");
        bob.setTeam(team);
        when(userRepository.findByUsernameIgnoreCase("alice")).thenReturn(Optional.of(alice));
        when(userRepository.findAllByTeamId(7L)).thenReturn(List.of(alice, bob));

        service.resolveTeamScope("alice");
        service.resolveTeamScope("alice");

        verify(userRepository, times(1)).findAllByTeamId(7L);
    }
}
