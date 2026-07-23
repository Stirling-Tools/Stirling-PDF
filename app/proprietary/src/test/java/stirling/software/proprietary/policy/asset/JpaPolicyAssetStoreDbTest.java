package stirling.software.proprietary.policy.asset;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

/**
 * {@link JpaPolicyAssetStore} on a real (H2) database: proves the entity (including its LOB column)
 * creates via ddl-auto and round-trips bytes, and that team scoping matches null-team rows.
 */
@DataJpaTest
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
        assertEquals("logo.png", read.fileName());
        assertEquals(7L, read.teamId());
        assertEquals(42L, read.createdAt());
        assertArrayEquals(content, store.content(saved.id()).orElseThrow());
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

        assertEquals(List.of(teamAsset.id()), team.stream().map(PolicyAsset::id).toList());
        assertEquals(List.of(noTeamAsset.id()), noTeam.stream().map(PolicyAsset::id).toList());
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
