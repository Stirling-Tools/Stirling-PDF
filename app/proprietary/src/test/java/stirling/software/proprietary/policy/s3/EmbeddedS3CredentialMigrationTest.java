package stirling.software.proprietary.policy.s3;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.security.repository.TeamRepository;

/**
 * Tests for {@link EmbeddedS3CredentialMigration}: legacy embedded credentials become deduplicated
 * team-scoped connections, rewritten rows keep only per-use options, and re-runs are no-ops.
 */
@ExtendWith(MockitoExtension.class)
class EmbeddedS3CredentialMigrationTest {

    @Mock private IntegrationConfigRepository connections;
    @Mock private TeamRepository teamRepository;

    private final InProcessSourceStore sourceStore = new InProcessSourceStore();
    private final InProcessPolicyStore policyStore = new InProcessPolicyStore();
    private EmbeddedS3CredentialMigration migration;

    @BeforeEach
    void setUp() {
        migration =
                new EmbeddedS3CredentialMigration(
                        sourceStore, policyStore, connections, teamRepository);
        AtomicLong ids = new AtomicLong(100);
        // Lenient: the nothing-to-migrate cases never create a connection.
        lenient().when(connections.findAll()).thenReturn(List.of());
        lenient()
                .when(connections.save(any()))
                .thenAnswer(
                        invocation -> {
                            IntegrationConfig saved = invocation.getArgument(0);
                            if (saved.getId() == null) {
                                saved.setId(ids.incrementAndGet());
                            }
                            return saved;
                        });
    }

    @Test
    void extractsSharedCredentialsIntoOneTeamScopedConnection() {
        Team team = new Team();
        team.setId(7L);
        when(teamRepository.findById(7L)).thenReturn(Optional.of(team));
        Source source =
                sourceStore.save(
                        new Source(
                                null,
                                "Claims intake",
                                "s3",
                                Map.of(
                                        "bucket", "inbox",
                                        "prefix", "incoming/",
                                        "mode", "snapshot",
                                        "accessKeyId", "AKIAEXAMPLE",
                                        "secretAccessKey", "shh"),
                                true,
                                "alice",
                                7L));
        Policy policy =
                policyStore.save(
                        new Policy(
                                null,
                                "Rotate",
                                "alice",
                                true,
                                null,
                                List.of(source.id()),
                                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                                new OutputSpec(
                                        "s3",
                                        Map.of(
                                                "bucket", "inbox",
                                                "prefix", "processed/",
                                                "accessKeyId", "AKIAEXAMPLE",
                                                "secretAccessKey", "shh")),
                                7L));

        migration.migrate();

        // Same bucket + credentials on both rows: exactly one connection extracted.
        verify(connections, times(1)).save(any());
        Map<String, Object> sourceOptions = sourceStore.get(source.id()).orElseThrow().options();
        assertEquals(101L, sourceOptions.get("connectionId"));
        assertEquals("incoming/", sourceOptions.get("prefix"));
        assertEquals("snapshot", sourceOptions.get("mode"));
        assertNull(sourceOptions.get("accessKeyId"));
        assertNull(sourceOptions.get("secretAccessKey"));
        assertNull(sourceOptions.get("bucket"));

        Map<String, Object> outputOptions =
                policyStore.get(policy.id()).orElseThrow().output().options();
        assertEquals(101L, outputOptions.get("connectionId"));
        assertEquals("processed/", outputOptions.get("prefix"));
        assertNull(outputOptions.get("secretAccessKey"));
    }

    @Test
    void connectionOwnershipFollowsTheSourceTeam() {
        Team team = new Team();
        team.setId(7L);
        when(teamRepository.findById(7L)).thenReturn(Optional.of(team));
        sourceStore.save(s3Source("teamed", 7L));

        migration.migrate();

        verify(connections)
                .save(
                        org.mockito.ArgumentMatchers.argThat(
                                connection ->
                                        connection.getScope() == OwnerScope.TEAM
                                                && connection.getOwnerTeam() == team));
    }

    @Test
    void teamlessRowsBecomeServerScopedConnections() {
        sourceStore.save(s3Source("solo", null));

        migration.migrate();

        verify(connections)
                .save(
                        org.mockito.ArgumentMatchers.argThat(
                                connection -> connection.getScope() == OwnerScope.SERVER));
    }

    @Test
    void aSecondRunFindsNothingToDo() {
        sourceStore.save(s3Source("once", null));

        migration.migrate();
        migration.migrate();

        // One connection from the first run; the rewritten source no longer embeds credentials.
        verify(connections, times(1)).save(any());
    }

    @Test
    void nonS3AndAlreadyMigratedRowsAreUntouched() {
        Source folder =
                sourceStore.save(
                        new Source(
                                null,
                                "Folder",
                                "folder",
                                Map.of("directory", "/in"),
                                true,
                                "alice",
                                null));
        Source migrated =
                sourceStore.save(
                        new Source(
                                null,
                                "Done already",
                                "s3",
                                Map.of("connectionId", 55L, "prefix", "in/"),
                                true,
                                "alice",
                                null));

        migration.migrate();

        verify(connections, times(0)).save(any());
        assertEquals(
                Map.of("directory", "/in"), sourceStore.get(folder.id()).orElseThrow().options());
        assertEquals(
                Map.of("connectionId", 55L, "prefix", "in/"),
                sourceStore.get(migrated.id()).orElseThrow().options());
    }

    private static Source s3Source(String name, Long teamId) {
        return new Source(
                null,
                name,
                "s3",
                Map.of(
                        "bucket", "inbox",
                        "accessKeyId", "AKIAEXAMPLE",
                        "secretAccessKey", "shh"),
                true,
                "alice",
                teamId);
    }
}
