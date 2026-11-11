package stirling.software.proprietary.serverregistration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.accountlink.AccountLinkProperties;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.security.service.UserService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@DataJpaTest(properties = "stirling.server-registration.enabled=true")
@Import(ServerRegistrationStateStore.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ServerRegistrationStateStoreDbTest {
    @Autowired private ServerRegistrationStateStore store;
    @Autowired private ServerRegistrationStateRepository repository;
    @Autowired private PlatformTransactionManager transactionManager;

    @BeforeEach
    void clearState() {
        repository.deleteAllInBatch();
    }

    @Test
    void concurrentInitialReservationsCannotReplaceIdentityOrReuseSequences() throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        List<ServerRegistrationState> reserved = new ArrayList<>();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var action =
                    (java.util.concurrent.Callable<ServerRegistrationState>)
                            () -> {
                                ready.countDown();
                                assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                                try {
                                    return store.reserve("proof");
                                } catch (DataAccessException concurrentInitialization) {
                                    return store.reserve("proof");
                                }
                            };
            var first = executor.submit(action);
            var second = executor.submit(action);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            reserved.add(first.get(20, TimeUnit.SECONDS));
            reserved.add(second.get(20, TimeUnit.SECONDS));
        }
        var restored = store.reserve("proof");
        assertThat(reserved)
                .extracting(ServerRegistrationState::getInstallationId)
                .containsOnly(restored.getInstallationId());
        assertThat(reserved)
                .extracting(ServerRegistrationState::getRegistrationSecret)
                .containsOnly(restored.getRegistrationSecret());
        assertThat(reserved)
                .extracting(ServerRegistrationState::getReportSequence)
                .containsExactlyInAnyOrder(1L, 2L);
        assertThat(restored.getReportSequence()).isEqualTo(3);
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void reporterRetriesOfflineAndUnresolvedReportsAcrossRestartsWithoutChangingAllowance()
            throws Exception {
        var mapper = new ObjectMapper();
        var requests = new CopyOnWriteArrayList<JsonNode>();
        var paths = new CopyOnWriteArrayList<String>();
        var responseNumber = new AtomicInteger();
        UUID registrationId = UUID.randomUUID();
        HttpServer cloud = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        cloud.createContext(
                ServerRegistrationProtocol.PATH,
                exchange -> {
                    JsonNode body = mapper.readTree(exchange.getRequestBody().readAllBytes());
                    requests.add(body);
                    paths.add(exchange.getRequestURI().getPath());
                    int attempt = responseNumber.incrementAndGet();
                    byte[] response =
                            attempt == 1
                                    ? new byte[0]
                                    : mapper.writeValueAsBytes(
                                            new ServerRegistrationProtocol.Receipt(
                                                    registrationId,
                                                    body.path("report").path("sequence").asLong(),
                                                    attempt == 2
                                                            ? ServerRegistrationProtocol
                                                                    .PurchaseMapping.UNRESOLVED
                                                            : ServerRegistrationProtocol
                                                                    .PurchaseMapping.RESOLVED));
                    exchange.sendResponseHeaders(attempt == 1 ? 503 : 200, response.length);
                    exchange.getResponseBody().write(response);
                    exchange.close();
                });
        cloud.start();
        try {
            var application = new ApplicationProperties();
            application.getPremium().setKey("test-license");
            application.getPremium().setMaxUsers(100);
            var licenses = mock(LicenseKeyChecker.class);
            when(licenses.getLicenseKeyResult()).thenReturn(License.SERVER);
            var users = mock(UserService.class);
            when(users.getTotalUsersCount()).thenReturn(100L, 150L, 200L, 201L);
            ObjectProvider<UserService> provider = mock(ObjectProvider.class);
            when(provider.getIfAvailable()).thenReturn(users);
            var properties = new AccountLinkProperties();
            properties.setSaasBaseUrl("http://127.0.0.1:" + cloud.getAddress().getPort());
            for (int attempt = 0; attempt < 4; attempt++) {
                new LegacyServerRegistrationService(
                                licenses,
                                application,
                                provider,
                                store,
                                new ServerRegistrationClient(properties, mapper),
                                new ServerRegistrationProperties(),
                                "test-version")
                        .reportNow();
            }
            assertThat(paths)
                    .containsExactly(
                            ServerRegistrationProtocol.PATH,
                            ServerRegistrationProtocol.PATH,
                            ServerRegistrationProtocol.PATH,
                            ServerRegistrationProtocol.PATH + "/sync");
            assertThat(requests)
                    .extracting(r -> r.at("/report/sequence").asLong())
                    .containsExactly(1L, 2L, 3L, 4L);
            assertThat(requests)
                    .extracting(r -> r.at("/report/reportedUserCount").asLong())
                    .containsExactly(100L, 150L, 200L, 201L);
            assertThat(requests.subList(0, 3))
                    .extracting(r -> r.path("installationId").asText())
                    .containsOnly(requests.getFirst().path("installationId").asText());
            assertThat(requests)
                    .extracting(r -> r.path("registrationSecret").asText())
                    .containsOnly(requests.getFirst().path("registrationSecret").asText());
            assertThat(requests.get(3).has("licenseProof")).isFalse();
            assertThat(requests.get(3).path("registrationId").asText())
                    .isEqualTo(registrationId.toString());
            assertThat(application.getPremium().getMaxUsers()).isEqualTo(100);
            assertThat(repository.count()).isEqualTo(1);
            verify(licenses, times(4)).getLicenseKeyResult();
            verifyNoMoreInteractions(licenses);
        } finally {
            cloud.stop(0);
        }
    }

    @Test
    void failedOuterWorkCannotRollBackTheCredentialOrReservedSequence() {
        var caller = new TransactionTemplate(transactionManager);
        var first =
                caller.execute(
                        status -> {
                            var state = store.reserve("proof");
                            status.setRollbackOnly();
                            return state;
                        });
        var second = store.reserve("proof");
        assertThat(second.getInstallationId()).isEqualTo(first.getInstallationId());
        assertThat(second.getRegistrationSecret()).isEqualTo(first.getRegistrationSecret());
        assertThat(second.getReportSequence()).isEqualTo(first.getReportSequence() + 1);
        UUID registration = UUID.randomUUID();
        store.acknowledge(
                second,
                new ServerRegistrationProtocol.Receipt(
                        registration,
                        second.getReportSequence(),
                        ServerRegistrationProtocol.PurchaseMapping.RESOLVED));
        var restored = store.reserve("proof");
        assertThat(restored.getRegistrationId()).isEqualTo(registration);
        assertThat(restored.getPurchaseMapping())
                .isEqualTo(ServerRegistrationProtocol.PurchaseMapping.RESOLVED);
        assertThat(restored.getLastSuccessAt()).isNotNull();
        assertThat(repository.count()).isEqualTo(1);
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage(basePackages = "stirling.software.proprietary.serverregistration")
    static class TestApp {}
}
