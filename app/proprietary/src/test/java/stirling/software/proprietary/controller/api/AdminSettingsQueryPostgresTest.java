package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.PersistenceContext;

import stirling.software.proprietary.access.repository.ResourceGrantRepository;
import stirling.software.proprietary.controller.api.AdminSettingsPerfHarness.Measure;
import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.repository.TeamRepository;

/** Admin-roster queries + index DDL on real Postgres (skipped without Docker). */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
class AdminSettingsQueryPostgresTest {

    @Container
    static PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
        registry.add("spring.jpa.properties.hibernate.default_batch_fetch_size", () -> "100");
    }

    @Autowired private UserRepository userRepository;
    @Autowired private SessionRepository sessionRepository;
    @Autowired private TeamRepository teamRepository;
    @Autowired private TeamMembershipRepository teamMembershipRepository;
    @Autowired private ResourceGrantRepository resourceGrantRepository;
    @Autowired private EntityManagerFactory emf;

    @PersistenceContext private EntityManager em;

    private AdminSettingsPerfHarness harness() {
        return new AdminSettingsPerfHarness(
                userRepository,
                sessionRepository,
                teamRepository,
                teamMembershipRepository,
                resourceGrantRepository,
                em,
                emf);
    }

    @Test
    void newRosterQueriesRunOnPostgresWithConstantScaling() {
        AdminSettingsPerfHarness harness = harness();
        ProprietaryUIDataController controller = harness.buildController();
        Authentication admin = harness.adminAuth();

        Measure small = harness.seedAndMeasure(controller, admin, 100);
        Measure large = harness.seedAndMeasure(controller, admin, 400);

        System.out.printf(
                "%n[admin-settings postgres] N=%d -> %d statements, %d updates, %d ms%n",
                small.users(), small.statements(), small.updates(), small.millis());
        System.out.printf(
                "[admin-settings postgres] N=%d -> %d statements, %d updates, %d ms%n",
                large.users(), large.statements(), large.updates(), large.millis());

        assertEquals(400, large.users(), "roster returns every seeded user on Postgres");
        assertTrue(
                large.statements() - small.statements() <= 40,
                "roster must not scale per-user on Postgres (delta="
                        + (large.statements() - small.statements())
                        + ")");
        assertEquals(0, large.updates(), "no writes during the GET on Postgres");
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model",
                "stirling.software.proprietary.access.model"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.proprietary.security.database.repository",
                "stirling.software.proprietary.security.repository",
                "stirling.software.proprietary.access.repository"
            })
    static class TestApp {}
}
