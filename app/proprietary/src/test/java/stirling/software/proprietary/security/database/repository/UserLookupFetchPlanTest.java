package stirling.software.proprietary.security.database.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.UUID;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.PersistenceContext;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;

/**
 * {@code findBySupabaseId} runs on every authenticated SaaS request. Both of {@link User}'s
 * associations are EAGER, so without a fetch plan Hibernate resolves them in separate statements —
 * three transatlantic round trips where one would do.
 */
@DataJpaTest
class UserLookupFetchPlanTest {

    @Autowired private UserRepository userRepository;
    @Autowired private TeamRepository teamRepository;
    @Autowired private EntityManagerFactory emf;

    @PersistenceContext private EntityManager em;

    private Long teamId;

    @Test
    void findBySupabaseIdFetchesTeamAndAuthoritiesInOneStatement() {
        UUID supabaseId = seedUser();

        Statistics stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();

        User found = userRepository.findBySupabaseId(supabaseId).orElseThrow();

        assertEquals(
                1L,
                stats.getPrepareStatementCount(),
                "team and authorities must ride the root select, not trail it");
        assertEquals(teamId, found.getTeam().getId());
        assertEquals(1, found.getAuthorities().size());
    }

    @Test
    void associationsAreUsableOnceTheInstanceIsDetached() {
        UUID supabaseId = seedUser();

        User found = userRepository.findBySupabaseId(supabaseId).orElseThrow();
        em.detach(found);

        // The filter chain hands this instance around after its session is gone.
        assertEquals("ROLE_USER", found.getAuthorities().iterator().next().getAuthority());
        assertEquals(teamId, found.getTeam().getId());
    }

    private UUID seedUser() {
        Team team = new Team();
        team.setName("fetch-plan-team");
        teamRepository.saveAndFlush(team);
        teamId = team.getId();

        UUID supabaseId = UUID.randomUUID();
        User user = new User();
        user.setUsername("fetch-plan@example.com");
        user.setEmail("fetch-plan@example.com");
        user.setSupabaseId(supabaseId);
        user.setTeam(team);
        new Authority("ROLE_USER", user);
        userRepository.saveAndFlush(user);

        em.clear();
        return supabaseId;
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.proprietary.security.database.repository",
                "stirling.software.proprietary.security.repository"
            })
    static class TestApp {}
}
