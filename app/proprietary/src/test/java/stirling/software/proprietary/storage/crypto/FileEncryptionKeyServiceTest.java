package stirling.software.proprietary.storage.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
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
    void verifyMasterKey_halfRotatedRegistryWithPreviousKeyRemoved_refusesStartup()
            throws Exception {
        // Team 1 gets re-wrapped under the new master key; team 2 does not, because the rotation
        // stopped part-way (or was never run).
        FileEncryptionKeyService.ScopeKek rewrapped = service.activeKekForOwner(teamUser(1));
        FileEncryptionKeyService.ScopeKek leftBehind = service.activeKekForOwner(teamUser(2));
        FileEncryptionMasterKey rotating =
                new FileEncryptionMasterKey(MASTER_B, MASTER_A, 2, false);
        FileEncryptionKey row = repo.rows.get(rewrapped.keyId());
        row.setWrappedKey(
                Base64.getEncoder()
                        .encodeToString(
                                rotating.wrap(
                                        rewrapped.key(),
                                        rewrapped
                                                .keyId()
                                                .toString()
                                                .getBytes(StandardCharsets.US_ASCII))));
        row.setMasterKeyVersion(2);

        // The operator now removes the previous key, believing rotation finished. Team 2's files
        // are only recoverable while MASTER_A still exists, so startup must not look healthy.
        FileEncryptionKeyService afterRemoval =
                new FileEncryptionKeyService(
                        repo.mock, new FileEncryptionMasterKey(MASTER_B, null, 2, false));

        assertThatThrownBy(afterRemoval::verifyMasterKey)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cannot unwrap 1 of 2")
                .hasMessageContaining(leftBehind.keyId().toString())
                .hasMessageContaining("Refusing to start");
    }

    @Test
    void verifyMasterKey_disabledRowThatCannotUnwrap_refusesStartup() throws Exception {
        // Revocation is advertised as reversible, so an unreadable DISABLED row is just as much a
        // loss of access as an unreadable ACTIVE one - it would not come back on enable.
        FileEncryptionKeyService.ScopeKek created = service.activeKekForOwner(teamUser(1));
        service.setKeyStatus(created.keyId(), FileEncryptionKey.Status.DISABLED, "admin");

        FileEncryptionKeyService wrongKey =
                new FileEncryptionKeyService(
                        repo.mock, new FileEncryptionMasterKey(MASTER_B, false));

        assertThatThrownBy(wrongKey::verifyMasterKey)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cannot unwrap 1 of 1");
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
    void setKeyStatus_disable_takesEffectImmediatelyOnSameService() throws Exception {
        FileEncryptionKeyService.ScopeKek created = service.activeKekForOwner(teamUser(1));
        // The unwrap cache is warm from creation; disabling must invalidate it, not wait for TTL.
        service.setKeyStatus(created.keyId(), FileEncryptionKey.Status.DISABLED, "admin");
        assertThatThrownBy(() -> service.kekForDecrypt(created.keyId()))
                .isInstanceOf(StorageKeyRevokedException.class);
        assertThat(repo.rows.get(created.keyId()).getStatusChangedBy()).isEqualTo("admin");

        service.setKeyStatus(created.keyId(), FileEncryptionKey.Status.ACTIVE, "admin");
        assertThat(service.kekForDecrypt(created.keyId())).isEqualTo(created.key());
    }

    @Test
    void unwrap_fallsBackToPreviousMasterKeyDuringRotation() throws Exception {
        FileEncryptionKeyService.ScopeKek created = service.activeKekForOwner(teamUser(1));

        // New primary key B, old key A kept as previous, version bumped to 2.
        FileEncryptionMasterKey rotated = new FileEncryptionMasterKey(MASTER_B, MASTER_A, 2, false);
        FileEncryptionKeyService rotatedService = new FileEncryptionKeyService(repo.mock, rotated);
        assertThat(rotatedService.kekForDecrypt(created.keyId())).isEqualTo(created.key());
        rotatedService.verifyMasterKey(); // must pass via the previous-key fallback
    }

    @Test
    void rotateMasterKey_rewrapsRowsBelowCurrentVersion() throws Exception {
        FileEncryptionKeyService.ScopeKek created = service.activeKekForOwner(teamUser(1));
        String wrappedBefore = repo.rows.get(created.keyId()).getWrappedKey();

        FileEncryptionMasterKey rotated = new FileEncryptionMasterKey(MASTER_B, MASTER_A, 2, false);
        FileEncryptionKeyService rotatedService = new FileEncryptionKeyService(repo.mock, rotated);
        assertThat(rotatedService.rotateMasterKey()).isEqualTo(1);

        FileEncryptionKey row = repo.rows.get(created.keyId());
        assertThat(row.getMasterKeyVersion()).isEqualTo(2);
        assertThat(row.getWrappedKey()).isNotEqualTo(wrappedBefore);

        // Same key material now unwraps WITHOUT the previous key configured.
        FileEncryptionKeyService afterCleanup =
                new FileEncryptionKeyService(
                        repo.mock, new FileEncryptionMasterKey(MASTER_B, null, 2, false));
        assertThat(afterCleanup.kekForDecrypt(created.keyId())).isEqualTo(created.key());

        // Second rotation call is a no-op.
        assertThat(rotatedService.rotateMasterKey()).isZero();
    }

    @Test
    void enable_afterScopeMintedAnotherKey_comesBackRetiredNotSecondActive() throws Exception {
        FileEncryptionKeyService.ScopeKek revoked = service.activeKekForOwner(teamUser(1));
        service.setKeyStatus(revoked.keyId(), FileEncryptionKey.Status.DISABLED, "admin");

        // Revoking does not stop the team uploading: this mints a second key for the scope.
        FileEncryptionKeyService.ScopeKek minted = service.activeKekForOwner(teamUser(1));
        assertThat(minted.keyId()).isNotEqualTo(revoked.keyId());

        FileEncryptionKey reEnabled = service.enable(revoked.keyId(), "admin");

        assertThat(reEnabled.getStatus()).isEqualTo(FileEncryptionKey.Status.RETIRED);
        assertThat(activeKeysForTeam(1)).containsExactly(minted.keyId());
        // RETIRED still unwraps, so the revoked content is readable again.
        assertThat(service.kekForDecrypt(revoked.keyId())).isEqualTo(revoked.key());
    }

    @Test
    void enable_scopeHasNoOtherActiveKey_comesBackActive() throws Exception {
        FileEncryptionKeyService.ScopeKek created = service.activeKekForOwner(teamUser(1));
        service.setKeyStatus(created.keyId(), FileEncryptionKey.Status.DISABLED, "admin");

        FileEncryptionKey reEnabled = service.enable(created.keyId(), "admin");

        assertThat(reEnabled.getStatus()).isEqualTo(FileEncryptionKey.Status.ACTIVE);
        assertThat(activeKeysForTeam(1)).containsExactly(created.keyId());
        assertThat(service.kekForDecrypt(created.keyId())).isEqualTo(created.key());
    }

    @Test
    void activeKekForOwner_twoActiveRowsInScope_picksTheHighestVersionOnEveryNode()
            throws Exception {
        // A registry left in the pre-fix shape (an older build re-enabled a key straight to
        // ACTIVE).
        FileEncryptionKeyService.ScopeKek older = service.activeKekForOwner(teamUser(1));
        service.setKeyStatus(older.keyId(), FileEncryptionKey.Status.DISABLED, "admin");
        FileEncryptionKeyService.ScopeKek newer = service.activeKekForOwner(teamUser(1));
        service.setKeyStatus(older.keyId(), FileEncryptionKey.Status.ACTIVE, "old-build");
        assertThat(activeKeysForTeam(1)).hasSize(2);

        // Two independent nodes (fresh caches) must agree, rather than follow DB row order.
        for (int node = 0; node < 2; node++) {
            FileEncryptionKeyService fresh =
                    new FileEncryptionKeyService(
                            repo.mock, new FileEncryptionMasterKey(MASTER_A, false));
            assertThat(fresh.activeKekForOwner(teamUser(1)).keyId()).isEqualTo(newer.keyId());
        }
    }

    private List<UUID> activeKeysForTeam(long teamId) {
        return repo.rows.values().stream()
                .filter(r -> r.getScopeType() == FileEncryptionKey.ScopeType.TEAM)
                .filter(r -> r.getScopeId() == teamId)
                .filter(r -> r.getStatus() == FileEncryptionKey.Status.ACTIVE)
                .map(FileEncryptionKey::getKeyId)
                .toList();
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
