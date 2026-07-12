package stirling.software.proprietary.controller.api;

import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.springframework.security.core.Authentication;
import org.springframework.test.util.ReflectionTestUtils;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.access.model.DefaultAccessPolicy;
import stirling.software.proprietary.access.repository.ResourceGrantRepository;
import stirling.software.proprietary.access.service.DefaultPrincipalResolver;
import stirling.software.proprietary.access.service.MembershipTeamLeadLookup;
import stirling.software.proprietary.access.service.ResourceAccessService;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.model.UserLicenseSettings;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.SessionEntity;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.MfaService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;
import stirling.software.proprietary.service.UserLicenseSettingsService;

import tools.jackson.databind.ObjectMapper;

/** Shared seeding, wiring, and statement-count measurement for the admin-roster query tests. */
class AdminSettingsPerfHarness {

    static final Duration SESSION_TIMEOUT = Duration.ofMinutes(30);
    private static final Instant STALE = Instant.now().minus(Duration.ofHours(2));
    private static final Instant FRESH = Instant.now().minus(Duration.ofMinutes(2));

    record Measure(int users, long statements, long updates, long inserts, long millis) {}

    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;
    private final TeamRepository teamRepository;
    private final TeamMembershipRepository teamMembershipRepository;
    private final ResourceGrantRepository resourceGrantRepository;
    private final EntityManager em;
    private final EntityManagerFactory emf;

