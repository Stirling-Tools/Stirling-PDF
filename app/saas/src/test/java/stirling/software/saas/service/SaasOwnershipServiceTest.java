package stirling.software.saas.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.*;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.*;
import stirling.software.proprietary.service.AuditService;
import stirling.software.saas.accountlink.LinkedInstance;
import stirling.software.saas.accountlink.LinkedInstanceRepository;

@DataJpaTest(
        properties = {
            "spring.jpa.show-sql=false",
            "spring.jpa.properties.hibernate.default_schema=PUBLIC",
            "spring.jpa.properties.hibernate.hbm2ddl.schema_filter_provider=org.hibernate.tool.schema.internal.DefaultSchemaFilterProvider"
        })
@Import(SaasOwnershipService.class)
@ActiveProfiles("saas")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class SaasOwnershipServiceTest {
    @Autowired SaasOwnershipService ownership;
    @Autowired UserRepository users;
    @Autowired TeamRepository teams;
    @Autowired TeamMembershipRepository memberships;
    @Autowired SaasTeamExtensionService extensions;
    @Autowired LinkedInstanceRepository instances;

    private Team team;

    @BeforeEach
    void setup() {
        reset(extensions, instances);
        memberships.deleteAll();
        users.deleteAll();
        teams.deleteAll();
        team = new Team();
        team.setName("Organization");
        team = teams.saveAndFlush(team);
    }

    private User member(String username, TeamRole role) {
        User user = new User();
        user.setUsername(username);
        user.setTeam(team);
        user = users.saveAndFlush(user);
        TeamMembership membership = new TeamMembership();
        membership.setTeam(team);
        membership.setUser(user);
        membership.setRole(role);
        membership.setAcceptedAt(LocalDateTime.now());
        membership.setInvitedAt(LocalDateTime.now());
        memberships.saveAndFlush(membership);
        return user;
    }

    @Test
    void transferConvergesCoLeadersAndKeepsTheTeam() {
        User first = member("first", TeamRole.LEADER);
        member("co-leader", TeamRole.LEADER);
        User target = member("successor", TeamRole.MEMBER);
        ownership.transfer(team.getId(), target.getId(), first);
        assertEquals(1, memberships.countByTeamIdAndRole(team.getId(), TeamRole.LEADER));
        assertTrue(
                memberships
                        .findByTeamIdAndUserId(team.getId(), target.getId())
                        .orElseThrow()
                        .isLeader());
        assertFalse(
                memberships
                        .findByTeamIdAndUserId(team.getId(), first.getId())
                        .orElseThrow()
                        .isLeader());
        assertEquals(team.getId(), users.findById(target.getId()).orElseThrow().getTeam().getId());
    }

    @Test
    void memberCannotTakeOverButCanRecoverAnOwnerlessTeam() {
        User first = member("first", TeamRole.LEADER);
        User second = member("second", TeamRole.MEMBER);
        assertThrows(
                ResponseStatusException.class,
                () -> ownership.transfer(team.getId(), second.getId(), second));
        memberships.delete(
                memberships.findByTeamIdAndUserId(team.getId(), first.getId()).orElseThrow());
        ownership.transfer(team.getId(), second.getId(), second);
        assertEquals(1, memberships.countByTeamIdAndRole(team.getId(), TeamRole.LEADER));
    }

    @Test
    void linkedTeamCannotTransferThroughCloudOrLegacyEntryPoint() {
        User first = member("first", TeamRole.LEADER);
        User target = member("successor", TeamRole.MEMBER);
        when(instances.countByTeamIdAndRevokedAtIsNull(team.getId())).thenReturn(1L);
        var error =
                assertThrows(
                        ResponseStatusException.class,
                        () -> ownership.transfer(team.getId(), target.getId(), first));
        assertEquals(409, error.getStatusCode().value());
        assertEquals("START_TRANSFER_FROM_INSTANCE", error.getReason());
        assertTrue(
                memberships
                        .findByTeamIdAndUserId(team.getId(), first.getId())
                        .orElseThrow()
                        .isLeader());
        assertFalse(
                memberships
                        .findByTeamIdAndUserId(team.getId(), target.getId())
                        .orElseThrow()
                        .isLeader());
    }

    @Test
    void authenticatedInstanceCanTransferItsLinkedTeam() {
        User first = member("first", TeamRole.LEADER);
        User target = member("successor", TeamRole.MEMBER);
        LinkedInstance instance = new LinkedInstance();
        instance.setDeviceId("device");
        instance.setTeamId(team.getId());
        when(instances.findByDeviceIdAndRevokedAtIsNull("device"))
                .thenReturn(Optional.of(instance));
        ownership.transferFromInstance(team.getId(), target.getId(), first, instance);
        assertFalse(
                memberships
                        .findByTeamIdAndUserId(team.getId(), first.getId())
                        .orElseThrow()
                        .isLeader());
        assertTrue(
                memberships
                        .findByTeamIdAndUserId(team.getId(), target.getId())
                        .orElseThrow()
                        .isLeader());
    }

    @Test
    void revokedOrDifferentTeamInstanceCannotAuthorizeTransfer() {
        User first = member("first", TeamRole.LEADER);
        User target = member("successor", TeamRole.MEMBER);
        LinkedInstance instance = new LinkedInstance();
        instance.setDeviceId("device");
        instance.setTeamId(team.getId());
        assertEquals(
                "LINK_CHANGED",
                assertThrows(
                                ResponseStatusException.class,
                                () ->
                                        ownership.transferFromInstance(
                                                team.getId(), target.getId(), first, instance))
                        .getReason());
        instance.setTeamId(-1L);
        when(instances.findByDeviceIdAndRevokedAtIsNull("device"))
                .thenReturn(Optional.of(instance));
        assertEquals(
                "LINK_CHANGED",
                assertThrows(
                                ResponseStatusException.class,
                                () ->
                                        ownership.transferFromInstance(
                                                team.getId(), target.getId(), first, instance))
                        .getReason());
        assertTrue(
                memberships
                        .findByTeamIdAndUserId(team.getId(), first.getId())
                        .orElseThrow()
                        .isLeader());
    }

    @Test
    void linkedOwnerlessTeamCanStillRecoverOwnership() {
        User target = member("successor", TeamRole.MEMBER);
        when(instances.countByTeamIdAndRevokedAtIsNull(team.getId())).thenReturn(1L);
        ownership.transfer(team.getId(), target.getId(), target);
        assertTrue(
                memberships
                        .findByTeamIdAndUserId(team.getId(), target.getId())
                        .orElseThrow()
                        .isLeader());
    }

    @Test
    void rejectsPersonalTeamAndNonMember() {
        User first = member("first", TeamRole.LEADER);
        when(extensions.isPersonal(any())).thenReturn(true);
        assertThrows(
                ResponseStatusException.class,
                () -> ownership.transfer(team.getId(), first.getId(), first));
        when(extensions.isPersonal(any())).thenReturn(false);
        assertThrows(
                ResponseStatusException.class, () -> ownership.transfer(team.getId(), 999L, first));
    }

    @Test
    void activeTeamResolutionIgnoresOlderPersonalMembership() {
        User member = member("invited", TeamRole.LEADER);
        Team shared = new Team();
        shared.setName("Shared");
        shared = teams.saveAndFlush(shared);
        TeamMembership joined = new TeamMembership();
        joined.setUser(member);
        joined.setTeam(shared);
        joined.setRole(TeamRole.LEADER);
        joined.setAcceptedAt(LocalDateTime.now());
        joined.setInvitedAt(LocalDateTime.now());
        memberships.saveAndFlush(joined);
        member.setTeam(shared);
        users.saveAndFlush(member);
        var resolver = new stirling.software.saas.security.UserTeamResolver(memberships);
        assertEquals(Optional.of(shared.getId()), resolver.teamId(member));
        assertTrue(resolver.isLeader(member));
    }

    @Test
    void concurrentTransfersCannotCreateTwoLeaders() throws Exception {
        User first = member("first", TeamRole.LEADER);
        User second = member("second", TeamRole.MEMBER);
        User third = member("third", TeamRole.MEMBER);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Boolean>> attempts = new ArrayList<>();
            for (User target : List.of(second, third))
                attempts.add(
                        executor.submit(
                                () -> {
                                    start.await();
                                    try {
                                        ownership.transfer(team.getId(), target.getId(), first);
                                        return true;
                                    } catch (ResponseStatusException e) {
                                        return false;
                                    }
                                }));
            start.countDown();
            int successes = 0;
            for (Future<Boolean> attempt : attempts)
                if (attempt.get(10, TimeUnit.SECONDS)) successes++;
            assertEquals(1, successes);
            assertEquals(1, memberships.countByTeamIdAndRole(team.getId(), TeamRole.LEADER));
        }
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
    static class TestApp {
        @Bean
        LinkedInstanceRepository instances() {
            return mock(LinkedInstanceRepository.class);
        }

        @Bean
        SaasTeamExtensionService extensions() {
            return mock(SaasTeamExtensionService.class);
        }

        @Bean
        AuditService audit() {
            return mock(AuditService.class);
        }
    }
}
