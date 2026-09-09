package stirling.software.proprietary.storage.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileEncryptionKey;

class FileEncryptionKeyServiceTest {

    private static final String MASTER_A =
            Base64.getEncoder()
                    .encodeToString(
                            new byte[] {
                                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                                20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
                            });
    private static final String MASTER_B =
            Base64.getEncoder()
                    .encodeToString(
                            new byte[] {
                                32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16,
                                15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1
                            });

    private InMemoryKeyRepo repo;
    private FileEncryptionKeyService service;

    @BeforeEach
    void setUp() {
        repo = new InMemoryKeyRepo();
        service =
                new FileEncryptionKeyService(
                        repo.mock, new FileEncryptionMasterKey(MASTER_A, false));
    }

    private static User teamUser(long teamId) {
        Team team = new Team();
        team.setId(teamId);
        User user = new User();
        user.setTeam(team);
        return user;
    }

    @Test
    void activeKekForOwner_createsPerTeamKeyOnDemand_thenReuses() throws Exception {
        FileEncryptionKeyService.ScopeKek first = service.activeKekForOwner(teamUser(5));
        FileEncryptionKeyService.ScopeKek second = service.activeKekForOwner(teamUser(5));
        assertThat(second.keyId()).isEqualTo(first.keyId());
        assertThat(repo.rows).hasSize(1);
        FileEncryptionKey row = repo.rows.values().iterator().next();
        assertThat(row.getScopeType()).isEqualTo(FileEncryptionKey.ScopeType.TEAM);
        assertThat(row.getScopeId()).isEqualTo(5);
        assertThat(row.getStatus()).isEqualTo(FileEncryptionKey.Status.ACTIVE);

        FileEncryptionKeyService.ScopeKek otherTeam = service.activeKekForOwner(teamUser(6));
        assertThat(otherTeam.keyId()).isNotEqualTo(first.keyId());
        assertThat(repo.rows).hasSize(2);
    }

    @Test
    void activeKekForOwner_withoutTeam_usesGlobalScope() throws Exception {
        service.activeKekForOwner(new User());
        FileEncryptionKey row = repo.rows.values().iterator().next();
        assertThat(row.getScopeType()).isEqualTo(FileEncryptionKey.ScopeType.GLOBAL);
        assertThat(row.getScopeId()).isZero();
    }

    @Test
    void kekForDecrypt_unwrapsWhatWasWrapped() throws Exception {
        FileEncryptionKeyService.ScopeKek created = service.activeKekForOwner(teamUser(1));
        // A fresh service (empty cache) must unwrap the same key material from the DB row.
        FileEncryptionKeyService fresh =
                new FileEncryptionKeyService(
                        repo.mock, new FileEncryptionMasterKey(MASTER_A, false));
        assertThat(fresh.kekForDecrypt(created.keyId())).isEqualTo(created.key());
    }

    @Test
    void kekForDecrypt_disabledKey_failsClosed() throws Exception {
        FileEncryptionKeyService.ScopeKek created = service.activeKekForOwner(teamUser(1));
        repo.rows.get(created.keyId()).setStatus(FileEncryptionKey.Status.DISABLED);
        FileEncryptionKeyService fresh =
                new FileEncryptionKeyService(
                        repo.mock, new FileEncryptionMasterKey(MASTER_A, false));
        assertThatThrownBy(() -> fresh.kekForDecrypt(created.keyId()))
                .isInstanceOf(StorageKeyRevokedException.class)
                .hasMessageContaining("disabled");
    }

    @Test
    void kekForDecrypt_unknownKey_failsClosed() {
        assertThatThrownBy(() -> service.kekForDecrypt(UUID.randomUUID()))
                .isInstanceOf(StorageEncryptionException.class)
                .hasMessageContaining("No encryption key");
    }

    @Test
    void verifyMasterKey_wrongKey_refusesStartup() throws Exception {
        service.activeKekForOwner(teamUser(1));
        FileEncryptionKeyService wrongKey =
                new FileEncryptionKeyService(
                        repo.mock, new FileEncryptionMasterKey(MASTER_B, false));
        assertThatThrownBy(wrongKey::verifyMasterKey)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cannot unwrap");
    }

    @Test
    void verifyMasterKey_correctKeyOrEmptyRegistry_passes() throws Exception {
        service.verifyMasterKey(); // empty registry: nothing to prove
        service.activeKekForOwner(teamUser(1));
        service.verifyMasterKey();
    }

    @Test
    void verifyMasterKey_retiredOnlyRegistry_stillVerifies() throws Exception {
        FileEncryptionKeyService.ScopeKek created = service.activeKekForOwner(teamUser(1));
        repo.rows.get(created.keyId()).setStatus(FileEncryptionKey.Status.RETIRED);

        // A retired-only registry must still prove the key (RETIRED rows decrypt old blobs)...
        new FileEncryptionKeyService(repo.mock, new FileEncryptionMasterKey(MASTER_A, false))
                .verifyMasterKey();
        // ...and still refuse a mismatched master key.
        assertThatThrownBy(
                        () ->
                                new FileEncryptionKeyService(
                                                repo.mock,
                                                new FileEncryptionMasterKey(MASTER_B, false))
                                        .verifyMasterKey())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cannot unwrap");
    }

    @Test
    void createActive_concurrentInsertRace_fallsBackToWinnersRow() throws Exception {
        // First save call hits the unique constraint; the service must re-read the winner's row.
        FileEncryptionKey winner = new FileEncryptionKey();
        winner.setKeyId(UUID.randomUUID());
        winner.setScopeType(FileEncryptionKey.ScopeType.TEAM);
        winner.setScopeId(9);
        winner.setKeyVersion(1);
        winner.setStatus(FileEncryptionKey.Status.ACTIVE);
        winner.setMasterKeyVersion(1);
        FileEncryptionMasterKey master = new FileEncryptionMasterKey(MASTER_A, false);
        byte[] winnerKek = new byte[32];
        winner.setWrappedKey(
                Base64.getEncoder()
                        .encodeToString(
                                master.wrap(
                                        winnerKek,
                                        winner.getKeyId()
                                                .toString()
                                                .getBytes(
                                                        java.nio.charset.StandardCharsets
                                                                .US_ASCII))));

        doAnswer(
                        inv -> {
                            repo.rows.put(winner.getKeyId(), winner);
                            throw new DataIntegrityViolationException("duplicate key");
                        })
                .doAnswer(
                        inv -> {
                            FileEncryptionKey row = inv.getArgument(0);
                            repo.rows.put(row.getKeyId(), row);
                            return row;
                        })
                .when(repo.mock)
                .saveAndFlush(any(FileEncryptionKey.class));

        FileEncryptionKeyService racedService = new FileEncryptionKeyService(repo.mock, master);
        FileEncryptionKeyService.ScopeKek resolved = racedService.activeKekForOwner(teamUser(9));
        assertThat(resolved.keyId()).isEqualTo(winner.getKeyId());
        assertThat(resolved.key()).isEqualTo(winnerKek);
    }

    @Test
    void createActive_raceWithoutWinner_rethrows() {
        doThrow(new DataIntegrityViolationException("duplicate key"))
                .when(repo.mock)
                .saveAndFlush(any(FileEncryptionKey.class));
        assertThatThrownBy(() -> service.activeKekForOwner(teamUser(9)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
