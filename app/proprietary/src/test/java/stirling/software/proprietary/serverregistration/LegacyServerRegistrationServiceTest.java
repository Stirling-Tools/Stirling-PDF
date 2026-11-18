package stirling.software.proprietary.serverregistration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.net.http.HttpTimeoutException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.security.service.UserService;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

class LegacyServerRegistrationServiceTest {
    private static final Instant NOW = Instant.parse("2026-11-16T12:00:00Z");
    private final LicenseKeyChecker licenses = mock(LicenseKeyChecker.class);
    private final UserService users = mock(UserService.class);
    private final ServerRegistrationStateStore states = mock(ServerRegistrationStateStore.class);
    private final ServerRegistrationClient client = mock(ServerRegistrationClient.class);
    private final ApplicationProperties application = new ApplicationProperties();
    private final ServerRegistrationProperties properties = new ServerRegistrationProperties();
    private final Clock clock = mock(Clock.class);
    private final Logger logger =
            (Logger) LoggerFactory.getLogger(LegacyServerRegistrationService.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private Level previousLevel;
    private LegacyServerRegistrationService service;
    private ServerRegistrationState state;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setup() {
        when(clock.instant()).thenReturn(NOW);
        previousLevel = logger.getLevel();
        logger.setLevel(Level.INFO);
        logs.start();
        logger.addAppender(logs);
        ObjectProvider<UserService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(users);
        service =
                new LegacyServerRegistrationService(
                        licenses,
                        application,
                        provider,
                        states,
                        client,
                        properties,
                        "test-version",
                        clock);
        application.getPremium().setKey("test-license");
        application.getPremium().setMaxUsers(0);
        state = new ServerRegistrationState();
        state.setInstallationId(UUID.randomUUID());
        state.setRegistrationSecret("a".repeat(43));
        state.setReportSequence(5);
    }

    @AfterEach
    void restoreLogger() {
        logger.detachAppender(logs);
        logger.setLevel(previousLevel);
        logs.stop();
    }

    @Test
    void unlimitedLicenseReportsActualUsersWithoutChangingAllowance() throws Exception {
        when(licenses.getLicenseKeyResult()).thenReturn(License.SERVER);
        when(users.getTotalUsersCount()).thenReturn(147L);
        when(states.reserve("test-license")).thenReturn(state);
        var receipt =
                new ServerRegistrationProtocol.Receipt(
                        UUID.randomUUID(),
                        5,
                        ServerRegistrationProtocol.PurchaseMapping.UNRESOLVED);
        when(client.register(any()))
                .thenAnswer(
                        call -> {
                            var request =
                                    call.getArgument(
                                            0,
                                            ServerRegistrationProtocol.RegistrationRequest.class);
                            assertThat(request.report().reportedUserCount()).isEqualTo(147);
                            assertThat(request.report().sequence()).isEqualTo(5);
                            assertThat(request.installationId())
                                    .isEqualTo(state.getInstallationId());
                            assertThat(request.licenseProof()).isEqualTo("test-license");
                            return receipt;
                        });
        service.reportNow();
        verify(states).acknowledge(state, receipt);
        verify(licenses, only()).getLicenseKeyResult();
        verify(client, never()).sync(any());
        assertThat(application.getPremium().getMaxUsers()).isZero();
    }

    @Test
    void validSignedFileIsSentAsProof(@TempDir Path directory) throws Exception {
        Path proof = directory.resolve("license");
        Files.writeString(proof, "signed-test-certificate");
        application.getPremium().setKey("file:" + proof);
        when(licenses.getLicenseKeyResult()).thenReturn(License.SERVER);
        when(users.getTotalUsersCount()).thenReturn(0L);
        when(states.reserve("signed-test-certificate")).thenReturn(state);
        service.reportNow();
        verify(client)
                .register(
                        argThat(
                                request ->
                                        request.licenseProof().equals("signed-test-certificate")
                                                && request.report().reportedUserCount() == 0));
    }

    @Test
    void linkedRegistrationUsesOnlyTrackingSecret() throws Exception {
        state.setRegistrationId(UUID.randomUUID());
        state.setPurchaseMapping(ServerRegistrationProtocol.PurchaseMapping.RESOLVED);
        when(licenses.getLicenseKeyResult()).thenReturn(License.SERVER);
        when(users.getTotalUsersCount()).thenReturn(200L);
        when(states.reserve(any())).thenReturn(state);
        service.reportNow();
        verify(client)
                .sync(
                        argThat(
                                request ->
                                        request.registrationId().equals(state.getRegistrationId())
                                                && request.report().reportedUserCount() == 200));
        verify(client, never()).register(any());
    }

    @Test
    void unresolvedPurchaseRetriesProofWithTheSameInstallationAndCredential() throws Exception {
        state.setRegistrationId(UUID.randomUUID());
        state.setPurchaseMapping(ServerRegistrationProtocol.PurchaseMapping.UNRESOLVED);
        when(licenses.getLicenseKeyResult()).thenReturn(License.SERVER);
        when(users.getTotalUsersCount()).thenReturn(200L);
        when(states.reserve(any())).thenReturn(state);
        service.reportNow();
        verify(client)
                .register(
                        argThat(
                                request ->
                                        request.installationId().equals(state.getInstallationId())
                                                && request.registrationSecret()
                                                        .equals(state.getRegistrationSecret())
                                                && request.report().reportedUserCount() == 200));
        verify(client, never()).sync(any());
    }

    @Test
    void lostResponseDoesNotAcknowledgeOrTouchLicense() throws Exception {
        when(licenses.getLicenseKeyResult()).thenReturn(License.SERVER);
        when(users.getTotalUsersCount()).thenReturn(147L);
        when(states.reserve(any())).thenReturn(state);
        when(client.register(any())).thenThrow(new IOException("network unavailable"));
        service.reportNow();
        verify(states, never()).acknowledge(any(), any());
        verify(licenses, only()).getLicenseKeyResult();
    }

    @Test
    void recurringConflictRetriesOnlyOnceAndNeverAcknowledges() throws Exception {
        when(licenses.getLicenseKeyResult()).thenReturn(License.SERVER);
        when(users.getTotalUsersCount()).thenReturn(147L);
        when(states.reserve(any())).thenReturn(state);
        var conflict = new ServerRegistrationProtocol.SequenceConflict(UUID.randomUUID(), 100);
        when(client.register(any()))
                .thenThrow(new ServerRegistrationClient.SequenceConflictException(conflict));
        when(states.reconcile(state, conflict)).thenReturn(true);
        service.reportNow();
        verify(client, times(2)).register(any());
        verify(states).reconcile(state, conflict);
        verify(states, never()).acknowledge(any(), any());
        verify(licenses, only()).getLicenseKeyResult();
        assertThat(logs.list)
                .singleElement()
                .satisfies(
                        event -> {
                            assertThat(event.getLevel()).isEqualTo(Level.WARN);
                            assertThat(event.getFormattedMessage())
                                    .contains("recovering report sequence");
                        });
    }

    @Test
    void recoveredConflictRetriesImmediatelyWithoutWarning() throws Exception {
        prepareReport();
        var conflict = new ServerRegistrationProtocol.SequenceConflict(UUID.randomUUID(), 100);
        var receipt =
                new ServerRegistrationProtocol.Receipt(
                        conflict.registrationId(),
                        101,
                        ServerRegistrationProtocol.PurchaseMapping.RESOLVED);
        when(client.register(any()))
                .thenThrow(new ServerRegistrationClient.SequenceConflictException(conflict))
                .thenReturn(receipt);
        when(states.reconcile(state, conflict)).thenReturn(true);
        service.reportNow();
        verify(client, times(2)).register(any());
        verify(states).acknowledge(state, receipt);
        assertThat(logs.list).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 401, 403, 404, 422})
    void rejectedSyncWaitsADayAndKeepsIdentityWithFreshCounts(int status) throws Exception {
        prepareReport();
        properties.setSyncInterval(Duration.ofMinutes(1));
        state.setRegistrationId(UUID.randomUUID());
        state.setPurchaseMapping(ServerRegistrationProtocol.PurchaseMapping.RESOLVED);
        when(users.getTotalUsersCount()).thenReturn(147L, 200L);
        when(client.sync(any()))
                .thenThrow(new ServerRegistrationClient.HttpFailureException(status, null));
        service.reportNow();
        service.reportNow();
        when(clock.instant()).thenReturn(NOW.plus(Duration.ofDays(1)).minusNanos(1));
        service.reportNow();
        verify(client).sync(any());
        when(clock.instant()).thenReturn(NOW.plus(Duration.ofDays(1)));
        service.reportNow();
        var requests = ArgumentCaptor.forClass(ServerRegistrationProtocol.SyncRequest.class);
        verify(client, times(2)).sync(requests.capture());
        assertThat(requests.getAllValues())
                .allSatisfy(
                        request -> {
                            assertThat(request.registrationId())
                                    .isEqualTo(state.getRegistrationId());
                            assertThat(request.registrationSecret())
                                    .isEqualTo(state.getRegistrationSecret());
                        });
        assertThat(requests.getAllValues())
                .extracting(request -> request.report().reportedUserCount())
                .containsExactly(147L, 200L);
        verify(client, never()).register(any());
        verify(states, never()).acknowledge(any(), any());
        assertThat(logs.list)
                .hasSize(2)
                .allSatisfy(
                        event -> {
                            assertThat(event.getLevel()).isEqualTo(Level.WARN);
                            assertThat(event.getFormattedMessage())
                                    .contains("HTTP " + status, "check registration configuration");
                            assertThat(event.getThrowableProxy()).isNull();
                        });
        assertThat(application.getPremium().getKey()).isEqualTo("test-license");
        assertThat(application.getPremium().getMaxUsers()).isZero();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void transientFailuresBackOffToADayWithRateLimitedSecretSafeWarnings(boolean timeout)
            throws Exception {
        prepareReport();
        properties.setSyncInterval(Duration.ofMinutes(1));
        String sensitiveMessage = "test-license " + state.getRegistrationSecret();
        when(client.register(any()))
                .thenThrow(
                        timeout
                                ? new HttpTimeoutException(sensitiveMessage)
                                : new IOException(sensitiveMessage));
        service.reportNow();
        Instant now = NOW;
        int attempts = 1;
        for (int minutes : new int[] {15, 30, 60, 120, 240, 480, 960, 1440, 1440}) {
            now = now.plus(Duration.ofMinutes(minutes));
            when(clock.instant()).thenReturn(now.minusNanos(1));
            service.reportNow();
            verify(client, times(attempts)).register(any());
            when(clock.instant()).thenReturn(now);
            service.reportNow();
            verify(client, times(++attempts)).register(any());
        }
        assertThat(logs.list)
                .hasSize(4)
                .allSatisfy(
                        event -> {
                            assertThat(event.getLevel()).isEqualTo(Level.WARN);
                            assertThat(event.getFormattedMessage())
                                    .contains(
                                            "registering with cloud",
                                            timeout ? "request timed out" : "IOException",
                                            "next attempt no earlier than")
                                    .doesNotContain("test-license", state.getRegistrationSecret());
                            assertThat(event.getThrowableProxy()).isNull();
                        });
        verify(states, never()).acknowledge(any(), any());
    }

    @ParameterizedTest
    @CsvSource({
        "408, 1, 15",
        "425, 1, 15",
        "429, 1, 15",
        "500, 1, 15",
        "503, 1, 15",
        "503, 1440, 1440",
        "503, 2880, 2880"
    })
    void transientHttpFailureRespectsBackoffAndNormalInterval(
            int status, int intervalMinutes, int retryMinutes) throws Exception {
        prepareReport();
        properties.setSyncInterval(Duration.ofMinutes(intervalMinutes));
        when(client.register(any()))
                .thenThrow(new ServerRegistrationClient.HttpFailureException(status, null));
        service.reportNow();
        when(clock.instant()).thenReturn(NOW.plus(Duration.ofMinutes(retryMinutes)).minusNanos(1));
        service.reportNow();
        verify(client).register(any());
        when(clock.instant()).thenReturn(NOW.plus(Duration.ofMinutes(retryMinutes)));
        service.reportNow();
        verify(client, times(2)).register(any());
    }

    @ParameterizedTest
    @ValueSource(ints = {429, 503})
    void serverRetryDeadlineCanExtendTheDailyCooldown(int status) throws Exception {
        prepareReport();
        Instant deadline = NOW.plus(Duration.ofDays(3));
        when(client.register(any()))
                .thenThrow(new ServerRegistrationClient.HttpFailureException(status, deadline));
        service.reportNow();
        when(clock.instant()).thenReturn(deadline.minusNanos(1));
        service.reportNow();
        verify(client).register(any());
        when(clock.instant()).thenReturn(deadline);
        service.reportNow();
        verify(client, times(2)).register(any());
        assertThat(logs.list.getFirst().getFormattedMessage()).contains(deadline.toString());
    }

    @Test
    void successResetsBackoffAndLogsRecoveryOnlyOnce() throws Exception {
        prepareReport();
        properties.setSyncInterval(Duration.ofMinutes(1));
        var receipt =
                new ServerRegistrationProtocol.Receipt(
                        UUID.randomUUID(),
                        5,
                        ServerRegistrationProtocol.PurchaseMapping.UNRESOLVED);
        when(client.register(any()))
                .thenThrow(new ServerRegistrationClient.HttpFailureException(401, null))
                .thenReturn(receipt);
        service.reportNow();
        Instant recoveredAt = NOW.plus(Duration.ofDays(1));
        when(clock.instant()).thenReturn(recoveredAt);
        service.reportNow();
        service.reportNow();
        when(client.register(any())).thenThrow(new IOException("offline"));
        when(clock.instant()).thenReturn(recoveredAt.plusSeconds(60));
        service.reportNow();
        when(clock.instant()).thenReturn(recoveredAt.plus(Duration.ofMinutes(16)).minusNanos(1));
        service.reportNow();
        verify(client, times(4)).register(any());
        when(clock.instant()).thenReturn(recoveredAt.plus(Duration.ofMinutes(16)));
        service.reportNow();
        verify(client, times(5)).register(any());
        assertThat(logs.list)
                .extracting(ILoggingEvent::getLevel)
                .containsExactly(Level.WARN, Level.INFO, Level.WARN);
        assertThat(logs.list.get(1).getFormattedMessage()).contains("recovered");
    }

    @Test
    void failureIsNotRetriedAfterLicenseBecomesEnterprise() throws Exception {
        prepareReport();
        when(client.register(any())).thenThrow(new IOException("offline"));
        service.reportNow();
        when(clock.instant()).thenReturn(NOW.plus(Duration.ofDays(1)));
        when(licenses.getLicenseKeyResult()).thenReturn(License.ENTERPRISE);
        service.reportNow();
        verify(client).register(any());
    }

    @Test
    void enterpriseAndTeamOnlyInstancesDoNotBootstrap() {
        when(licenses.getLicenseKeyResult()).thenReturn(License.ENTERPRISE, License.NORMAL);
        service.reportNow();
        service.reportNow();
        verifyNoInteractions(states, client, users);
    }

    @Test
    void unknownOrInvalidCountNeverBecomesZero() {
        when(licenses.getLicenseKeyResult()).thenReturn(License.SERVER);
        when(users.getTotalUsersCount())
                .thenThrow(new IllegalStateException("database unavailable: test-license"));
        service.reportNow();
        verifyNoInteractions(states, client);
        assertThat(logs.list)
                .singleElement()
                .satisfies(
                        event -> {
                            assertThat(event.getLevel()).isEqualTo(Level.WARN);
                            assertThat(event.getFormattedMessage())
                                    .contains("counting users", "IllegalStateException")
                                    .doesNotContain("test-license");
                            assertThat(event.getThrowableProxy()).isNull();
                        });
    }

    @Test
    void unreadableLicenseFileWarnsWithoutExposingItsPath(@TempDir Path directory) {
        prepareReport();
        application.getPremium().setKey("file:" + directory.resolve("private-license-key"));
        service.reportNow();
        verifyNoInteractions(states, client);
        assertThat(logs.list)
                .singleElement()
                .satisfies(
                        event -> {
                            assertThat(event.getLevel()).isEqualTo(Level.WARN);
                            assertThat(event.getFormattedMessage())
                                    .contains("reading license", "NoSuchFileException")
                                    .doesNotContain(directory.toString(), "private-license-key");
                            assertThat(event.getThrowableProxy()).isNull();
                        });
    }

    @Test
    void interruptionDoesNotProduceAnOutageWarning() throws Exception {
        prepareReport();
        when(client.register(any()))
                .thenAnswer(
                        call -> {
                            Thread.currentThread().interrupt();
                            throw new IOException("interrupted");
                        });
        try {
            service.reportNow();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(logs.list).isEmpty();
            verify(client).register(any());
            verify(states, never()).acknowledge(any(), any());
        } finally {
            Thread.interrupted();
        }
    }

    private void prepareReport() {
        when(licenses.getLicenseKeyResult()).thenReturn(License.SERVER);
        when(users.getTotalUsersCount()).thenReturn(147L);
        when(states.reserve(any())).thenReturn(state);
    }
}
