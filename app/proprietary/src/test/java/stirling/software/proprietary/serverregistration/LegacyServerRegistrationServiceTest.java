package stirling.software.proprietary.serverregistration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.security.service.UserService;

class LegacyServerRegistrationServiceTest {
    private final LicenseKeyChecker licenses = mock(LicenseKeyChecker.class);
    private final UserService users = mock(UserService.class);
    private final ServerRegistrationStateStore states = mock(ServerRegistrationStateStore.class);
    private final ServerRegistrationClient client = mock(ServerRegistrationClient.class);
    private final ApplicationProperties application = new ApplicationProperties();
    private LegacyServerRegistrationService service;
    private ServerRegistrationState state;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setup() {
        ObjectProvider<UserService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(users);
        service =
                new LegacyServerRegistrationService(
                        licenses,
                        application,
                        provider,
                        states,
                        client,
                        new ServerRegistrationProperties(),
                        "test-version");
        application.getPremium().setKey("test-license");
        application.getPremium().setMaxUsers(0);
        state = new ServerRegistrationState();
        state.setInstallationId(UUID.randomUUID());
        state.setRegistrationSecret("a".repeat(43));
        state.setReportSequence(5);
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
                .thenThrow(new IllegalStateException("database unavailable"));
        service.reportNow();
        verifyNoInteractions(states, client);
    }
}
