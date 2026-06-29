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

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.source.InProcessSourceStore;

/** Tests for {@link FolderOutputSink}: outputs are written to the configured directory on disk. */
class FolderOutputSinkTest {

    @TempDir Path tempDir;

    private FolderOutputSink sink;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowedFolderRoots(List.of(tempDir.toString()));
        sink =
                new FolderOutputSink(
                        new FolderAccessGuard(
                                properties, new StandardEnvironment(), new InProcessSourceStore()));
    }

    @Test
    void writesEachOutputToTheDirectory() throws IOException {
        Path out = tempDir.resolve("out");
        List<Resource> outputs = List.of(named("a.pdf", "aaa"), named("b.pdf", "bb"));

        List<ResultFile> results =
                sink.deliver("run-1", outputs, OutputSpec.folder(out.toString()));

        assertEquals(2, results.size());
        assertTrue(Files.exists(out.resolve("a.pdf")));
        assertEquals("aaa", Files.readString(out.resolve("a.pdf")));
        assertEquals("bb", Files.readString(out.resolve("b.pdf")));
    }

    @Test
    void collidingNamesGetAUniqueSuffix() throws IOException {
        Path out = tempDir.resolve("out");
        List<Resource> outputs = List.of(named("a.pdf", "first"), named("a.pdf", "second"));

        sink.deliver("run-1", outputs, OutputSpec.folder(out.toString()));

        assertTrue(Files.exists(out.resolve("a.pdf")));
        assertTrue(Files.exists(out.resolve("a (1).pdf")));
    }

    @Test
    void missingDirectoryOptionIsRejected() {
        OutputSpec noDir = new OutputSpec("folder", Map.of());
        assertThrows(IllegalArgumentException.class, () -> sink.validate(noDir));
        assertThrows(
                IllegalArgumentException.class,
                () -> sink.deliver("run-1", List.of(named("a.pdf", "x")), noDir));
    }

    @Test
    void aDirectoryOutsideTheAllowedRootsIsRejected() {
        OutputSpec outside = OutputSpec.folder(tempDir.resolveSibling("not-allowed").toString());
        assertThrows(IllegalArgumentException.class, () -> sink.validate(outside));
        assertThrows(
                IllegalArgumentException.class,
                () -> sink.deliver("run-1", List.of(named("a.pdf", "x")), outside));
    }

    @Test
    void filenamesWithPathTraversalAreConfinedToTheDirectory() throws IOException {
        Path out = tempDir.resolve("out");
        List<Resource> outputs =
                List.of(named("../escape.pdf", "x"), named("nested/deep.pdf", "y"));

        sink.deliver("run-1", outputs, OutputSpec.folder(out.toString()));

        // Each name is reduced to its bare form inside the target dir; nothing escapes.
        assertTrue(Files.exists(out.resolve("escape.pdf")));
        assertTrue(Files.exists(out.resolve("deep.pdf")));
        assertFalse(Files.exists(tempDir.resolve("escape.pdf")));
    }

    private static ByteArrayResource named(String filename, String content) {
        return new ByteArrayResource(content.getBytes()) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }
}
