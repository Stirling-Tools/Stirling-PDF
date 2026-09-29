package stirling.software.proprietary.policy.asset;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import stirling.software.proprietary.integration.crypto.CredentialEncryption;

/**
 * {@link JpaPolicyAssetStore} on a real (H2) database: proves the entity (including its LOB column)
 * creates via ddl-auto, that bytes round-trip while sitting encrypted in the column, and that the
 * metadata projections select every field in the right order.
 */
@DataJpaTest
@Import(CredentialEncryption.class)
@TestPropertySource(
        properties =
                "stirling.security.credentialEncryptionKey="
                        + "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
class JpaPolicyAssetStoreDbTest {

    @Autowired private PolicyAssetRepository repository;

    @Test
    void savesAndReadsBackMetadataAndContent() {
        JpaPolicyAssetStore store = new JpaPolicyAssetStore(repository);
        byte[] content = new byte[] {1, 2, 3, 4};

        PolicyAsset saved =
                store.save(
                        new PolicyAsset(null, "logo.png", "image/png", 0, "owner", 7L, 42L),
                        content);

        assertFalse(saved.id().isBlank());
        assertEquals(content.length, saved.size());
        PolicyAsset read = store.get(saved.id()).orElseThrow();
        // Every field: a transposed projection argument is invisible to the compiler.
        assertEquals(saved, read);
        assertEquals("logo.png", read.fileName());
        assertEquals("image/png", read.contentType());
        assertEquals("owner", read.owner());
        assertEquals(content.length, read.size());
        assertEquals(7L, read.teamId());
        assertEquals(42L, read.createdAt());
        assertArrayEquals(content, store.content(saved.id()).orElseThrow());
    }

    @Test
    void storesTheBytesEncrypted() {
        JpaPolicyAssetStore store = new JpaPolicyAssetStore(repository);
        byte[] content = "-----BEGIN PRIVATE KEY-----".getBytes();

        PolicyAsset saved =
                store.save(new PolicyAsset(null, "cert.p12", null, 0, null, null, 1L), content);

        byte[] atRest = repository.findById(saved.id()).orElseThrow().getData();
        assertFalse(Arrays.equals(content, atRest));
        assertArrayEquals(content, CredentialEncryption.decryptBytes(atRest));
        // Plaintext length, not the ciphertext's: it is the size the UI shows.
        assertEquals(content.length, saved.size());
    }

    @Test
    void findByTeamScopesRowsAndMatchesNullTeam() {
        JpaPolicyAssetStore store = new JpaPolicyAssetStore(repository);
        PolicyAsset teamAsset =
                store.save(new PolicyAsset(null, "a.pdf", null, 0, null, 7L, 1L), new byte[] {1});
        PolicyAsset noTeamAsset =
                store.save(new PolicyAsset(null, "b.pdf", null, 0, null, null, 2L), new byte[] {2});

        List<PolicyAsset> team = store.findByTeam(7L);
        List<PolicyAsset> noTeam = store.findByTeam(null);

        assertEquals(List.of(teamAsset), team);
        assertEquals(List.of(noTeamAsset.id()), noTeam.stream().map(PolicyAsset::id).toList());
    }

    @Test
    void allReturnsEveryAssetNewestFirst() {
        JpaPolicyAssetStore store = new JpaPolicyAssetStore(repository);
        PolicyAsset oldest =
                store.save(new PolicyAsset(null, "a.pdf", null, 0, null, 7L, 1L), new byte[] {1});
        PolicyAsset newest =
                store.save(new PolicyAsset(null, "b.pdf", null, 0, null, 99L, 3L), new byte[] {2});

        assertEquals(
                List.of(newest.id(), oldest.id()),
                store.all().stream().map(PolicyAsset::id).toList());
    }

    @Test
    void idsCreatedBeforeSelectsOnlyOlderRows() {
        JpaPolicyAssetStore store = new JpaPolicyAssetStore(repository);
        PolicyAsset old =
                store.save(new PolicyAsset(null, "old.p12", null, 0, null, 7L, 1L), new byte[] {1});
        store.save(new PolicyAsset(null, "new.p12", null, 0, null, 7L, 1000L), new byte[] {2});

        assertEquals(List.of(old.id()), store.idsCreatedBefore(500L));
    }

    @Test
    void deleteRemovesTheRow() {
        JpaPolicyAssetStore store = new JpaPolicyAssetStore(repository);
        PolicyAsset saved =
                store.save(new PolicyAsset(null, "x.p12", null, 0, null, null, 1L), new byte[] {1});

        assertTrue(store.delete(saved.id()));
        assertFalse(store.get(saved.id()).isPresent());
        assertFalse(store.delete(saved.id()));
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    static class TestApp {}
}
