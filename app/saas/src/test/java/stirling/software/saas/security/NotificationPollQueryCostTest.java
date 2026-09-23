package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManagerFactory;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.failure.AcknowledgeAction;
import stirling.software.proprietary.failure.DismissAction;
import stirling.software.proprietary.failure.FailureActionRegistry;
import stirling.software.proprietary.failure.FailureKind;
import stirling.software.proprietary.failure.FileRunEventRepository;
import stirling.software.proprietary.failure.FileRunEventService;
import stirling.software.proprietary.failure.FileRunEventStore;
import stirling.software.proprietary.failure.RecordFailure;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.notification.NotificationController;
import stirling.software.proprietary.notification.NotificationService;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

@DataJpaTest
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class NotificationPollQueryCostTest {

    private static final String EMAIL = "leader@example.com";

    @Autowired private UserRepository users;
    @Autowired private TeamRepository teams;
    @Autowired private TeamMembershipRepository memberships;
    @Autowired private FileRunEventRepository events;
    @Autowired private EntityManagerFactory emf;

    @AfterEach
    void wipe() {
        SecurityContextHolder.clearContext();
        events.deleteAllInBatch();
        memberships.deleteAllInBatch();
        users.deleteAll();
        teams.deleteAllInBatch();
    }

    @Test
    void aPollCostsTheSameWhateverTheBellHolds() {
        Poll few = measure(2);
        wipe();
        Poll many = measure(20);

        System.out.printf(
                "%n[bell poll] %d rows -> %d statements, %d connection checkouts%n"
                        + "[bell poll] %d rows -> %d statements, %d connection checkouts%n",
                few.rows(),
                few.statements(),
                few.checkouts(),
                many.rows(),
                many.statements(),
                many.checkouts());
        assertThat(many.rows()).isEqualTo(20);
        assertThat(many.statements()).isEqualTo(few.statements());
        assertThat(many.checkouts()).isEqualTo(few.checkouts());
    }

    private record Poll(int rows, long statements, long checkouts) {}

    private Poll measure(int rows) {
        Team team = new Team();
        team.setName("acme");
        team = teams.save(team);
        UUID supabaseId = UUID.randomUUID();
        User leader = new User();
        leader.setUsername(EMAIL);
        leader.setEmail(EMAIL);
        leader.setEnabled(true);
        leader.setTeam(team);
        leader.setSupabaseId(supabaseId);
        new Authority(Role.USER.getRoleId(), leader);
        leader = users.save(leader);
        TeamMembership membership = new TeamMembership();
        membership.setTeam(team);
        membership.setUser(leader);
        membership.setRole(TeamRole.LEADER);
        membership.setInvitedAt(LocalDateTime.now());
        memberships.save(membership);

        FileRunEventStore store = new FileRunEventStore(events);
        for (int i = 0; i < rows; i++) {
            store.record(
                    RecordFailure.forEditor(
                            FailureKind.UNKNOWN, team.getId(), EMAIL, "f-" + i, "x"));
        }

        NotificationController bell = bellFor(store);
        SecurityContextHolder.getContext().setAuthentication(jwtFor(supabaseId, leader));

        Statistics stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();
        int seen = bell.list(50).notifications().size();
        return new Poll(seen, stats.getPrepareStatementCount(), stats.getConnectCount());
    }

    private NotificationController bellFor(FileRunEventStore store) {
        UserService userService = mock(UserService.class);
        when(userService.findBySupabaseId(any()))
                .thenAnswer(call -> users.findBySupabaseId(call.getArgument(0)));
        TeamSecurityExpressions teamSecurity =
                new TeamSecurityExpressions(
                        memberships, userService, new UserTeamResolver(memberships));
        UserServiceInterface names = mock(UserServiceInterface.class);
        when(names.getCurrentUsername()).thenReturn(EMAIL);
        ApplicationProperties props = new ApplicationProperties();
        props.getSecurity().setEnableLogin(true);
        FileRunEventService failures =
                new FileRunEventService(
                        store,
                        new FailureActionRegistry(
                                List.of(new AcknowledgeAction(store), new DismissAction(store))),
                        new TeamLeaderPolicyManagementAuthority(teamSecurity),
                        names,
                        props,
                        mock(PolicyStore.class));
        return new NotificationController(
                new NotificationService(failures, mock(StoredFileRepository.class)));
    }

    private static EnhancedJwtAuthenticationToken jwtFor(UUID supabaseId, User user) {
        Jwt jwt =
                Jwt.withTokenValue("token")
                        .header("alg", "none")
                        .subject(supabaseId.toString())
                        .claim("email", EMAIL)
                        .build();
        return new EnhancedJwtAuthenticationToken(
                jwt,
                List.of(new SimpleGrantedAuthority("ROLE_USER")),
                EMAIL,
                supabaseId.toString(),
                user);
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model",
                "stirling.software.proprietary.access.model",
                "stirling.software.proprietary.failure"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.proprietary.security.database.repository",
                "stirling.software.proprietary.security.repository",
                "stirling.software.proprietary.failure"
            })
    static class TestApp {}
}
