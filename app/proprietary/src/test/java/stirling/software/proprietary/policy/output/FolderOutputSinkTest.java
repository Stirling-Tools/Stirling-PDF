package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.ledger.FolderIdentities;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.source.InProcessSourceStore;

/**
 * Tests for {@link FolderOutputSink}: outputs are staged hidden, recorded in the ledger, then
 * atomically renamed into the configured directory.
 */
class FolderOutputSinkTest {

    private static final OutputDelivery AD_HOC = new OutputDelivery("run-1", null);
    private static final OutputDelivery POLICY_RUN = new OutputDelivery("run-1", "p1");

    @TempDir Path tempDir;

    private FolderOutputSink sink;
    private InProcessProcessedLedger ledger;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        // With login off the guard permits the local operator everywhere; these tests
        // exercise the allowlist, so they opt into login like a hosted install.
        properties.getSecurity().setEnableLogin(true);
        properties.getPolicies().setAllowedFolderRoots(List.of(tempDir.toString()));
        ledger = new InProcessProcessedLedger();
        sink =
                new FolderOutputSink(
                        new FolderAccessGuard(
                                properties,
                                new RuntimePathConfig(properties),
                                new StandardEnvironment(),
                                new InProcessSourceStore()),
                        ledger);
    }

    @Test
    void writesEachOutputToTheDirectory() throws IOException {
        Path out = tempDir.resolve("out");
        List<Resource> outputs = List.of(named("a.pdf", "aaa"), named("b.pdf", "bb"));

        List<ResultFile> results = sink.deliver(AD_HOC, outputs, OutputSpec.folder(out.toString()));

        assertEquals(2, results.size());
        assertTrue(Files.exists(out.resolve("a.pdf")));
        assertEquals("aaa", Files.readString(out.resolve("a.pdf")));
        assertEquals("bb", Files.readString(out.resolve("b.pdf")));
        // Nothing left behind in the staging dir.
        try (Stream<Path> staged = Files.list(out.resolve(".stirling").resolve("tmp"))) {
            assertEquals(0, staged.count());
        }
    }

    @Test
    void recordsThePolicysOutputsSoOnlyOtherPoliciesReprocessThem() throws IOException {
        Path out = tempDir.resolve("out");

        sink.deliver(POLICY_RUN, List.of(named("a.pdf", "aaa")), OutputSpec.folder(out.toString()));

        Path delivered = FolderIdentities.canonicalDir(out).resolve("a.pdf");
        String gate = FolderIdentities.statGate(delivered);
        assertFalse(ledger.claim("p1", delivered.toString(), gate, null)); // producer skips it
        assertTrue(ledger.claim("p2", delivered.toString(), gate, null)); // chaining still works
    }

    @Test
    void aHashVerifyingProducerSkipsItsOwnOutputEvenIfTheGateMoved() throws IOException {
        Path out = tempDir.resolve("out");

        sink.deliver(POLICY_RUN, List.of(named("a.pdf", "aaa")), OutputSpec.folder(out.toString()));

        // A hash-verifying reader matches on content even when the stat moved.
        Path delivered = FolderIdentities.canonicalDir(out).resolve("a.pdf");
        assertFalse(
                ledger.claim(
                        "p1",
                        delivered.toString(),
                        "999:12345",
                        () -> {
                            try {
                                return FolderIdentities.contentHash(delivered);
                            } catch (IOException e) {
                                throw new java.io.UncheckedIOException(e);
                            }
                        }));
    }

    @Test
    void recordsAnOutputBeforeItBecomesVisible() throws IOException {
        Path out = tempDir.resolve("out");
        VisibilityAssertingLedger orderedLedger = new VisibilityAssertingLedger();
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(true);
        properties.getPolicies().setAllowedFolderRoots(List.of(tempDir.toString()));
        FolderOutputSink orderedSink =
                new FolderOutputSink(
                        new FolderAccessGuard(
                                properties,
                                new RuntimePathConfig(properties),
                                new StandardEnvironment(),
                                new InProcessSourceStore()),
                        orderedLedger);

        orderedSink.deliver(
                POLICY_RUN, List.of(named("a.pdf", "aaa")), OutputSpec.folder(out.toString()));

        assertTrue(orderedLedger.recorded);
        assertTrue(Files.exists(out.resolve("a.pdf")));
    }

    @Test
    void adHocDeliveriesRecordNothing() throws IOException {
        Path out = tempDir.resolve("out");

        sink.deliver(AD_HOC, List.of(named("a.pdf", "aaa")), OutputSpec.folder(out.toString()));

        Path delivered = FolderIdentities.canonicalDir(out).resolve("a.pdf");
        // No row was recorded, so any policy (including a hypothetical producer) may claim it.
        assertTrue(ledger.claim("p1", delivered.toString(), "any-gate", null));
    }

    @Test
    void collidingNamesGetAUniqueSuffix() throws IOException {
        Path out = tempDir.resolve("out");
        List<Resource> outputs = List.of(named("a.pdf", "first"), named("a.pdf", "second"));

        sink.deliver(AD_HOC, outputs, OutputSpec.folder(out.toString()));

        assertTrue(Files.exists(out.resolve("a.pdf")));
        assertTrue(Files.exists(out.resolve("a (1).pdf")));
    }

    @Test
    void missingDirectoryOptionIsRejected() {
        OutputSpec noDir = new OutputSpec("folder", Map.of());
        assertThrows(IllegalArgumentException.class, () -> sink.validate(noDir));
        assertThrows(
                IllegalArgumentException.class,
                () -> sink.deliver(AD_HOC, List.of(named("a.pdf", "x")), noDir));
    }

    @Test
    void aDirectoryOutsideTheAllowedRootsIsRejected() {
        OutputSpec outside = OutputSpec.folder(tempDir.resolveSibling("not-allowed").toString());
        assertThrows(IllegalArgumentException.class, () -> sink.validate(outside));
        assertThrows(
                IllegalArgumentException.class,
                () -> sink.deliver(AD_HOC, List.of(named("a.pdf", "x")), outside));
    }

    @Test
    void filenamesWithPathTraversalAreConfinedToTheDirectory() throws IOException {
        Path out = tempDir.resolve("out");
        List<Resource> outputs =
                List.of(named("../escape.pdf", "x"), named("nested/deep.pdf", "y"));

        sink.deliver(AD_HOC, outputs, OutputSpec.folder(out.toString()));

        // Each name is reduced to its bare form inside the target dir; nothing escapes.
        assertTrue(Files.exists(out.resolve("escape.pdf")));
        assertTrue(Files.exists(out.resolve("deep.pdf")));
        assertFalse(Files.exists(tempDir.resolve("escape.pdf")));
    }

    @Test
    void replaceKeepsTheFirstOriginalForRevert() throws IOException {
        Path out = tempDir.resolve("out");
        Files.createDirectories(out);
        Files.writeString(out.resolve("a.pdf"), "original");
        OutputSpec replace =
                new OutputSpec("folder", Map.of("directory", out.toString(), "replace", true));

        sink.deliver(inPlaceRun("a.pdf"), List.of(named("a.pdf", "v1")), replace);
        sink.deliver(inPlaceRun("a.pdf"), List.of(named("a.pdf", "v2")), replace);

        assertEquals("v2", Files.readString(out.resolve("a.pdf")));
        // The archive holds what the user put in, not any intermediate result.
        Path archived = out.resolve(".stirling").resolve("originals").resolve("a.pdf");
        assertEquals("original", Files.readString(archived));
    }

    @Test
    void archiveFailureAbortsTheReplaceInsteadOfDestroyingTheOriginal() throws IOException {
        Path out = tempDir.resolve("out");
        Files.createDirectories(out.resolve(".stirling"));
        Files.writeString(out.resolve("a.pdf"), "original");
        // Block the originals dir by occupying its path with a regular file, so archiving throws
        // exactly as an unwritable/locked/full originals dir would in the field.
        Files.writeString(out.resolve(".stirling").resolve("originals"), "blocker");
        OutputSpec replace =
                new OutputSpec("folder", Map.of("directory", out.toString(), "replace", true));

        assertThrows(
                IOException.class,
                () -> sink.deliver(inPlaceRun("a.pdf"), List.of(named("a.pdf", "v1")), replace));

        assertEquals("original", Files.readString(out.resolve("a.pdf")));
    }

    @Test
    void aReDroppedSameNameFileKeepsItsOwnOriginalRatherThanLosingIt() throws IOException {
        Path out = tempDir.resolve("out");
        Files.createDirectories(out);
        Files.writeString(out.resolve("a.pdf"), "first-original");
        OutputSpec replace =
                new OutputSpec("folder", Map.of("directory", out.toString(), "replace", true));

        sink.deliver(inPlaceRun("a.pdf"), List.of(named("a.pdf", "processed1")), replace);
        // The user drops a genuinely different document under the same name; it is reprocessed.
        Files.writeString(out.resolve("a.pdf"), "second-original");
        sink.deliver(inPlaceRun("a.pdf"), List.of(named("a.pdf", "processed2")), replace);

        assertEquals("processed2", Files.readString(out.resolve("a.pdf")));
        Path originals = out.resolve(".stirling").resolve("originals");
        assertEquals("first-original", Files.readString(originals.resolve("a.pdf")));
        // The second original was preserved, not overwritten away.
        boolean kept;
        try (Stream<Path> archived = Files.walk(originals)) {
            kept =
                    archived.filter(Files::isRegularFile)
                            .anyMatch(
                                    p -> {
                                        try {
                                            return "second-original".equals(Files.readString(p));
                                        } catch (IOException e) {
                                            return false;
                                        }
                                    });
        }
        assertTrue(kept, "the re-dropped original must be preserved, never silently lost");
    }

    @Test
    void aSupersededOriginalIsKeptOutOfTheRestoreNamespace() throws IOException {
        Path out = tempDir.resolve("out");
        Files.createDirectories(out);
        Files.writeString(out.resolve("a.pdf"), "first-original");
        OutputSpec replace =
                new OutputSpec("folder", Map.of("directory", out.toString(), "replace", true));

        sink.deliver(inPlaceRun("a.pdf"), List.of(named("a.pdf", "processed1")), replace);
        Files.writeString(out.resolve("a.pdf"), "second-original");
        sink.deliver(inPlaceRun("a.pdf"), List.of(named("a.pdf", "processed2")), replace);

        // A restore brings back every regular file directly under originals/, so only the
        // canonical original may sit there; a sibling would be restored as a file the folder
        // never held. The superseded one is kept, one level down.
        Path originals = out.resolve(".stirling").resolve("originals");
        List<String> restorable;
        try (Stream<Path> entries = Files.list(originals)) {
            restorable =
                    entries.filter(Files::isRegularFile)
                            .map(entry -> entry.getFileName().toString())
                            .toList();
        }
        assertEquals(List.of("a.pdf"), restorable);
        assertEquals(
                "second-original",
                Files.readString(originals.resolve("superseded").resolve("a.pdf")));
    }

    @Test
    void aBrandNewNameArchivesNothing() throws IOException {
        Path out = tempDir.resolve("out");
        OutputSpec replace =
                new OutputSpec("folder", Map.of("directory", out.toString(), "replace", true));

        sink.deliver(inPlaceRun("a.pdf"), List.of(named("a.pdf", "v1")), replace);

        assertFalse(Files.exists(out.resolve(".stirling").resolve("originals").resolve("a.pdf")));
    }

    @Test
    void replaceDeliversUnderTheInputsNameWhenAStepRenames() throws IOException {
        Path out = tempDir.resolve("out");
        Files.createDirectories(out);
        Files.writeString(out.resolve("doc.pdf"), "original");
        OutputSpec replace =
                new OutputSpec("folder", Map.of("directory", out.toString(), "replace", true));

        sink.deliver(
                inPlaceRun("doc.pdf"),
                List.of(named("doc_redacted_watermarked.pdf", "v1")),
                replace);

        // The watched file became its processed self; nothing landed beside it.
        assertEquals("v1", Files.readString(out.resolve("doc.pdf")));
        assertFalse(Files.exists(out.resolve("doc_redacted_watermarked.pdf")));
        assertEquals(
                "original",
                Files.readString(out.resolve(".stirling").resolve("originals").resolve("doc.pdf")));
    }

    @Test
    void aSplittingRunDoesNotReplaceItsInput() throws IOException {
        Path out = tempDir.resolve("out");
        Files.createDirectories(out);
        Files.writeString(out.resolve("doc.pdf"), "original");
        OutputSpec replace =
                new OutputSpec("folder", Map.of("directory", out.toString(), "replace", true));

        sink.deliver(
                inPlaceRun("doc.pdf"),
                List.of(named("part1.pdf", "a"), named("part2.pdf", "b")),
                replace);

        assertEquals("original", Files.readString(out.resolve("doc.pdf")));
        assertTrue(Files.exists(out.resolve("part1.pdf")));
        assertTrue(Files.exists(out.resolve("part2.pdf")));
    }

    /** A recorded run carrying its input, the shape the engine always delivers with. */
    private static OutputDelivery inPlaceRun(String inputName) {
        return new OutputDelivery(
                "run-1", "p1", PolicyInputs.of(List.of(named(inputName, "input"))));
    }

    private static ByteArrayResource named(String filename, String content) {
        return new ByteArrayResource(content.getBytes()) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    /** Fails the delivery if an output is visible at its final path before being recorded. */
    private static class VisibilityAssertingLedger extends InProcessProcessedLedger {

        private boolean recorded;

        @Override
        public synchronized void recordOutput(
                String policyId, String identity, String gate, String contentHash) {
            assertFalse(
                    Files.exists(Path.of(identity)),
                    "output must be recorded before it is visible at its final path");
            recorded = true;
            super.recordOutput(policyId, identity, gate, contentHash);
        }
    }
}
