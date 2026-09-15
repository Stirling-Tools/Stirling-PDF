package stirling.software.proprietary.policy.input;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static stirling.software.proprietary.policy.input.InputSourceTestFixtures.persistedSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.env.StandardEnvironment;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.FileReadinessChecker;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.source.InProcessSourceStore;

/**
 * Tests for {@link FolderInputSource}: consume mode tracks files in place through the ledger,
 * snapshot stays stateless, and discovery skips hidden entries and honours the recursive option.
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
        // With login off the guard permits the local operator everywhere; these tests
        // exercise the allowlist, so they opt into login like a hosted install.
        properties.getSecurity().setEnableLogin(true);
        properties.getPolicies().setAllowedFolderRoots(List.of(tempDir.toString()));
        FolderAccessGuard guard =
                new FolderAccessGuard(
                        properties,
                        new RuntimePathConfig(properties),
                        new StandardEnvironment(),
                        new InProcessSourceStore());
        source = new FolderInputSource(readinessChecker, guard);
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
        // Lenient: the missing-dir / nonexistent-dir cases return before any readiness check.
        lenient().when(readinessChecker.isReady(any())).thenReturn(true);
    }

    @Test
    void consumeRemovesTheFileOnceProcessed() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("doc.pdf");
        Files.writeString(file, "data");

        List<ResolvedInput> work =
                source.resolve(
                        persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice");

        assertEquals(1, work.size());
        assertEquals(1, work.get(0).inputs().primary().size());
        // In flight: still on disk, but a second sweep does not pick it up again.
        assertTrue(Files.exists(file));
        assertTrue(Files.notExists(inputDir.resolve(".stirling")));
        assertTrue(
                source.resolve(persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice")
                        .isEmpty());

        work.get(0).onComplete().accept(true);
        assertTrue(Files.notExists(file));
        assertTrue(
                source.resolve(persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice")
                        .isEmpty());
    }

    @Test
    void aFileReplacedMidRunSurvivesTheDeleteAndRunsAgain() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("doc.pdf");
        Files.writeString(file, "data");

        List<ResolvedInput> work =
                source.resolve(
                        persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice");
        // The user saves a new version while the run is executing.
        Files.writeString(file, "new data, different size");
        work.get(0).onComplete().accept(true);

        // The delete is version-guarded: the replacement is not the file that ran, so it stays
        // and is claimed as fresh work instead of being marked processed.
        assertTrue(Files.exists(file));
        assertEquals(
                1,
                source.resolve(persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice")
                        .size());
    }

    @Test
    void aSharedFileIsRemovedOnlyOnceEveryPolicyHasProcessedIt() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("doc.pdf");
        Files.writeString(file, "data");
        InputSpec spec = InputSpec.folder(inputDir.toString());
        RecordingContext other = new RecordingContext("p2");

        List<ResolvedInput> mine = source.resolve(persistedSource(spec), ctx, "alice");
        List<ResolvedInput> theirs = source.resolve(persistedSource(spec), other, "alice");
        assertEquals(1, mine.size());
        assertEquals(1, theirs.size());

        mine.get(0).onComplete().accept(true);
        // The other policy's claim is still in flight, so the first finisher must not delete.
        assertTrue(Files.exists(file));

        theirs.get(0).onComplete().accept(true);
        assertTrue(Files.notExists(file));
    }

    @Test
    void aSharedFileStaysParkedWhenAnyPolicyFailsOnIt() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("doc.pdf");
        Files.writeString(file, "data");
        InputSpec spec = InputSpec.folder(inputDir.toString());
        RecordingContext other = new RecordingContext("p2");

        List<ResolvedInput> mine = source.resolve(persistedSource(spec), ctx, "alice");
        List<ResolvedInput> theirs = source.resolve(persistedSource(spec), other, "alice");

        theirs.get(0).onComplete().accept(false);
        mine.get(0).onComplete().accept(true);

        // The failure parks the file for everyone (retried when it changes), regardless of
        // which policy settled last.
        assertTrue(Files.exists(file));
        assertTrue(source.resolve(persistedSource(spec), ctx, "alice").isEmpty());
        assertTrue(source.resolve(persistedSource(spec), other, "alice").isEmpty());
    }

    @Test
    void aReDroppedFileIsProcessedAgain() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("doc.pdf");
        Files.writeString(file, "data");

        source.resolve(persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice")
                .get(0)
                .onComplete()
                .accept(true);
        Files.writeString(file, "data again");

        assertEquals(
                1,
                source.resolve(persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice")
                        .size());
    }

    @Test
    void aFailedFileStaysInPlaceAndIsNotRetriedUntilItChanges() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("doc.pdf");
        Files.writeString(file, "data");

        source.resolve(persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice")
                .get(0)
                .onComplete()
                .accept(false);

        assertTrue(Files.exists(file));
        assertTrue(
                source.resolve(persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice")
                        .isEmpty());

        Files.setLastModifiedTime(file, FileTime.from(Instant.now().plusSeconds(60)));
        assertEquals(
                1,
                source.resolve(persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice")
                        .size());
    }

    @Test
    void statModeRetriesAFailureOnATouchButHashModeDoesNot() throws IOException {
        Path statDir = Files.createDirectories(tempDir.resolve("stat"));
        Path hashDir = Files.createDirectories(tempDir.resolve("hash"));
        Path statFile = statDir.resolve("doc.pdf");
        Path hashFile = hashDir.resolve("doc.pdf");
        Files.writeString(statFile, "data");
        Files.writeString(hashFile, "data");
        InputSpec statSpec = InputSpec.folder(statDir.toString());
        InputSpec hashSpec =
                new InputSpec(
                        "folder", Map.of("directory", hashDir.toString(), "identity", "hash"));

        source.resolve(persistedSource(statSpec), ctx, "alice").get(0).onComplete().accept(false);
        source.resolve(persistedSource(hashSpec), ctx, "alice").get(0).onComplete().accept(false);

        FileTime touched = FileTime.from(Instant.now().plusSeconds(60));
        Files.setLastModifiedTime(statFile, touched);
        Files.setLastModifiedTime(hashFile, touched);

        // Same content, new mtime: stat mode calls that a new version and retries; hash mode
        // verifies the content is unchanged and keeps the failure parked.
        assertEquals(1, source.resolve(persistedSource(statSpec), ctx, "alice").size());
        assertTrue(source.resolve(persistedSource(hashSpec), ctx, "alice").isEmpty());
    }

    @Test
    void trackModeInHashIdentityDoesNotReprocessAnInPlaceOutputOnALaterTouch() throws IOException {
        Path dir = Files.createDirectories(tempDir.resolve("track-hash"));
        Path file = dir.resolve("doc.pdf");
        Files.writeString(file, "original");
        InputSpec spec =
                new InputSpec(
                        "folder",
                        Map.of(
                                "directory", dir.toString(),
                                "mode", "track",
                                "identity", "hash"));

        // A run that rewrites the file in place, as an OCR-and-replace pipeline does.
        ResolvedInput first = source.resolve(persistedSource(spec), ctx, "alice").get(0);
        Files.writeString(file, "processed");
        first.onComplete().accept(true);

        assertTrue(
                source.resolve(persistedSource(spec), ctx, "alice").isEmpty(),
                "the in-place output must not re-claim");

        // A metadata-only bump a month later: a backup restore, an rsync, an antivirus rewrite.
        Files.setLastModifiedTime(file, FileTime.from(Instant.now().plusSeconds(60)));

        // Settling a null hash here would leave nothing to compare against, so the content
        // check would fail against null and reprocess an unchanged document.
        assertTrue(
                source.resolve(persistedSource(spec), ctx, "alice").isEmpty(),
                "an unchanged tracked file must not reprocess on a touch under identity: hash");

        Files.writeString(file, "edited by a person");
        assertEquals(
                1,
                source.resolve(persistedSource(spec), ctx, "alice").size(),
                "a real edit must still be picked up");
    }

    @Test
    void hashModeRetriesAFailureOnARealContentChange() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("doc.pdf");
        Files.writeString(file, "data");
        InputSpec spec =
                new InputSpec(
                        "folder", Map.of("directory", inputDir.toString(), "identity", "hash"));

        source.resolve(persistedSource(spec), ctx, "alice").get(0).onComplete().accept(false);
        Files.writeString(file, "data v2 - longer");

        assertEquals(1, source.resolve(persistedSource(spec), ctx, "alice").size());
    }

    @Test
    void snapshotReadsStatelesslyEverySweep() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Files.writeString(inputDir.resolve("doc.pdf"), "data");
        InputSpec spec =
                new InputSpec(
                        "folder", Map.of("directory", inputDir.toString(), "mode", "snapshot"));

        List<ResolvedInput> first = source.resolve(persistedSource(spec), ctx, "alice");
        first.get(0).onComplete().accept(true);
        List<ResolvedInput> second = source.resolve(persistedSource(spec), ctx, "alice");

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

        List<ResolvedInput> work =
                source.resolve(
                        persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice");

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
        // Sink staging inside a watched subdirectory is pruned at any depth.
        Path nestedStaging = Files.createDirectories(sub.resolve(".stirling").resolve("tmp"));
        Files.writeString(nestedStaging.resolve("half-delivered"), "d");

        InputSpec flat = InputSpec.folder(inputDir.toString());
        InputSpec recursive =
                new InputSpec(
                        "folder", Map.of("directory", inputDir.toString(), "recursive", "true"));

        assertEquals(1, source.resolve(persistedSource(flat), ctx, "alice").size());
        assertEquals(
                1,
                source.resolve(persistedSource(recursive), ctx, "alice")
                        .size()); // top.pdf already claimed above
        assertTrue(ctx.present.stream().anyMatch(identity -> identity.endsWith("nested.pdf")));
        assertTrue(ctx.present.stream().noneMatch(identity -> identity.endsWith("skipped.pdf")));
        assertTrue(ctx.present.stream().noneMatch(identity -> identity.endsWith("half-delivered")));
    }

    @Test
    void unreadyFilesAreReportedPresentButNotClaimed() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Path file = inputDir.resolve("mid-write.pdf");
        Files.writeString(file, "partial");
        when(readinessChecker.isReady(file)).thenReturn(false);

        List<ResolvedInput> work =
                source.resolve(
                        persistedSource(InputSpec.folder(inputDir.toString())), ctx, "alice");

        assertTrue(work.isEmpty());
        // Reported present so a full sweep does not prune its row while it settles on disk.
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
        assertEquals(1, source.resolve(persistedSource(parentRecursive), ctx, "alice").size());
        assertTrue(source.resolve(persistedSource(childFlat), ctx, "alice").isEmpty());
    }

    @Test
    void missingDirectoryOptionFails() {
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        source.resolve(
                                persistedSource(new InputSpec("folder", Map.of())), ctx, "alice"));
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
    void nonexistentDirectoryFailsResolveSoTheSweepVetoesCleanup() {
        // An unreachable directory (e.g. unmounted drive) must surface as a failed listing, not
        // an empty one: the runner vetoes presence cleanup on failure, keeping the history that
        // an empty listing would wipe.
        assertThrows(
                NoSuchFileException.class,
                () ->
                        source.resolve(
                                persistedSource(
                                        InputSpec.folder(tempDir.resolve("nope").toString())),
                                ctx,
                                "alice"));
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
                () ->
                        source.resolve(
                                persistedSource(InputSpec.folder(outside.toString())),
                                ctx,
                                "alice"));
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

        private final String policyId;
        private final List<String> present = new ArrayList<>();

        private RecordingContext() {
            this(POLICY);
        }

        private RecordingContext(String policyId) {
            this.policyId = policyId;
        }

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(policyId, identity, gate, contentHash);
        }

        @Override
        public void settle(
                String identity, String finalGate, String finalContentHash, boolean success) {
            ledger.settle(policyId, identity, finalGate, finalContentHash, success);
        }

        @Override
        public boolean allSettledDone(String identity) {
            return ledger.allSettledDone(identity);
        }

        @Override
        public void reportPresent(Collection<String> identities) {
            present.addAll(identities);
        }
    }

    @Test
    void aCappedSweepTakesTheNewestFiles() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Instant base = Instant.now().minusSeconds(600);
        for (int i = 0; i < 4; i++) {
            Path file = inputDir.resolve("doc" + i + ".pdf");
            Files.writeString(file, "data-" + i);
            Files.setLastModifiedTime(file, FileTime.from(base.plusSeconds(i * 60L)));
        }
        InputSpec spec =
                new InputSpec(
                        "folder",
                        Map.of("directory", inputDir.toString(), "mode", "track", "limit", 2));

        List<ResolvedInput> work = source.resolve(persistedSource(spec), ctx, "alice");

        // The cap goes to the most recently added files, not whichever listed first.
        assertEquals(2, work.size());
        assertEquals(
                List.of("doc3.pdf", "doc2.pdf"),
                work.stream().map(unit -> unit.inputs().primary().get(0).getFilename()).toList());
    }

    @Test
    void aUnitsIdentityIsTheDocumentsPathSoRunsCanNameIt() throws IOException {
        Path inputDir = Files.createDirectories(tempDir.resolve("in"));
        Files.writeString(inputDir.resolve("doc.pdf"), "data");
        InputSpec spec =
                new InputSpec("folder", Map.of("directory", inputDir.toString(), "mode", "track"));

        List<ResolvedInput> work = source.resolve(persistedSource(spec), ctx, "alice");

        // Name-shaped end to end: the run's display name and the ledger's claim release
        // both resolve this identity as the source produced it.
        assertTrue(work.get(0).fileIdentity().endsWith("doc.pdf"));
    }
}
