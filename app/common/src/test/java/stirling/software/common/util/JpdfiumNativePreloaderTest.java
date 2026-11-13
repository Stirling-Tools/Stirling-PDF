package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class JpdfiumNativePreloaderTest {

    @TempDir Path javaHome;

    @Test
    void returnsNothingWithoutAManifest() throws Exception {
        Files.createDirectories(javaHome.resolve("bin"));
        Files.writeString(javaHome.resolve("bin").resolve("pdfium.dll"), "");

        assertThat(JpdfiumNativePreloader.bundledLibraries(javaHome)).isEmpty();
    }

    @Test
    void returnsNothingWithoutABinDirectory() {
        assertThat(JpdfiumNativePreloader.bundledLibraries(javaHome)).isEmpty();
    }

    @Test
    void listsManifestEntriesInOrderAndSkipsMissingFilesAndComments() throws Exception {
        Path bin = Files.createDirectories(javaHome.resolve("bin"));
        for (String name : new String[] {"z.dll", "pdfium.dll", "jpdfium.dll"}) {
            Files.writeString(bin.resolve(name), "");
        }
        Files.writeString(
                bin.resolve(JpdfiumNativePreloader.MANIFEST),
                "# staged\nz.dll\n\n  pdfium.dll  \nmissing.dll\njpdfium.dll\n");

        assertThat(JpdfiumNativePreloader.bundledLibraries(javaHome))
                .containsExactly(
                        bin.resolve("z.dll"),
                        bin.resolve("pdfium.dll"),
                        bin.resolve("jpdfium.dll"));
    }
}