    AdminSettingsPerfHarness(
            UserRepository userRepository,
            SessionRepository sessionRepository,
            TeamRepository teamRepository,
            TeamMembershipRepository teamMembershipRepository,
            ResourceGrantRepository resourceGrantRepository,
            EntityManager em,
            EntityManagerFactory emf) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
        this.teamRepository = teamRepository;
        this.teamMembershipRepository = teamMembershipRepository;
        this.resourceGrantRepository = resourceGrantRepository;
        this.em = em;
        this.emf = emf;
    }

    Measure seedAndMeasure(
            ProprietaryUIDataController controller, Authentication auth, int userCount) {
        wipe();
        seed(userCount);
        em.flush();
        em.clear();

        Statistics stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();

        long t0 = System.nanoTime();
        var response = controller.getAdminSettingsData(auth);
        int users = response.getBody().getUsers().size();
        em.flush(); // materialise any writes the GET issued so they are counted
        long millis = (System.nanoTime() - t0) / 1_000_000;

        return new Measure(
                users,
                stats.getPrepareStatementCount(),
                stats.getEntityUpdateCount(),
                stats.getEntityInsertCount(),
                millis);
    }

    void wipe() {
        // Detach anything a prior measure left managed, then delete children before parents.
        em.clear();
        teamMembershipRepository.deleteAllInBatch();
        sessionRepository.deleteAllInBatch();
        resourceGrantRepository.deleteAllInBatch();
        // Not deleteAllInBatch: a bulk DELETE bypasses the User->authorities/user_settings cascade.
        userRepository.deleteAll();
        em.flush();
        teamRepository.deleteAllInBatch();
        em.flush();
        em.clear();
    }

    void seed(int userCount) {
        int teamCount = Math.max(1, userCount / 40);
        List<Team> teams = new ArrayList<>(teamCount);
        for (int i = 0; i < teamCount; i++) {
            Team team = new Team();
            team.setName("team-" + i);
            teams.add(team);
        }
        List<Team> savedTeams = teamRepository.saveAll(teams);
        em.flush();

        List<User> users = new ArrayList<>(userCount);
        List<SessionEntity> sessions = new ArrayList<>(userCount);
        for (int i = 0; i < userCount; i++) {
            User user = new User();
            String username = "user-" + i;
            user.setUsername(username);
            user.setEnabled(true);
            user.setTeam(savedTeams.get(i % teamCount));
            new Authority(i == 0 ? Role.ADMIN.getRoleId() : Role.USER.getRoleId(), user);
            Map<String, String> settings = new HashMap<>();
            settings.put("language", "en-GB");
            if (i % 5 == 0) {
                settings.put("mfaSecret", "SECRET-" + i);
            }
            user.setSettings(settings);
            users.add(user);

            SessionEntity session = new SessionEntity();
            session.setSessionId(UUID.randomUUID().toString());
            session.setPrincipalName(username);
            // ~30% of sessions are past the timeout.
            session.setLastRequest(i % 10 < 3 ? STALE : FRESH);
            session.setExpired(false);
            sessions.add(session);
        }
        List<User> savedUsers = userRepository.saveAll(users);
        sessionRepository.saveAll(sessions);
        em.flush();

        List<TeamMembership> memberships = new ArrayList<>();
        for (int i = 0; i < userCount; i++) {
            if (i % 10 == 0) {
                TeamMembership membership = new TeamMembership();
                membership.setTeam(savedUsers.get(i).getTeam());
                membership.setUser(savedUsers.get(i));
                membership.setRole(TeamRole.LEADER);
                membership.setInvitedAt(LocalDateTime.now());
                memberships.add(membership);
            }
        }
        teamMembershipRepository.saveAll(memberships);
        em.flush();
    }

    ProprietaryUIDataController buildController() {
        ApplicationProperties applicationProperties =
                mock(ApplicationProperties.class, RETURNS_DEEP_STUBS);

        SessionPersistentRegistry sessionRegistry =
                new SessionPersistentRegistry(sessionRepository);
        ReflectionTestUtils.setField(
                sessionRegistry, "defaultMaxInactiveInterval", SESSION_TIMEOUT);

        ResourceAccessService resourceAccessService =
                new ResourceAccessService(
                        resourceGrantRepository,
                        new MembershipTeamLeadLookup(teamMembershipRepository),
                        new DefaultPrincipalResolver());
        ReflectionTestUtils.setField(
                resourceAccessService,
                "portalDefaultPolicy",
                DefaultAccessPolicy.ADMINS_AND_TEAM_LEADS);

        UserLicenseSettingsService licenseSettingsService = mock(UserLicenseSettingsService.class);
        UserLicenseSettings licenseSettings = mock(UserLicenseSettings.class);
        lenient().when(licenseSettings.getLicenseMaxUsers()).thenReturn(0);
        lenient().when(licenseSettingsService.getSettings()).thenReturn(licenseSettings);
        lenient().when(licenseSettingsService.calculateMaxAllowedUsers()).thenReturn(100_000);
        lenient().when(licenseSettingsService.getAvailableUserSlots()).thenReturn(100_000L);
        lenient().when(licenseSettingsService.getDisplayGrandfatheredCount()).thenReturn(0);

        LoginAttemptService loginAttemptService = mock(LoginAttemptService.class);
        lenient().when(loginAttemptService.getAllBlockedUsers()).thenReturn(new ArrayList<>());

        return new ProprietaryUIDataController(
                applicationProperties,
                mock(AuditConfigurationProperties.class),
                sessionRegistry,
                userRepository,
                teamRepository,
                teamMembershipRepository,
                sessionRepository,
                mock(DatabaseServiceInterface.class),
                mock(ObjectMapper.class),
                false,
                licenseSettingsService,
                mock(PersistentAuditEventRepository.class),
                mock(MfaService.class),
                loginAttemptService,
                resourceAccessService);
    }

    Authentication adminAuth() {
        Authentication auth = mock(Authentication.class);
        lenient().when(auth.getName()).thenReturn("user-0");
        return auth;
    }

    User mkUser(String username, Team team, String authority, Map<String, String> settings) {
        User user = new User();
        user.setUsername(username);
        user.setEnabled(true);
        user.setTeam(team);
        new Authority(authority, user);
        user.setSettings(new HashMap<>(settings));
        return user;
    }

    TeamRepository teams() {
        return teamRepository;
    }

    UserRepository users() {
        return userRepository;
    }

    EntityManager em() {
        return em;
    }
}
