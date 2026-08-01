package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.saas.accountlink.AccountLinkService.RegisteredInstance;

/**
 * Pure-Mockito unit tests for {@link AccountLinkService}: register returns the plaintext secret
 * once but persists only its hash, and revoke is team-scoped + idempotent — a caller can never
 * revoke another team's instance.
 */
@ExtendWith(MockitoExtension.class)
class AccountLinkServiceTest {

    @Mock private LinkedInstanceRepository repo;

    private AccountLinkService service;

    @BeforeEach
    void setUp() {
        service = new AccountLinkService(repo);
    }

    @Test
    void register_returnsPlaintextSecretOnce_persistsOnlyHash() {
        ArgumentCaptor<LinkedInstance> captor = ArgumentCaptor.forClass(LinkedInstance.class);

        RegisteredInstance reg = service.register(42L, 7L, "host-a");

        verify(repo).save(captor.capture());
        LinkedInstance saved = captor.getValue();
        assertThat(reg.deviceSecret()).isNotBlank();
        assertThat(reg.deviceId()).isEqualTo(saved.getDeviceId());
        assertThat(saved.getDeviceSecretHash())
                .isEqualTo(AccountLinkService.sha256Hex(reg.deviceSecret()))
                .isNotEqualTo(reg.deviceSecret());
        assertThat(saved.getTeamId()).isEqualTo(42L);
        assertThat(saved.getCreatedByUserId()).isEqualTo(7L);
        assertThat(saved.getName()).isEqualTo("host-a");
    }

    @Test
    void revoke_owningTeam_setsRevokedAtAndReturnsTrue() {
        LinkedInstance inst = instance(11L, 42L, null);
        when(repo.findById(11L)).thenReturn(Optional.of(inst));

        assertThat(service.revoke(42L, 11L)).isTrue();
        assertThat(inst.getRevokedAt()).isNotNull();
        verify(repo).save(inst);
    }

    @Test
    void revoke_alreadyRevoked_isIdempotentAndDoesNotResave() {
        LocalDateTime revoked = LocalDateTime.now().minusDays(1);
        LinkedInstance inst = instance(11L, 42L, revoked);
        when(repo.findById(11L)).thenReturn(Optional.of(inst));

        assertThat(service.revoke(42L, 11L)).isTrue();
        assertThat(inst.getRevokedAt()).isEqualTo(revoked);
        verify(repo, never()).save(any());
    }

    @Test
    void revoke_otherTeamsInstance_returnsFalseAndDoesNotSave() {
        LinkedInstance inst = instance(11L, 99L, null);
        when(repo.findById(11L)).thenReturn(Optional.of(inst));

        assertThat(service.revoke(42L, 11L)).isFalse();
        assertThat(inst.getRevokedAt()).isNull();
        verify(repo, never()).save(any());
    }

    @Test
    void revoke_unknownInstance_returnsFalse() {
        when(repo.findById(404L)).thenReturn(Optional.empty());

        assertThat(service.revoke(42L, 404L)).isFalse();
        verify(repo, never()).save(any());
    }

    private static LinkedInstance instance(Long id, Long teamId, LocalDateTime revokedAt) {
        LinkedInstance i = new LinkedInstance();
        i.setInstanceId(id);
        i.setTeamId(teamId);
        i.setRevokedAt(revokedAt);
        return i;
    }
}
