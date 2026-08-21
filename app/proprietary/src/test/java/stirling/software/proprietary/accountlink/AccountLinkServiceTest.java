package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AccountLinkServiceTest {

    private AccountLinkClient client;
    private DeviceCredentialStore store;
    private EntitlementCache cache;
    private AccountLinkService service;

    @BeforeEach
    void setUp() {
        client = mock(AccountLinkClient.class);
        store = mock(DeviceCredentialStore.class);
        cache = mock(EntitlementCache.class);
        service = new AccountLinkService(client, store, cache);
    }

    @Test
    void link_storesCredentialAndInvalidatesCache() throws IOException {
        when(client.register("jwt", "name"))
                .thenReturn(new AccountLinkClient.RegisterResult("dev-1", "sec-1", 7L));
        DeviceCredential stored = new DeviceCredential();
        stored.setDeviceId("dev-1");
        stored.setTeamId(7L);
        stored.setLinkedAt(LocalDateTime.now());
        when(store.get()).thenReturn(Optional.of(stored));

        AccountLinkService.LinkStatus status = service.link("jwt", "name");

        verify(store).save("dev-1", "sec-1", 7L);
        verify(cache).invalidate();
        assertTrue(status.linked());
        assertEquals("dev-1", status.deviceId());
        assertEquals(7L, status.teamId());
    }

    @Test
    void link_propagatesRegisterFailure() throws IOException {
        when(client.register(any(), any())).thenThrow(new IOException("boom"));
        org.junit.jupiter.api.Assertions.assertThrows(
                IOException.class, () -> service.link("jwt", null));
        verify(cache, org.mockito.Mockito.never()).invalidate();
    }

    @Test
    void status_unlinkedWhenNoCredential() {
        when(store.get()).thenReturn(Optional.empty());
        AccountLinkService.LinkStatus status = service.status();
        assertFalse(status.linked());
    }

    @Test
    void unlink_callsSaasRevokeBeforeClearingLocally() {
        DeviceCredential cred = new DeviceCredential();
        cred.setDeviceId("dev-1");
        cred.setDeviceSecret("sec-1");
        cred.setTeamId(7L);
        cred.setLinkedAt(LocalDateTime.now());
        when(store.get()).thenReturn(Optional.of(cred));
        when(client.revokeSelf("dev-1", "sec-1")).thenReturn(true);

        service.unlink();

        verify(client).revokeSelf("dev-1", "sec-1");
        verify(store).clear();
        verify(cache).invalidate();
    }

    @Test
    void unlink_clearsLocallyEvenWhenSaasRevokeFails() {
        DeviceCredential cred = new DeviceCredential();
        cred.setDeviceId("dev-1");
        cred.setDeviceSecret("sec-1");
        cred.setLinkedAt(LocalDateTime.now());
        when(store.get()).thenReturn(Optional.of(cred));
        // SaaS unreachable / returns non-2xx.
        when(client.revokeSelf("dev-1", "sec-1")).thenReturn(false);

        service.unlink();

        // Local clear MUST still happen — admin's intent wins; orphan row is a follow-up.
        verify(store).clear();
        verify(cache).invalidate();
    }

    @Test
    void unlink_whenAlreadyUnlinked_skipsSaasRevoke() {
        when(store.get()).thenReturn(Optional.empty());

        service.unlink();

        org.mockito.Mockito.verifyNoInteractions(client);
        verify(store).clear();
        verify(cache).invalidate();
    }
}
