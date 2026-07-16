package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.security.core.Authentication;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.PersistenceContext;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.access.repository.ResourceGrantRepository;
import stirling.software.proprietary.controller.api.AdminSettingsPerfHarness.Measure;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.dto.AdminUserSummary;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;

/** Admin roster issues a constant query count regardless of size (H2). */
@DataJpaTest
class AdminSettingsQueryPerfTest {

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
    void queryCountDoesNotScaleWithUsers() {
        AdminSettingsPerfHarness harness = harness();
        ProprietaryUIDataController controller = harness.buildController();
        Authentication admin = harness.adminAuth();

        Measure small = harness.seedAndMeasure(controller, admin, 150);
        Measure large = harness.seedAndMeasure(controller, admin, 750);

        System.out.printf(
                "%n[admin-settings scaling] N=%d -> %d statements, %d updates, %d ms%n",
                small.users(), small.statements(), small.updates(), small.millis());
        System.out.printf(
                "[admin-settings scaling] N=%d -> %d statements, %d updates, %d ms%n",
                large.users(), large.statements(), large.updates(), large.millis());
        long delta = large.statements() - small.statements();
        System.out.printf(
                "[admin-settings scaling] +%d users cost +%d statements%n",
                large.users() - small.users(), delta);

        assertTrue(
                delta <= 40,
                "admin-settings issues per-user queries: adding "
                        + (large.users() - small.users())
                        + " users added "
                        + delta
                        + " SQL statements (expected <= 40). The roster endpoint still scales O(N).");
        assertEquals(
                0,
                large.updates(),
                "admin-settings performed " + large.updates() + " row UPDATEs during a read (GET)");
    }

    @Test
    void headlineBenchmark() {
        int n = Integer.getInteger("adminBenchUsers", 2000);
        AdminSettingsPerfHarness harness = harness();
        ProprietaryUIDataController controller = harness.buildController();

        Measure m = harness.seedAndMeasure(controller, harness.adminAuth(), n);
        System.out.printf(
                "%n==== admin-settings headline (N=%d users) ====%n"
                        + "  SQL statements : %d%n"
                        + "  row UPDATEs    : %d%n"
                        + "  row INSERTs    : %d%n"
                        + "  wall-clock     : %d ms%n"
                        + "  statements/user: %.2f%n"
                        + "==============================================%n",
                m.users(),
                m.statements(),
                m.updates(),
                m.inserts(),
                m.millis(),
                (double) m.statements() / n);

        assertEquals(n, m.users(), "roster should return every seeded (non-internal) user");
    }

    @Test
    void rosterExcludesInternalAccountsAndMasksSecrets() {
        AdminSettingsPerfHarness harness = harness();
        ProprietaryUIDataController controller = harness.buildController();
        harness.wipe();

        Team acme = new Team();
        acme.setName("acme");
        Team internal = new Team();
        internal.setName(TeamService.INTERNAL_TEAM_NAME);
        List<Team> savedTeams = harness.teams().saveAll(List.of(acme, internal));
        harness.em().flush();

        User adminUser =
                harness.mkUser("admin", savedTeams.get(0), Role.ADMIN.getRoleId(), Map.of());
        User mfaUser =
                harness.mkUser(
                        "mfa-user",
                        savedTeams.get(0),
                        Role.USER.getRoleId(),
                        Map.of("mfaSecret", "TOPSECRET", "language", "fr"));
        User apiUser =
                harness.mkUser(
                        "internal-api",
                        savedTeams.get(0),
                        Role.INTERNAL_API_USER.getRoleId(),
                        Map.of());
        User internalTeamUser =
                harness.mkUser("internal-team", savedTeams.get(1), Role.USER.getRoleId(), Map.of());
        harness.users().saveAll(List.of(adminUser, mfaUser, apiUser, internalTeamUser));
        harness.em().flush();
        harness.em().clear();

        Authentication auth = mock(Authentication.class);
        lenient().when(auth.getName()).thenReturn("admin");
        ProprietaryUIDataController.AdminSettingsData data =
                controller.getAdminSettingsData(auth).getBody();

        Set<String> usernames =
                data.getUsers().stream()
                        .map(AdminUserSummary::getUsername)
                        .collect(Collectors.toSet());
        assertTrue(usernames.contains("admin"));
        assertTrue(usernames.contains("mfa-user"));
        assertFalse(usernames.contains("internal-api"), "internal-api user must be excluded");
        assertFalse(usernames.contains("internal-team"), "internal-team user must be excluded");
        assertEquals(2, data.getTotalUsers());

        Map<String, String> mfaSettings = data.getUserSettings().get("mfa-user");
        assertEquals("********", mfaSettings.get("mfaSecret"), "mfaSecret must be masked");
        assertEquals("fr", mfaSettings.get("language"), "non-secret settings preserved");

        AdminUserSummary adminSummary =
                data.getUsers().stream()
                        .filter(u -> "admin".equals(u.getUsername()))
                        .findFirst()
                        .orElseThrow();
        assertTrue(adminSummary.isPortalAccess(), "admin should have portal access");
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
