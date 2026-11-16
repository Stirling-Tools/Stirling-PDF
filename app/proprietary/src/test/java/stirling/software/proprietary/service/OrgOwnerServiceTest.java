package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.*;
import java.util.concurrent.*;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.accountlink.*;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.*;
import stirling.software.proprietary.security.repository.OrgOwnerRepository;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;

@DataJpaTest(properties = "spring.jpa.show-sql=false")
@Import({
    OrgOwnerService.class,
    OwnershipHandoverService.class,
    ConnectService.class,
    AccountLinkService.class,
    DeviceCredentialStore.class
})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class OrgOwnerServiceTest {
    @Autowired OrgOwnerService owners;
    @Autowired OrgOwnerRepository ownerRepository;
    @Autowired UserRepository users;
    @Autowired PlatformTransactionManager transactions;
    @Autowired OwnershipHandoverService handovers;
    @Autowired DeviceCredentialRepository credentials;
    @Autowired AccountLinkClient cloud;
    @Autowired ConnectService connect;
    @Autowired AccountLinkService accountLink;
    @Autowired ConnectStateRepository connectStates;

    @BeforeEach
    void clear() {
        reset(credentials, cloud, connectStates);
        new TransactionTemplate(transactions)
                .executeWithoutResult(
                        s -> {
                            ownerRepository.deleteAll();
                            users.deleteAll();
                        });
    }

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    private User user(String name, String role, boolean firstLogin, boolean enabled) {
        User user = new User();
        user.setUsername(name);
        user.setEnabled(enabled);
        user.setFirstLogin(firstLogin);
        user.addAuthority(new Authority(role, user));
        return users.saveAndFlush(user);
    }

    private UsernamePasswordAuthenticationToken auth(User u) {
        return new UsernamePasswordAuthenticationToken(u.getUsername(), "", u.getAuthorities());
    }

    @Test
    void readsNeverElectAndReconcilePrefersActivatedAdmin() {
        user("bootstrap", Role.ADMIN.getRoleId(), true, true);
        user("disabled", Role.ADMIN.getRoleId(), false, false);
        User human = user("human", Role.ADMIN.getRoleId(), false, true);
        assertTrue(owners.ownerId().isEmpty());
        assertEquals(0, ownerRepository.count());
        owners.resolveOwner();
        assertEquals(Optional.of(human.getId()), owners.ownerId());
        owners.resolveOwner();
        assertEquals(1, ownerRepository.count());
    }

    @Test
    void transferPromotesTargetAndProtectsOnlyNewOwner() {
        User first = user("first", Role.ADMIN.getRoleId(), false, true);
        User second = user("second", Role.USER.getRoleId(), false, true);
        owners.resolveOwner();
        assertThrows(ResponseStatusException.class, () -> owners.protect(first.getId(), false));
        owners.transfer(second.getId(), auth(first));
        assertEquals(Optional.of(second.getId()), owners.ownerId());
        assertEquals(
                Role.ADMIN.getRoleId(),
                users.findById(second.getId()).orElseThrow().getRolesAsString());
        assertEquals(
                Role.ADMIN.getRoleId(),
                users.findById(first.getId()).orElseThrow().getRolesAsString());
        assertDoesNotThrow(() -> owners.protect(first.getId(), false));
        assertThrows(ResponseStatusException.class, () -> owners.protect(second.getId(), true));
        SecurityContextHolder.getContext().setAuthentication(auth(second));
        assertDoesNotThrow(() -> owners.protect(second.getId(), true));
    }

    @Test
    void renamePreservesOwnerAndRestoreMismatchReconciles() {
        User first = user("first", Role.ADMIN.getRoleId(), false, true);
        User second = user("second", Role.ADMIN.getRoleId(), false, true);
        owners.resolveOwner();
        owners.transfer(second.getId(), auth(first));
        new TransactionTemplate(transactions)
                .executeWithoutResult(
                        s -> {
                            owners.renamed(second.getId(), "renamed");
                            User current = users.findById(second.getId()).orElseThrow();
                            current.setUsername("renamed");
                        });
        assertEquals(Optional.of(second.getId()), owners.ownerId());
        new TransactionTemplate(transactions)
                .executeWithoutResult(
                        s ->
                                users.findById(second.getId())
                                        .orElseThrow()
                                        .setUsername("restored-other-person"));
        assertTrue(owners.ownerId().isEmpty());
        owners.resolveOwner();
        assertEquals(Optional.of(first.getId()), owners.ownerId());
    }

    @Test
    void refusesInvalidTargetsAndStaleCaller() {
        User first = user("first", Role.ADMIN.getRoleId(), false, true);
        User pending = user("pending", Role.USER.getRoleId(), true, true);
        User disabled = user("disabled", Role.USER.getRoleId(), false, false);
        User internal = user("internal", Role.INTERNAL_API_USER.getRoleId(), false, true);
        owners.resolveOwner();
        for (User target : List.of(first, pending, disabled, internal))
            assertThrows(
                    ResponseStatusException.class,
                    () -> owners.transfer(target.getId(), auth(first)));
        assertThrows(
                ResponseStatusException.class, () -> owners.transfer(first.getId(), auth(pending)));
        assertEquals(Optional.of(first.getId()), owners.ownerId());
    }

    @Test
    void concurrentTransfersHaveOneWinner() throws Exception {
        User first = user("first", Role.ADMIN.getRoleId(), false, true);
        User second = user("second", Role.ADMIN.getRoleId(), false, true);
        User third = user("third", Role.ADMIN.getRoleId(), false, true);
        owners.resolveOwner();
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(2);
            List<Future<Boolean>> attempts = new ArrayList<>();
            for (User target : List.of(second, third))
                attempts.add(
                        executor.submit(
                                () -> {
                                    try {
                                        return new TransactionTemplate(transactions)
                                                .execute(
                                                        status -> {
                                                            assertEquals(
                                                                    Optional.of(first.getId()),
                                                                    owners.ownerId());
                                                            start.countDown();
                                                            try {
                                                                assertTrue(
                                                                        start.await(
                                                                                5,
                                                                                TimeUnit.SECONDS));
                                                            } catch (InterruptedException e) {
                                                                Thread.currentThread().interrupt();
                                                                throw new IllegalStateException(e);
                                                            }
                                                            owners.transfer(
                                                                    target.getId(), auth(first));
                                                            return true;
                                                        });
                                    } catch (ResponseStatusException e) {
                                        return false;
                                    }
                                }));
            int success = 0;
            for (Future<Boolean> attempt : attempts)
                if (attempt.get(10, TimeUnit.SECONDS)) success++;
            assertEquals(1, success);
            assertEquals(1, ownerRepository.count());
        }
    }

    @Test
    void recoveryPromotesAndEnablesWithoutCrashingForBadUser() {
        User first = user("first", Role.ADMIN.getRoleId(), false, true);
        User target = user("recovery", Role.USER.getRoleId(), false, false);
        owners.reconcile("missing");
        assertEquals(Optional.of(first.getId()), owners.ownerId());
        owners.reconcile("");
        assertEquals(Optional.of(first.getId()), owners.ownerId());
        owners.reconcile("recovery");
        assertEquals(Optional.of(target.getId()), owners.ownerId());
    }

    @Test
    void linkedHandoverPersistsAndOriginalEndpointEnforcesCloudFirst() throws Exception {
        User first = user("first", Role.ADMIN.getRoleId(), false, true);
        User second = user("second", Role.USER.getRoleId(), false, true);
        second.setEmail("second@example.com");
        users.saveAndFlush(second);
        owners.resolveOwner();
        DeviceCredential device = new DeviceCredential();
        device.setDeviceId("device");
        device.setTeamId(9L);
        when(credentials.findCredential()).thenReturn(Optional.of(device));
        when(cloud.ownershipCandidates(device))
                .thenReturn(
                        new stirling.software.proprietary.accountlink.CloudOwnershipCandidates(
                                9L,
                                "Cloud team",
                                java.util.List.of(
                                        new stirling.software.proprietary.accountlink
                                                .CloudOwnershipCandidates.Member(
                                                20L,
                                                "Second cloud account",
                                                "second@example.com"))));
        when(cloud.ownership(
                        any(),
                        eq("second@example.com"),
                        isNull(),
                        eq("status"),
                        isNull(),
                        nullable(Long.class)))
                .thenReturn(
                        new CloudOwnershipStatus(
                                9L,
                                "Cloud team",
                                10L,
                                20L,
                                2L,
                                true,
                                CloudOwnershipStatus.State.READY));
        assertThrows(
                ResponseStatusException.class, () -> owners.transfer(second.getId(), auth(first)));
        handovers.prepare(
                second.getId(), new OwnershipHandoverService.Selection(20L, null), auth(first));
        assertEquals(
                second.getId(), ownerRepository.findById(1L).orElseThrow().getHandoverTargetId());
        assertEquals(20L, ownerRepository.findById(1L).orElseThrow().getHandoverCloudUserId());
        assertEquals(
                "second@example.com",
                ownerRepository.findById(1L).orElseThrow().getHandoverCloudEmail());
        assertThrows(
                ResponseStatusException.class, () -> owners.transfer(second.getId(), auth(first)));
        assertEquals(Optional.of(first.getId()), owners.ownerId());
        when(cloud.ownership(
                        any(),
                        eq("second@example.com"),
                        isNull(),
                        eq("status"),
                        isNull(),
                        nullable(Long.class)))
                .thenReturn(
                        new CloudOwnershipStatus(
                                9L,
                                "Cloud team",
                                20L,
                                20L,
                                2L,
                                true,
                                CloudOwnershipStatus.State.TRANSFERRED));
        owners.transfer(second.getId(), auth(first));
        assertEquals(Optional.of(second.getId()), owners.ownerId());
        assertNull(ownerRepository.findById(1L).orElseThrow().getHandoverTargetId());
        assertEquals(
                Role.ADMIN.getRoleId(),
                users.findById(first.getId()).orElseThrow().getRolesAsString());
        assertEquals(
                Role.ADMIN.getRoleId(),
                users.findById(second.getId()).orElseThrow().getRolesAsString());
    }

    @Test
    void caseVariantAdminCannotLinkUnlinkOrAppearAsOwner() {
        User owner = user("alice", Role.ADMIN.getRoleId(), false, true);
        User other = user("Alice", Role.ADMIN.getRoleId(), false, true);
        owners.resolveOwner();
        var hint = new ConnectService.CallbackHint(null, null, "https://pdf.example.com");
        for (var authentication :
                List.of(
                        auth(other),
                        new UsernamePasswordAuthenticationToken(
                                other, "", other.getAuthorities()))) {
            SecurityContextHolder.getContext().setAuthentication(authentication);
            assertFalse(owners.isCurrentUser(authentication));
            assertEquals(
                    403,
                    assertThrows(ResponseStatusException.class, () -> connect.start("server", hint))
                            .getStatusCode()
                            .value());
            assertEquals(
                    403,
                    assertThrows(ResponseStatusException.class, () -> accountLink.unlink())
                            .getStatusCode()
                            .value());
        }
        assertTrue(owners.isCurrentUser(auth(owner)));
        User principal = new User();
        principal.setId(owner.getId());
        principal.setUsername("ALICE");
        var authentication =
                new UsernamePasswordAuthenticationToken(principal, "", owner.getAuthorities());
        assertTrue(owners.isCurrentUser(authentication));
        new TransactionTemplate(transactions)
                .executeWithoutResult(
                        s ->
                                assertEquals(
                                        owner.getId(),
                                        owners.requireCurrentOwner(authentication)
                                                .getOwnerUserId()));
        verifyNoInteractions(cloud);
    }

    @Test
    void linkAuthorityMovesWithOwnershipAndOldHandshakesCannotComplete() throws Exception {
        User first = user("first", Role.ADMIN.getRoleId(), false, true);
        User second = user("second", Role.USER.getRoleId(), false, true);
        User admin = user("admin", Role.ADMIN.getRoleId(), false, true);
        owners.resolveOwner();
        var hint = new ConnectService.CallbackHint(null, null, "https://pdf.example.com");
        when(cloud.connectRequest(any(), any(), any(), any(), any()))
                .thenReturn(
                        new AccountLinkClient.ConnectRequestResult(
                                "request", 900, "https://cloud.example.com/link"));

        SecurityContextHolder.getContext().setAuthentication(auth(admin));
        assertEquals(
                403,
                assertThrows(ResponseStatusException.class, () -> connect.start("server", hint))
                        .getStatusCode()
                        .value());
        assertEquals(
                403,
                assertThrows(ResponseStatusException.class, () -> accountLink.unlink())
                        .getStatusCode()
                        .value());
        verifyNoInteractions(cloud);

        SecurityContextHolder.getContext().setAuthentication(auth(first));
        connect.start("server", hint);
        var saved = org.mockito.ArgumentCaptor.forClass(ConnectState.class);
        verify(connectStates).save(saved.capture());
        ConnectState pending = saved.getValue();
        when(connectStates.findById(1L)).thenReturn(Optional.of(pending));
        owners.transfer(second.getId(), auth(first));
        clearInvocations(cloud, credentials);

        assertEquals(
                403,
                assertThrows(
                                ResponseStatusException.class,
                                () -> connect.complete(pending.getNonce()))
                        .getStatusCode()
                        .value());
        assertEquals(
                403,
                assertThrows(ResponseStatusException.class, () -> connect.start("server", hint))
                        .getStatusCode()
                        .value());
        assertEquals(
                403,
                assertThrows(ResponseStatusException.class, () -> accountLink.unlink())
                        .getStatusCode()
                        .value());
        verifyNoInteractions(cloud);

        SecurityContextHolder.getContext()
                .setAuthentication(auth(users.findById(second.getId()).orElseThrow()));
        assertEquals(
                "LINK_OWNER_CHANGED",
                assertThrows(
                                ResponseStatusException.class,
                                () -> connect.complete(pending.getNonce()))
                        .getReason());
        verifyNoInteractions(cloud);
        connect.start("server", hint);
        verify(connectStates, times(2)).save(saved.capture());
        ConnectState fresh = saved.getValue();
        when(connectStates.findById(1L)).thenReturn(Optional.of(fresh));
        when(cloud.connectClaim(fresh.getRequestId(), fresh.getClaimSecret()))
                .thenReturn(
                        new AccountLinkClient.ConnectClaimResult(
                                AccountLinkClient.ConnectClaimOutcome.GRANTED,
                                "device",
                                "secret",
                                9L));
        assertEquals(ConnectService.Phase.LINKED, connect.complete(fresh.getNonce()).phase());
        verify(credentials).save(any(DeviceCredential.class));
        assertDoesNotThrow(() -> accountLink.unlink());
    }

    @Test
    void pendingHandoverBlocksLinkingBeforeContactingCloud() {
        User first = user("first", Role.ADMIN.getRoleId(), false, true);
        User second = user("second", Role.USER.getRoleId(), false, true);
        owners.resolveOwner();
        handovers.prepare(second.getId(), auth(first));
        SecurityContextHolder.getContext().setAuthentication(auth(first));
        assertEquals(
                409,
                assertThrows(
                                ResponseStatusException.class,
                                () ->
                                        connect.start(
                                                "server",
                                                new ConnectService.CallbackHint(
                                                        null, null, "https://pdf.example.com")))
                        .getStatusCode()
                        .value());
        assertEquals(
                409,
                assertThrows(ResponseStatusException.class, () -> accountLink.unlink())
                        .getStatusCode()
                        .value());
        verifyNoInteractions(cloud);
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
        ConnectStateRepository connectStates() {
            return mock(ConnectStateRepository.class);
        }

        @Bean
        EntitlementCache entitlementCache() {
            return mock(EntitlementCache.class);
        }

        @Bean
        stirling.software.common.model.ApplicationProperties applicationProperties() {
            return new stirling.software.common.model.ApplicationProperties();
        }

        @Bean
        DeviceCredentialRepository credentials() {
            return mock(DeviceCredentialRepository.class);
        }

        @Bean
        AccountLinkClient cloud() {
            return mock(AccountLinkClient.class);
        }

        @Bean
        AuditService auditService() {
            return mock(AuditService.class);
        }

        @Bean
        DatabaseServiceInterface databaseService() {
            return mock(DatabaseServiceInterface.class);
        }
    }
}
