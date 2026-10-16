package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
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

import stirling.software.proprietary.accountlink.LinkKeyFormat;
import stirling.software.saas.accountlink.AccountLinkService.RegisteredInstance;

@ExtendWith(MockitoExtension.class)
class LinkKeyServiceTest {

    @Mock private LinkKeyRepository repo;
    @Mock private AccountLinkService accountLinkService;

    private LinkKeyService service;

    @BeforeEach
    void setUp() {
        service = new LinkKeyService(repo, accountLinkService);
    }

    @Test
    void create_returnsThePlaintextOnceAndStoresOnlyTheHash() {
        ArgumentCaptor<LinkKey> saved = ArgumentCaptor.forClass(LinkKey.class);

        LinkKeyService.CreatedKey created = service.create(7L, 42L, "  Acme production  ");

        verify(repo).save(saved.capture());
        LinkKeyFormat.Parts parts = LinkKeyFormat.parse(created.key()).orElseThrow();
        LinkKey row = saved.getValue();
        assertThat(row.getKeyId()).isEqualTo(parts.keyId()).isEqualTo(created.keyId());
        assertThat(row.getSecretHash())
                .isEqualTo(AccountLinkService.sha256Hex(parts.secret()))
                .doesNotContain(parts.secret());
        assertThat(row.getTeamId()).isEqualTo(7L);
        assertThat(row.getCreatedByUserId()).isEqualTo(42L);
        assertThat(row.getName()).isEqualTo("Acme production");
        assertThat(row.getExpiresAt())
                .isAfter(LocalDateTime.now().plusDays(6))
                .isBefore(LocalDateTime.now().plusDays(8));
    }

    @Test
    void redeem_mintsACredentialAttributedToTheKeysCreatorAndUsesTheKeyUp() {
        Issued issued = issue(LocalDateTime.now().plusDays(1));
        when(accountLinkService.register(7L, 42L, "Acme production"))
                .thenReturn(new RegisteredInstance(11L, "device-1", "secret-1", "Acme production"));

        Optional<LinkKeyService.Redeemed> result = service.redeem(issued.key, null);

        assertThat(result).contains(new LinkKeyService.Redeemed("device-1", "secret-1", 7L));
        assertThat(issued.row.getRedeemedAt()).isNotNull();
        assertThat(issued.row.getInstanceId()).isEqualTo(11L);
        verify(repo).save(issued.row);
    }

    @Test
    void redeem_prefersTheNameTheServerSupplies() {
        Issued issued = issue(LocalDateTime.now().plusDays(1));
        when(accountLinkService.register(7L, 42L, "pdf.acme.internal"))
                .thenReturn(new RegisteredInstance(11L, "device-1", "secret-1", null));

        assertThat(service.redeem(issued.key, " pdf.acme.internal ")).isPresent();
    }

    @Test
    void redeem_refusesAUsedKey() {
        Issued issued = issue(LocalDateTime.now().plusDays(1));
        issued.row.setRedeemedAt(LocalDateTime.now().minusHours(1));

        assertThat(service.redeem(issued.key, null)).isEmpty();
        verify(accountLinkService, never()).register(anyLong(), anyLong(), anyString());
    }

    @Test
    void redeem_refusesARevokedKey() {
        Issued issued = issue(LocalDateTime.now().plusDays(1));
        issued.row.setRevokedAt(LocalDateTime.now().minusHours(1));

        assertThat(service.redeem(issued.key, null)).isEmpty();
        verify(accountLinkService, never()).register(anyLong(), anyLong(), anyString());
    }

    @Test
    void redeem_refusesAnExpiredKey() {
        Issued issued = issue(LocalDateTime.now().minusMinutes(1));

        assertThat(service.redeem(issued.key, null)).isEmpty();
        verify(accountLinkService, never()).register(anyLong(), anyLong(), anyString());
    }

    @Test
    void redeem_refusesTheRightIdWithTheWrongSecret() {
        Issued issued = issue(LocalDateTime.now().plusDays(1));
        String forged = LinkKeyFormat.parse(issued.key).orElseThrow().keyId();
        String other = LinkKeyFormat.generate(new java.security.SecureRandom()).secret();

        assertThat(service.redeem("stlk_" + forged + "." + other, null)).isEmpty();
        assertThat(issued.row.getRedeemedAt()).isNull();
        verify(repo, never()).save(any());
    }

    @Test
    void redeem_refusesUnknownAndMalformedKeysWithoutRegistering() {
        String unknown = LinkKeyFormat.generate(new java.security.SecureRandom()).compose();
        when(repo.findByKeyIdForUpdate(LinkKeyFormat.parse(unknown).orElseThrow().keyId()))
                .thenReturn(Optional.empty());

        assertThat(service.redeem(unknown, null)).isEmpty();
        assertThat(service.redeem("not-a-key", null)).isEmpty();
        assertThat(service.redeem(null, null)).isEmpty();
        verify(accountLinkService, never()).register(anyLong(), anyLong(), anyString());
    }

    @Test
    void revoke_withdrawsAnUnusedKeyOnTheCallersTeam() {
        LinkKey row = row(7L);
        when(repo.findByKeyIdForUpdate("k1")).thenReturn(Optional.of(row));

        assertThat(service.revoke(7L, "k1")).isTrue();
        assertThat(row.getRevokedAt()).isNotNull();
    }

    @Test
    void revoke_neverTouchesAnotherTeamsKey() {
        LinkKey row = row(99L);
        when(repo.findByKeyIdForUpdate("k1")).thenReturn(Optional.of(row));

        assertThat(service.revoke(7L, "k1")).isFalse();
        assertThat(row.getRevokedAt()).isNull();
        verify(repo, never()).save(any());
    }

    @Test
    void revoke_refusesAKeyThatWasAlreadyUsed() {
        LinkKey row = row(7L);
        row.setRedeemedAt(LocalDateTime.now());
        when(repo.findByKeyIdForUpdate("k1")).thenReturn(Optional.of(row));

        assertThat(service.revoke(7L, "k1")).isFalse();
        assertThat(row.getRevokedAt()).isNull();
    }

    private record Issued(String key, LinkKey row) {}

    /** A stored key exactly as {@link LinkKeyService#create} would have left it. */
    private Issued issue(LocalDateTime expiresAt) {
        LinkKeyFormat.Parts parts = LinkKeyFormat.generate(new java.security.SecureRandom());
        LinkKey row = row(7L);
        row.setKeyId(parts.keyId());
        row.setSecretHash(AccountLinkService.sha256Hex(parts.secret()));
        row.setCreatedByUserId(42L);
        row.setName("Acme production");
        row.setExpiresAt(expiresAt);
        when(repo.findByKeyIdForUpdate(parts.keyId())).thenReturn(Optional.of(row));
        return new Issued(parts.compose(), row);
    }

    private static LinkKey row(long teamId) {
        LinkKey row = new LinkKey();
        row.setTeamId(teamId);
        row.setExpiresAt(LocalDateTime.now().plusDays(1));
        return row;
    }
}
