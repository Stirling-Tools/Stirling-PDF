package stirling.software.proprietary.policy.output;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;

import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

class ProcessingFolderOriginalCleanupTest {
    private static final Instant START = Instant.parse("2026-09-01T12:00:00Z");

    @TempDir Path tempDir;
    private Path directory;
    private Policy policy;
    private final PolicyStore policies = mock(PolicyStore.class);
    private final SourceStore sources = mock(SourceStore.class);
    private final FolderAccessGuard guard = mock(FolderAccessGuard.class);
    private final InProcessProcessedLedger ledger = new InProcessProcessedLedger();
    private ProcessingFolderOriginalCleanup cleanup;

    @BeforeEach
    void setUp() throws Exception {
        directory = Files.createDirectory(tempDir.resolve("watched")).toRealPath();
        policy =
                new Policy(
                                "p",
                                "watched",
                                null,
                                false,
                                List.of(PipelineInput.manual("s")),
                                List.of(),
                                OutputSpec.inline())
                        .withSurface(Policy.SURFACE_PROCESSING_FOLDER);
        when(policies.all()).thenReturn(List.of(policy));
        when(sources.get("s"))
                .thenReturn(
                        Optional.of(
                                new Source(
                                        "s",
                                        "watched",
                                        "folder",
                                        Map.of("directory", directory.toString()),
                                        true,
                                        null,
                                        null)));
        when(guard.requirePermitted(any(Path.class))).thenAnswer(call -> call.getArgument(0));
        cleanup = new ProcessingFolderOriginalCleanup(policies, sources, guard, ledger);
    }

    @ParameterizedTest
    @ValueSource(strings = {"a.pdf", "originals/a.pdf"})
    void expiresBothLayoutsSevenDaysAfterObservedDeletionAcrossRestarts(String location)
            throws Exception {
        Path original = original(location);
        Files.setLastModifiedTime(original, FileTime.from(START.minus(Duration.ofDays(100))));

        cleanup.sweep(START);
        cleanup.sweep(START.plus(Duration.ofDays(7)).minusSeconds(1));
        assertThat(Files.exists(original)).isTrue();

        new ProcessingFolderOriginalCleanup(policies, sources, guard, ledger)
                .sweep(START.plus(Duration.ofDays(7)));

        assertThat(Files.exists(original)).isFalse();
        assertThat(Files.exists(marker())).isFalse();
    }

