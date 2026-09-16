package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.proprietary.security.model.exception.UserLimitExceededException;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

class FleetSeatSyncServiceTest {
    private final DeviceCredentialStore credentials = mock(DeviceCredentialStore.class);
    private final AccountLinkClient client = mock(AccountLinkClient.class);
    private final UserLicenseSettingsService settings = mock(UserLicenseSettingsService.class);
    private final UserService users = mock(UserService.class);
    private final ObjectProvider<UserService> provider = mock(ObjectProvider.class);
    private final DeviceCredential credential = new DeviceCredential();
    private final FleetSeatSyncService service =
            new FleetSeatSyncService(credentials, client, provider, settings);

    @BeforeEach
    void setup() {
        when(credentials.get()).thenReturn(Optional.of(credential));
        when(provider.getObject()).thenReturn(users);
    }

    @Test
    void sharedCapacityBlocksAnOtherwiseLocallyValidAdmission() throws Exception {
        when(client.reportSeats(credential, 3, true))
                .thenReturn(new AccountLinkClient.FleetSeats(false, 100, 100, 0));
        assertThrows(UserLimitExceededException.class, () -> service.claim(3));
    }

    @Test
    void outageAndUnknownDeploymentBlockOnlyNewAdmissions() throws Exception {
        when(client.reportSeats(credential, 3, true)).thenThrow(new IOException());
        assertThrows(IllegalStateException.class, () -> service.claim(3));
        doReturn(new AccountLinkClient.FleetSeats(false, 3, 100, 1))
                .when(client)
                .reportSeats(credential, 3, true);
        assertThrows(IllegalStateException.class, () -> service.claim(3));
    }

    @Test
    void independentLicenseUsesNoTeamSeats() throws Exception {
        when(settings.hasLicenseKeyPaidTier()).thenReturn(true);
        service.claim(200);
        verifyNoInteractions(client);
        service.report();
        verify(client).reportSeats(credential, 0, false);
    }

    @Test
    void periodicReportReconcilesDeletionsAndFailedCreationReservations() throws Exception {
        when(users.getTotalUsersCount()).thenReturn(7L);
        service.report();
        var order = inOrder(settings, client);
        order.verify(settings).lockForUserAdmission();
        order.verify(client).reportSeats(credential, 7, false);
    }

    @Test
    void unlinkedServerKeepsItsLocalCapacityRules() {
        when(credentials.get()).thenReturn(Optional.empty());
        service.claim(3);
        service.report();
        verifyNoInteractions(client);
    }
}
