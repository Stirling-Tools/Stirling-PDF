package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.migration.InProcessCompletedMigrations;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Tests for {@link PolicyInlineOutputMigration}: policies carrying a folder/S3 destination inline
 * are rewritten to reference a {@link Source} location by id; inline (return-to-caller) policies
 * are left untouched; the pass is idempotent; two policies sharing a destination in one team share
 * one source; and an output at a location an input source already covers reuses that source.
 */
class PolicyInlineOutputMigrationTest {

    private final PolicyStore policyStore = new InProcessPolicyStore();
    private final SourceStore sourceStore = new InProcessSourceStore();
    private final PolicyInlineOutputMigration migration =
            new PolicyInlineOutputMigration(
                    policyStore, sourceStore, new InProcessCompletedMigrations());

    @Test
    void migratesAFolderPolicyToAStoredSource() {
        Policy saved = policyStore.save(folderPolicy("Archive", "/out"));

        migration.migrate();

        Policy migrated = policyStore.get(saved.id()).orElseThrow();
        assertEquals(1, migrated.outputIds().size());
        Source destination = sourceStore.get(migrated.outputIds().get(0)).orElseThrow();
        assertEquals("folder", destination.type());
        assertEquals("/out", destination.options().get("directory"));
    }

    @Test
    void leavesInlinePoliciesUntouched() {
        Policy saved =
                policyStore.save(
                        new Policy(
                                null,
                                "Editor run",
                                "owner",
                                true,
                                null,
                                List.of(),
                                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                                OutputSpec.inline()));

        migration.migrate();

        assertTrue(policyStore.get(saved.id()).orElseThrow().outputIds().isEmpty());
        assertTrue(sourceStore.all().isEmpty());
    }

    @Test
    void isIdempotent() {
        policyStore.save(folderPolicy("Archive", "/out"));

        migration.migrate();
        int afterFirst = sourceStore.all().size();
        migration.migrate();

        assertEquals(afterFirst, sourceStore.all().size());
    }

    @Test
    void skipsTheScanOnceComplete() {
        // First pass records the completion marker (even with nothing to migrate).
        migration.migrate();

        // A migratable folder policy created afterwards is left untouched: the marker means the
        // migration never scans again, rather than re-scanning and finding it every boot.
        Policy later = policyStore.save(folderPolicy("Late", "/late"));
        migration.migrate();

        assertTrue(policyStore.get(later.id()).orElseThrow().outputIds().isEmpty());
        assertTrue(sourceStore.all().isEmpty());
    }

    @Test
    void dedupesASharedDestinationWithinATeam() {
        policyStore.save(teamFolderPolicy("A", "/shared", 7L));
        policyStore.save(teamFolderPolicy("B", "/shared", 7L));

        migration.migrate();

        assertEquals(1, sourceStore.all().size());
    }

    @Test
    void reusesAnExistingInputSourceAtTheSameLocation() {
        // An input source already reads /shared (with consume mode); a policy that outputs there
        // should link to that same source, not mint a duplicate.
        Source existing =
                sourceStore.save(
                        new Source(
                                null,
                                "Shared",
                                "folder",
                                Map.of("directory", "/shared", "mode", "consume"),
                                true,
                                "owner",
                                7L));
        Policy saved = policyStore.save(teamFolderPolicy("Writer", "/shared", 7L));

        migration.migrate();

        assertEquals(1, sourceStore.all().size());
        assertEquals(List.of(existing.id()), policyStore.get(saved.id()).orElseThrow().outputIds());
    }

    private static Policy folderPolicy(String name, String directory) {
        return new Policy(
                null,
                name,
                "owner",
                true,
                null,
                List.of(),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.folder(directory));
    }

    private static Policy teamFolderPolicy(String name, String directory, Long teamId) {
        return new Policy(
                null,
                name,
                "owner",
                true,
                null,
                List.of(),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.folder(directory),
                teamId);
    }
}
