package stirling.software.proprietary.policy.input;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.env.StandardEnvironment;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.FileReadinessChecker;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.source.InProcessSourceStore;

/**
 * Tests for {@link FolderInputSource}: consume mode tracks files IN PLACE through the ledger (claim
 * on pickup, settle on completion, reprocess on change), snapshot stays stateless, and discovery
 * skips hidden entries and honours the recursive option.
 */
@ExtendWith(MockitoExtension.class)
class FolderInputSourceTest {

    private static final String POLICY = "p1";

    @Mock private FileReadinessChecker readinessChecker;

    @TempDir Path tempDir;

    private FolderInputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowedFolderRoots(List.of(tempDir.toString()));
        FolderAccessGuard guard =
                new FolderAccessGuard(
                        properties, new StandardEnvironment(), new InProcessSourceStore());
        source = new FolderInputSource(readinessChecker, guard);
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
        // Lenient: the missing-dir / nonexistent-dir cases return before any readiness check.
        lenient().when(readinessChecker.isReady(any())).thenReturn(true);
    }

    @Test
    void consumeTracksFilesInPlaceAndRunsEachVersionOnce() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("doc.pdf");
        Files.writeString(file, "data");

        List<ResolvedInput> work = source.resolve(InputSpec.folder(inputDir.toString()), ctx);

        assertEquals(1, work.size());
        assertEquals(1, work.get(0).inputs().primary().size());
        // The file stays exactly where the user put it; no work dir appears.
        assertTrue(Files.exists(file));
        assertTrue(Files.notExists(inputDir.resolve(".stirling")));

        // In flight: a second sweep does not pick it up again.
        assertTrue(source.resolve(InputSpec.folder(inputDir.toString()), ctx).isEmpty());

        // Settled: still skipped, and still in place.
        work.get(0).onComplete().accept(true);
        assertTrue(source.resolve(InputSpec.folder(inputDir.toString()), ctx).isEmpty());
        assertTrue(Files.exists(file));
    }

    @Test
    void aChangedFileIsReprocessed() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("doc.pdf");
        Files.writeString(file, "data");

        source.resolve(InputSpec.folder(inputDir.toString()), ctx).get(0).onComplete().accept(true);
        Files.writeString(file, "data v2 - longer");

        assertEquals(1, source.resolve(InputSpec.folder(inputDir.toString()), ctx).size());
    }

    @Test
    void aFailedFileIsNotRetriedUntilItChanges() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("doc.pdf");
        Files.writeString(file, "data");

        source.resolve(InputSpec.folder(inputDir.toString()), ctx)
                .get(0)
                .onComplete()
                .accept(false);

        assertTrue(source.resolve(InputSpec.folder(inputDir.toString()), ctx).isEmpty());

        Files.setLastModifiedTime(file, FileTime.from(Instant.now().plusSeconds(60)));
        assertEquals(1, source.resolve(InputSpec.folder(inputDir.toString()), ctx).size());
    }

    @Test
    void snapshotReadsStatelesslyEverySweep() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Files.writeString(inputDir.resolve("doc.pdf"), "data");
        InputSpec spec =
                new InputSpec(
                        "folder", Map.of("directory", inputDir.toString(), "mode", "snapshot"));

        List<ResolvedInput> first = source.resolve(spec, ctx);
        first.get(0).onComplete().accept(true);
        List<ResolvedInput> second = source.resolve(spec, ctx);

        assertEquals(1, first.size());
        assertEquals(1, second.size()); // no ledger involvement: every run sees the full set
        assertTrue(ctx.present.isEmpty());
        assertTrue(Files.exists(inputDir.resolve("doc.pdf")));
    }

    @Test
    void hiddenFilesAndTheLegacyWorkDirAreIgnored() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Files.writeString(inputDir.resolve("doc.pdf"), "data");
        Files.writeString(inputDir.resolve(".hidden.pdf"), "secret");
        Path legacy = Files.createDirectories(inputDir.resolve(".stirling").resolve("done"));
        Files.writeString(legacy.resolve("old.pdf"), "processed long ago");

        List<ResolvedInput> work = source.resolve(InputSpec.folder(inputDir.toString()), ctx);

        assertEquals(1, work.size());
        assertEquals(1, ctx.present.size());
        assertTrue(ctx.present.get(0).endsWith("doc.pdf"));
    }

    @Test
    void recursiveDiscoversSubdirectoriesButNotHiddenOnes() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Files.writeString(inputDir.resolve("top.pdf"), "a");
        Path sub = Files.createDirectories(inputDir.resolve("sub"));
        Files.writeString(sub.resolve("nested.pdf"), "b");
        Path hiddenDir = Files.createDirectories(inputDir.resolve(".stirling"));
        Files.writeString(hiddenDir.resolve("skipped.pdf"), "c");

        InputSpec flat = InputSpec.folder(inputDir.toString());
        InputSpec recursive =
                new InputSpec(
                        "folder", Map.of("directory", inputDir.toString(), "recursive", "true"));

        assertEquals(1, source.resolve(flat, ctx).size());
        assertEquals(1, source.resolve(recursive, ctx).size()); // top.pdf already claimed above
        assertTrue(ctx.present.stream().anyMatch(identity -> identity.endsWith("nested.pdf")));
        assertTrue(ctx.present.stream().noneMatch(identity -> identity.endsWith("skipped.pdf")));
    }

    @Test
    void unreadyFilesAreReportedPresentButNotClaimed() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("mid-write.pdf");
        Files.writeString(file, "partial");
        when(readinessChecker.isReady(file)).thenReturn(false);

        List<ResolvedInput> work = source.resolve(InputSpec.folder(inputDir.toString()), ctx);

        assertTrue(work.isEmpty());
        // Present, so a full sweep will not prune its ledger row while it settles on disk.
        assertEquals(1, ctx.present.size());
        assertTrue(ctx.present.get(0).endsWith("mid-write.pdf"));
    }

    @Test
    void nestedSourcesShareThePolicysLedgerAndDoNotDoubleClaim() throws IOException {
        Path parent = Files.createDirectories(tempDir.resolve("in"));
        Path child = Files.createDirectories(parent.resolve("sub"));
        Files.writeString(child.resolve("doc.pdf"), "data");
        InputSpec parentRecursive =
                new InputSpec(
                        "folder", Map.of("directory", parent.toString(), "recursive", "true"));
        InputSpec childFlat = InputSpec.folder(child.toString());

        // Same sweep, same policy context: whichever source resolves first wins the file.
        assertEquals(1, source.resolve(parentRecursive, ctx).size());
        assertTrue(source.resolve(childFlat, ctx).isEmpty());
    }

    @Test
    void missingDirectoryOptionFails() {
        assertThrows(
                IllegalArgumentException.class,
                () -> source.resolve(new InputSpec("folder", Map.of()), ctx));
    }

    @Test
    void anUnknownIdentityModeIsRejected() {
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        source.validate(
                                new InputSpec(
                                        "folder",
                                        Map.of(
                                                "directory",
                                                tempDir.toString(),
                                                "identity",
                                                "guesswork"))));
    }

    @Test
    void nonexistentDirectoryYieldsNoWork() throws IOException {
        List<ResolvedInput> work =
                source.resolve(InputSpec.folder(tempDir.resolve("nope").toString()), ctx);
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
                () -> source.resolve(InputSpec.folder(outside.toString()), ctx));
        assertThrows(
                IllegalArgumentException.class,
                () -> source.validate(InputSpec.folder(outside.toString())));
    }

    @Test
    void watchTargetsIsTheConfiguredDirectory() {
        Path inputDir = tempDir.resolve("in");
        assertEquals(List.of(inputDir), source.watchTargets(InputSpec.folder(inputDir.toString())));
    }

    /** Policy-scoped context backed by the in-process ledger, recording presence reports. */
    private class RecordingContext implements ResolveContext {

        private final List<String> present = new ArrayList<>();

        @Override
        public boolean claim(String identity, String signature) {
            return ledger.claim(POLICY, identity, signature);
        }

        @Override
        public void settle(String identity, String finalSignature, boolean success) {
            ledger.settle(POLICY, identity, finalSignature, success);
        }

        @Override
        public void reportPresent(Collection<String> identities) {
            present.addAll(identities);
        }
    }
}
