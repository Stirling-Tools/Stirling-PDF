package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.model.OutputSpec;

/** Tests for {@link FolderOutputSink}: outputs are written to the configured directory on disk. */
class FolderOutputSinkTest {

    private final FolderOutputSink sink = new FolderOutputSink();

    @TempDir Path tempDir;

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

    private static ByteArrayResource named(String filename, String content) {
        return new ByteArrayResource(content.getBytes()) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }
}
