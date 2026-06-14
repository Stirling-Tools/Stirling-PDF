package stirling.software.proprietary.policy.input;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.eclipse.microprofile.config.Config;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.smallrye.config.SmallRyeConfig;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.FileReadinessChecker;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.model.InputSpec;

/**
 * Tests for {@link FolderInputSource}: consume (claim + route) and snapshot (read-only) modes.
 *
 * <p>MIGRATION (Spring -> Quarkus): {@link FolderAccessGuard} now reads active profiles from
 * MicroProfile {@link Config} instead of Spring's {@code StandardEnvironment}; a {@code Config}
 * reporting no active profile is supplied here.
 */
@ExtendWith(MockitoExtension.class)
class FolderInputSourceTest {

    @Mock private FileReadinessChecker readinessChecker;

    @TempDir Path tempDir;

    private FolderInputSource source;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowedFolderRoots(List.of(tempDir.toString()));
        FolderAccessGuard guard = new FolderAccessGuard(properties, configWithNoProfiles());
        source = new FolderInputSource(readinessChecker, guard);
        // Lenient: the missing-dir / nonexistent-dir cases return before any readiness check.
        lenient().when(readinessChecker.isReady(any())).thenReturn(true);
    }

    /** A {@link Config} whose unwrapped {@link SmallRyeConfig} reports no active profile. */
    private static Config configWithNoProfiles() {
        SmallRyeConfig smallRyeConfig = mock(SmallRyeConfig.class);
        when(smallRyeConfig.getProfiles()).thenReturn(List.of());
        Config config = mock(Config.class);
        when(config.unwrap(SmallRyeConfig.class)).thenReturn(smallRyeConfig);
        return config;
    }

    @Test
    void consumeClaimsFilesAndRoutesToDoneOnSuccess() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Files.writeString(inputDir.resolve("doc.pdf"), "data");

        List<ResolvedInput> work = source.resolve(InputSpec.folder(inputDir.toString()));

        assertEquals(1, work.size());
        assertEquals(1, work.get(0).inputs().primary().size());
        // Claimed out of the input dir.
        assertFalse(Files.exists(inputDir.resolve("doc.pdf")));
        assertTrue(
                Files.exists(
                        inputDir.resolve(".stirling").resolve("processing").resolve("doc.pdf")));

        work.get(0).onComplete().accept(true);
        assertTrue(Files.exists(inputDir.resolve(".stirling").resolve("done").resolve("doc.pdf")));
        assertFalse(
                Files.exists(
                        inputDir.resolve(".stirling").resolve("processing").resolve("doc.pdf")));
    }

    @Test
    void consumeRoutesToErrorOnFailure() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Files.writeString(inputDir.resolve("doc.pdf"), "data");

        List<ResolvedInput> work = source.resolve(InputSpec.folder(inputDir.toString()));
        work.get(0).onComplete().accept(false);

        assertTrue(Files.exists(inputDir.resolve(".stirling").resolve("error").resolve("doc.pdf")));
    }

    @Test
    void snapshotReadsWithoutClaiming() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Files.writeString(inputDir.resolve("doc.pdf"), "data");

        List<ResolvedInput> work =
                source.resolve(
                        new InputSpec(
                                "folder",
                                Map.of("directory", inputDir.toString(), "mode", "snapshot")));

        assertEquals(1, work.size());
        // Not moved, and completing the run is a no-op.
        assertTrue(Files.exists(inputDir.resolve("doc.pdf")));
        work.get(0).onComplete().accept(true);
        assertTrue(Files.exists(inputDir.resolve("doc.pdf")));
    }

    @Test
    void missingDirectoryOptionFails() {
        assertThrows(
                IllegalArgumentException.class,
                () -> source.resolve(new InputSpec("folder", Map.of())));
    }

    @Test
    void nonexistentDirectoryYieldsNoWork() throws IOException {
        List<ResolvedInput> work =
                source.resolve(InputSpec.folder(tempDir.resolve("nope").toString()));
        assertTrue(work.isEmpty());
    }

    @Test
    void validateRejectsMissingDirectory() {
        assertThrows(
                IllegalArgumentException.class,
                () -> source.validate(new InputSpec("folder", Map.of())));
    }

    @Test
    void rejectsADirectoryOutsideTheAllowedRoots() {
        Path outside = tempDir.resolveSibling("not-allowed");
        assertThrows(
                IllegalArgumentException.class,
                () -> source.resolve(InputSpec.folder(outside.toString())));
        assertThrows(
                IllegalArgumentException.class,
                () -> source.validate(InputSpec.folder(outside.toString())));
    }

    @Test
    void watchTargetsIsTheConfiguredDirectory() {
        Path inputDir = tempDir.resolve("in");
        assertEquals(List.of(inputDir), source.watchTargets(InputSpec.folder(inputDir.toString())));
    }
}