    @Test
    void aPresentFileNeverExpiresItsOriginal() throws Exception {
        Path original = original("a.pdf");
        Files.writeString(directory.resolve("a.pdf"), "processed");
        cleanup.sweep(START);
        cleanup.sweep(START.plus(Duration.ofDays(100)));
        assertThat(Files.readString(original)).isEqualTo("original");
        assertThat(Files.exists(marker())).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"tmp", "originals"})
    void escapedNamesExpireOnlyAfterTheirActualFilesDisappear(String name) throws Exception {
        Files.createDirectories(directory.resolve(".stirling/originals"));
        Path original = FolderOutputSink.originalPath(directory, name);
        Files.writeString(original, "original");
        Path input = Files.writeString(directory.resolve(name), "processed");
        cleanup.sweep(START);
        cleanup.sweep(START.plus(Duration.ofDays(100)));
        assertThat(Files.exists(original)).isTrue();

        Files.delete(input);
        cleanup.sweep(START.plus(Duration.ofDays(101)));
        cleanup.sweep(START.plus(Duration.ofDays(108)));

        assertThat(Files.exists(original)).isFalse();
        assertThat(Files.isDirectory(directory.resolve(".stirling/originals"))).isTrue();
    }

    @Test
    void returningFilesResetTheGracePeriod() throws Exception {
        Path original = original("a.pdf");
        cleanup.sweep(START);
        Files.writeString(directory.resolve("a.pdf"), "returned");
        cleanup.sweep(START.plus(Duration.ofDays(6)));
        assertThat(Files.exists(marker())).isFalse();
        Files.delete(directory.resolve("a.pdf"));

        cleanup.sweep(START.plus(Duration.ofDays(8)));
        cleanup.sweep(START.plus(Duration.ofDays(14)));
        assertThat(Files.exists(original)).isTrue();
        cleanup.sweep(START.plus(Duration.ofDays(15)));
        assertThat(Files.exists(original)).isFalse();
    }

    @Test
    void reprocessingResetsExpiryEvenWithoutAnInterveningCleanupScan() throws Exception {
        Path original = original("a.pdf");
        cleanup.sweep(START);
        Path input = Files.writeString(directory.resolve("a.pdf"), "returned");
        new FolderOutputSink(guard, ledger)
                .deliver(
                        new OutputDelivery(
                                "run",
                                "p",
                                PolicyInputs.of(List.of(new FileSystemResource(input)))),
                        List.of(new ByteArrayResource("processed".getBytes())),
                        new OutputSpec(
                                "folder",
                                Map.of("directory", directory.toString(), "replace", true)));
        assertThat(Files.exists(marker())).isFalse();
        Files.delete(input);

        cleanup.sweep(START.plus(Duration.ofDays(8)));
        assertThat(Files.exists(original)).isTrue();
        cleanup.sweep(START.plus(Duration.ofDays(15)));
        assertThat(Files.exists(original)).isFalse();
    }

    @Test
    void inFlightFilesKeepTheirBackupsAndResetExpiry() throws Exception {
        Path original = original("a.pdf");
        cleanup.sweep(START);
        String identity = directory.resolve("a.pdf").toString();
        ledger.claim("p", identity, "gate", null);

        cleanup.sweep(START.plus(Duration.ofDays(8)));
        assertThat(Files.exists(original)).isTrue();
        assertThat(Files.exists(marker())).isFalse();
        ledger.forget("p", identity);
        cleanup.sweep(START.plus(Duration.ofDays(9)));
        assertThat(Files.exists(original)).isTrue();
    }

    @Test
    void anUnavailableFolderCannotAgeOrDeleteBackups() throws Exception {
        original("a.pdf");
        cleanup.sweep(START);
        Path offline = tempDir.resolve("offline");
        Files.move(directory, offline);
        Files.writeString(directory, "not a directory");

        cleanup.sweep(START.plus(Duration.ofDays(8)));

        assertThat(Files.readString(offline.resolve(".stirling/a.pdf"))).isEqualTo("original");
        Files.delete(directory);
        Files.move(offline, directory);
        Files.writeString(directory.resolve("a.pdf"), "returned");
        cleanup.sweep(START.plus(Duration.ofDays(9)));
        assertThat(Files.exists(marker())).isFalse();
    }

    @Test
    void deniedRootsCannotBeCleaned() throws Exception {
        Path original = original("a.pdf");
        cleanup.sweep(START);
        when(guard.requirePermitted(any(Path.class)))
                .thenThrow(new IllegalArgumentException("denied"));
        cleanup.sweep(START.plus(Duration.ofDays(8)));
        assertThat(Files.exists(original)).isTrue();
    }

    @Test
    void changedBackupsStartANewGracePeriod() throws Exception {
        Path original = original("a.pdf");
        cleanup.sweep(START);
        Files.writeString(original, "different original");
        cleanup.sweep(START.plus(Duration.ofDays(8)));
        assertThat(Files.exists(original)).isTrue();
        cleanup.sweep(START.plus(Duration.ofDays(15)));
        assertThat(Files.exists(original)).isFalse();
    }

    @Test
    void malformedMarkersRestartRetentionInsteadOfAuthorizingDeletion() throws Exception {
        Path original = original("a.pdf");
        Files.writeString(marker(), "interrupted metadata write");
        Files.setLastModifiedTime(marker(), FileTime.from(START.minus(Duration.ofDays(100))));
        cleanup.sweep(START);
        assertThat(Files.exists(original)).isTrue();
        assertThat(Files.getLastModifiedTime(marker()).toInstant()).isEqualTo(START);
    }

    @Test
    void ordinaryPoliciesAndRemovedProcessingFoldersDoNotAuthorizeCleanup() throws Exception {
        Path original = original("a.pdf");
        when(policies.all()).thenReturn(List.of(policy.withSurface(Policy.SURFACE_POLICY)));
        cleanup.sweep(START);
        assertThat(Files.exists(marker())).isFalse();
        when(policies.all()).thenReturn(List.of());
        cleanup.sweep(START.plus(Duration.ofDays(100)));
        assertThat(Files.exists(original)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void teamPolicyReplacementOutputsReceiveRetention(boolean savedDestination) throws Exception {
        Path original = original("a.pdf");
        OutputSpec output =
                new OutputSpec(
                        "folder", Map.of("directory", directory.toString(), "replace", true));
        Policy teamPolicy = policy.withSurface(Policy.SURFACE_POLICY).withOutput(output);
        if (savedDestination) {
            when(sources.get("output"))
                    .thenReturn(
                            Optional.of(
                                    new Source(
                                            "output",
                                            "Output",
                                            "folder",
                                            output.options(),
                                            false,
                                            null,
                                            1L)));
            teamPolicy =
                    teamPolicy.withOutput(OutputSpec.inline()).withOutputIds(List.of("output"));
        }
        when(policies.all()).thenReturn(List.of(teamPolicy));

        cleanup.sweep(START);
        cleanup.sweep(START.plus(Duration.ofDays(7)));

        assertThat(Files.exists(original)).isFalse();
    }

    @Test
    void teamPolicyOutputsRetainOriginalsWhileTheirFilesExist() throws Exception {
        Path original = original("a.pdf");
        when(policies.all())
                .thenReturn(
                        List.of(
                                policy.withSurface(Policy.SURFACE_POLICY)
                                        .withOutput(
                                                new OutputSpec(
                                                        "folder",
                                                        Map.of(
                                                                "directory",
                                                                directory.toString(),
                                                                "replace",
                                                                true)))));
        Files.writeString(directory.resolve("a.pdf"), "processed");

        cleanup.sweep(START);
        cleanup.sweep(START.plus(Duration.ofDays(100)));

        assertThat(Files.readString(original)).isEqualTo("original");
        assertThat(Files.exists(marker())).isFalse();
    }

    @Test
    void metadataIsExcludedFromRestoreAndRemovedWhenTheBackupDisappears() throws Exception {
        Path original = original("a.pdf");
        cleanup.sweep(START);
        assertThat(FolderOutputSink.originalNames(directory)).containsExactly("a.pdf");
        Files.delete(original);
        cleanup.sweep(START.plusSeconds(1));
        assertThat(Files.exists(marker())).isFalse();
    }

    @Test
    void stagingAndNestedHistoryAreNeverMistakenForOriginals() throws Exception {
        Path staged = original("tmp/staged.pdf");
        Path history = original("originals/superseded/a.pdf");
        cleanup.sweep(START);
        cleanup.sweep(START.plus(Duration.ofDays(100)));
        assertThat(Files.exists(staged)).isTrue();
        assertThat(Files.exists(history)).isTrue();
    }

    private Path original(String location) throws Exception {
        Path original = directory.resolve(".stirling").resolve(location);
        Files.createDirectories(original.getParent());
        return Files.writeString(original, "original");
    }

    private Path marker() {
        return FolderOutputSink.missingOriginalMarker(directory, "a.pdf");
    }
}
