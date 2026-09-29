package stirling.software.proprietary.storage.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;

import jakarta.persistence.EntityManager;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;

/**
 * The encrypt-existing migration's queries against a real database. The service-level tests mock
 * {@link StoredFileRepository} wholesale, so without this the JOIN FETCH + Pageable selection and
 * the three compare-and-swap updates would never actually execute — a wrong CAS predicate would
 * pass every mocked test and then silently skip every file in production.
 */
@DataJpaTest
@DirtiesContext
class StoredFileMigrationQueriesDbTest {

    @Autowired private StoredFileRepository repository;
    @Autowired private EntityManager entityManager;

    private User owner;

    @BeforeEach
    void setUp() {
        Team team = new Team();
        team.setName("team-" + UUID.randomUUID());
        entityManager.persist(team);

        owner = new User();
        owner.setUsername("owner-" + UUID.randomUUID());
        owner.setPassword("x");
        owner.setTeam(team);
        entityManager.persist(owner);
        entityManager.flush();
    }

    private StoredFile persistFile(String storageKey, String encryptionKeyId) {
        StoredFile file = new StoredFile();
        file.setOwner(owner);
        file.setOriginalFilename("doc.pdf");
        file.setContentType("application/pdf");
        file.setSizeBytes(123);
        file.setStorageKey(storageKey);
        file.setEncryptionKeyId(encryptionKeyId);
        entityManager.persist(file);
        entityManager.flush();
        return file;
    }

    @Test
    void findMigratableAfter_selectsOnlyPlaintextRows_inIdOrder_withOwnerFetched() {
        StoredFile plain1 = persistFile("k-plain-1", null);
        StoredFile plain2 = persistFile("k-plain-2", null);
        persistFile("k-encrypted", UUID.randomUUID().toString());
        entityManager.clear();

        List<StoredFile> page = repository.findMigratableAfter(0L, PageRequest.of(0, 10));

        assertThat(page)
                .extracting(StoredFile::getId)
                .containsExactly(plain1.getId(), plain2.getId());
        // JOIN FETCH must populate owner (+ its EAGER team) for use outside this session.
        assertThat(page.get(0).getOwner().getUsername()).isEqualTo(owner.getUsername());
        assertThat(page.get(0).getOwner().getTeam()).isNotNull();
    }

    @Test
    void findMigratableAfter_cursorAndPageSizeAreHonoured() {
        StoredFile first = persistFile("k-1", null);
        StoredFile second = persistFile("k-2", null);
        entityManager.clear();

        assertThat(repository.findMigratableAfter(0L, PageRequest.of(0, 1)))
                .extracting(StoredFile::getId)
                .containsExactly(first.getId());
        assertThat(repository.findMigratableAfter(first.getId(), PageRequest.of(0, 10)))
                .extracting(StoredFile::getId)
                .containsExactly(second.getId());
        assertThat(repository.findMigratableAfter(second.getId(), PageRequest.of(0, 10))).isEmpty();
    }

    @Test
    void swapMainBlob_appliesOnlyWhenStorageKeyStillMatches() {
        StoredFile file = persistFile("k-old", null);
        String keyId = UUID.randomUUID().toString();
        entityManager.clear();

        // Stale expectation (someone else replaced the file) -> no row updated.
        assertThat(repository.swapMainBlob(file.getId(), "k-stale", "k-new", keyId)).isZero();

        assertThat(repository.swapMainBlob(file.getId(), "k-old", "k-new", keyId)).isEqualTo(1);
        entityManager.clear();

        StoredFile reloaded = repository.findById(file.getId()).orElseThrow();
        assertThat(reloaded.getStorageKey()).isEqualTo("k-new");
        assertThat(reloaded.getEncryptionKeyId()).isEqualTo(keyId);
        // Stamping the key id must remove the row from the migration's selection.
        assertThat(repository.findMigratableAfter(0L, PageRequest.of(0, 10))).isEmpty();
        assertThat(repository.countByEncryptionKeyIdIsNotNull()).isEqualTo(1);
        assertThat(repository.countByEncryptionKeyIdIsNull()).isZero();
    }

    @Test
    void swapSecondaryBlobs_applyIndependentlyAndLeaveKeyIdAlone() {
        StoredFile file = persistFile("k-main", null);
        file.setHistoryStorageKey("k-hist-old");
        file.setAuditLogStorageKey("k-audit-old");
        entityManager.merge(file);
        entityManager.flush();
        entityManager.clear();

        assertThat(repository.swapHistoryBlob(file.getId(), "k-wrong", "k-hist-new")).isZero();
        assertThat(repository.swapHistoryBlob(file.getId(), "k-hist-old", "k-hist-new"))
                .isEqualTo(1);
        assertThat(repository.swapAuditLogBlob(file.getId(), "k-audit-old", "k-audit-new"))
                .isEqualTo(1);
        entityManager.clear();

        StoredFile reloaded = repository.findById(file.getId()).orElseThrow();
        assertThat(reloaded.getHistoryStorageKey()).isEqualTo("k-hist-new");
        assertThat(reloaded.getAuditLogStorageKey()).isEqualTo("k-audit-new");
        // Secondary swaps must not stamp encryptionKeyId, so the row stays selectable until the
        // main blob is done.
        assertThat(reloaded.getEncryptionKeyId()).isNull();
        assertThat(repository.findMigratableAfter(0L, PageRequest.of(0, 10)))
                .extracting(StoredFile::getId)
                .containsExactly(file.getId());
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage(basePackages = "stirling.software.proprietary")
    static class TestApp {}
}
