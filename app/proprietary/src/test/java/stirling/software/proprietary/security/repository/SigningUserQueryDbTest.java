package stirling.software.proprietary.security.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

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

import stirling.software.common.model.api.security.UserSummaryDTO;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;

@DataJpaTest(
        showSql = false,
        properties = "spring.jpa.properties.hibernate.generate_statistics=true")
class SigningUserQueryDbTest {

    @Autowired private UserRepository userRepository;
    @Autowired private EntityManagerFactory entityManagerFactory;
    @PersistenceContext private EntityManager entityManager;

    @Test
    void filtersRecipientsInDatabaseAndPreservesSummaryContract() {
        Team alpha = team("alpha");
        Team beta = team("beta");
        User alice = user("alice", true, alpha);
        user("bob", null, alpha);
        user("disabled", false, alpha);
        User anonymous = user("anonymous", true, alpha);
        anonymous.setAuthenticationType(AuthenticationType.ANONYMOUS);
        user("other-team", true, beta);
        user("no-team", true, null);
        user(null, null, alpha);
        user(null, true, alpha).setAuthenticationType(AuthenticationType.WEB);
        user(null, true, null);
        flushAndClear();

        List<UserSummaryDTO> members =
                userRepository.findEnabledSigningUsersByTeamId(alpha.getId());
        assertThat(members).extracting(UserSummaryDTO::getUsername).containsExactly("alice", "bob");
        assertThat(members.getFirst())
                .isEqualTo(new UserSummaryDTO(alice.getId(), "alice", "alice", "alpha", true));
        assertThat(members).allMatch(UserSummaryDTO::isEnabled);
        assertThat(userRepository.findEnabledSigningUsers())
                .extracting(UserSummaryDTO::getUsername)
                .containsExactly("alice", "bob", "no-team", "other-team");
        assertThat(userRepository.findEnabledSigningUsersByTeamId(-1L)).isEmpty();
    }

    @Test
    void pickerUsesOneStatementAndNoEntitiesAsUserCountGrows() {
        Team alpha = team("alpha");
        Team beta = team("beta");
        for (int i = 0; i < 100; i++) {
            User user = user("member-" + i, true, alpha);
            entityManager.persist(new Authority("ROLE_USER", user));
        }
        user("unrelated", true, beta);
        flushAndClear();

        assertSingleSummaryQuery(alpha.getId(), 100, 101);
        for (int i = 100; i < 400; i++) {
            User user =
                    user(
                            "member-" + i,
                            true,
                            entityManager.getReference(Team.class, alpha.getId()));
            entityManager.persist(new Authority("ROLE_USER", user));
        }
        flushAndClear();
        assertSingleSummaryQuery(alpha.getId(), 400, 401);
    }

    private void assertSingleSummaryQuery(Long teamId, int teamCount, int totalCount) {
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        assertThat(userRepository.findEnabledSigningUsersByTeamId(teamId)).hasSize(teamCount);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
        assertThat(statistics.getEntityLoadCount()).isZero();
        statistics.clear();
        assertThat(userRepository.findEnabledSigningUsers()).hasSize(totalCount);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
        assertThat(statistics.getEntityLoadCount()).isZero();
    }

    private Team team(String name) {
        Team team = new Team();
        team.setName(name);
        entityManager.persist(team);
        return team;
    }

    private User user(String username, Boolean enabled, Team team) {
        User user = new User();
        user.setUsername(username);
        user.setEnabled(enabled);
        user.setTeam(team);
        entityManager.persist(user);
        return user;
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
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
