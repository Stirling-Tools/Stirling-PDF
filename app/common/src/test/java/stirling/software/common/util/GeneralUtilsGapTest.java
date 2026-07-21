package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

/**
 * Gap-coverage tests for {@link GeneralUtils}. Targets the public methods NOT already exercised by
 * {@code GeneralUtilsAdditionalTest} (size/url/version/uuid) or {@code GeneralUtilsTest} (filename
 * helpers, parsePageList basics, saveKeyToSettings): namely {@code generateFilename}, {@code
 * convertToFileName}, {@code evaluateNFunc}, the n-function {@code parsePageList} path, {@code
 * createDir}/{@code deleteDirectory}, multipart conversion, the {@code updateSettingsTransactional}
 * early-return guards, {@code getResourcesFromLocationPattern}, and the environment helpers {@code
 * generateMachineFingerprint}/{@code getLocalNetworkIp}.
 */
class GeneralUtilsGapTest {

    @Nested
    @DisplayName("generateFilename")
    class GenerateFilenameTests {

        @Test
        @DisplayName("removes extension then appends suffix")
        void removesAndAppends() {
            assertEquals(
                    "report_out.pdf", GeneralUtils.generateFilename("report.docx", "_out.pdf"));
        }

        @Test
        @DisplayName("null filename uses default base")
        void nullFilename() {
            assertEquals("default_out.pdf", GeneralUtils.generateFilename(null, "_out.pdf"));
        }

        @Test
        @DisplayName("filename without extension is preserved")
        void noExtension() {
            assertEquals("README_x", GeneralUtils.generateFilename("README", "_x"));
        }
    }

    @Nested
    @DisplayName("convertToFileName")
    class ConvertToFileNameTests {

        @Test
        @DisplayName("null returns underscore")
        void nullReturnsUnderscore() {
            assertEquals("_", GeneralUtils.convertToFileName(null));
        }

        @Test
        @DisplayName("keeps letters and digits, replaces others with underscore")
        void replacesUnsafeChars() {
            assertEquals("my_file_2024_", GeneralUtils.convertToFileName("my file/2024!"));
        }

        @Test
        @DisplayName("alphanumeric input is unchanged")
        void alphanumericUnchanged() {
            assertEquals("File123", GeneralUtils.convertToFileName("File123"));
        }

        @Test
        @DisplayName("truncates to 50 characters")
        void truncatesToFifty() {
            String input = "a".repeat(100);
            assertEquals(50, GeneralUtils.convertToFileName(input).length());
        }
    }

    @Nested
    @DisplayName("evaluateNFunc")
    class EvaluateNFuncTests {

        @Test
        @DisplayName("null expression throws")
        void nullThrows() {
            assertThrows(
                    IllegalArgumentException.class, () -> GeneralUtils.evaluateNFunc(null, 10));
        }

        @Test
        @DisplayName("blank expression throws")
        void blankThrows() {
            assertThrows(
                    IllegalArgumentException.class, () -> GeneralUtils.evaluateNFunc("   ", 10));
        }

        @Test
        @DisplayName("maxValue below 1 throws")
        void maxValueTooLow() {
            assertThrows(IllegalArgumentException.class, () -> GeneralUtils.evaluateNFunc("n", 0));
        }

        @Test
        @DisplayName("maxValue above 10000 throws")
        void maxValueTooHigh() {
            assertThrows(
                    IllegalArgumentException.class, () -> GeneralUtils.evaluateNFunc("n", 10001));
        }

        @Test
        @DisplayName("invalid characters throw")
        void invalidCharsThrow() {
            assertThrows(
                    IllegalArgumentException.class, () -> GeneralUtils.evaluateNFunc("n$", 10));
        }

        @Test
        @DisplayName("identity 'n' yields all pages up to maxValue")
        void identity() {
            assertEquals(List.of(1, 2, 3, 4, 5), GeneralUtils.evaluateNFunc("n", 5));
        }

        @Test
        @DisplayName("2n yields even values within bounds")
        void doubling() {
            assertEquals(List.of(2, 4, 6), GeneralUtils.evaluateNFunc("2n", 6));
        }

        @Test
        @DisplayName("implicit multiplication 'n(n-1)' is handled")
        void implicitMultiplication() {
            // n*(n-1): n=1->0(excluded), n=2->2, n=3->6 ; capped at maxValue 6
            assertEquals(List.of(2, 6), GeneralUtils.evaluateNFunc("n(n-1)", 6));
        }

        @Test
        @DisplayName("results outside (0, maxValue] are excluded")
        void boundsExcluded() {
            // n+10 always exceeds maxValue 5 -> empty
            assertTrue(GeneralUtils.evaluateNFunc("n+10", 5).isEmpty());
        }
    }

    @Nested
    @DisplayName("parsePageList n-function path")
    class ParsePageListNFuncTests {

        @Test
        @DisplayName("n-function token expands to matching one-based pages")
        void nFunctionOneBased() {
            // 2n for total 6 (one-based) -> values 2,4,6 mapped to (v-1+1)=v
            assertEquals(List.of(2, 4, 6), GeneralUtils.parsePageList("2n", 6, true));
        }

        @Test
        @DisplayName("n-function token zero-based subtracts one")
        void nFunctionZeroBased() {
            // 2n for total 6 zero-based -> values 2,4,6 mapped to (v-1+0)=v-1
            assertEquals(List.of(1, 3, 5), GeneralUtils.parsePageList("2n", 6, false));
        }
    }

    @Nested
    @DisplayName("createDir and deleteDirectory")
    class DirectoryTests {

        @Test
        @DisplayName("createDir makes a nested directory and returns true")
        void createNested(@TempDir Path tempDir) {
            Path nested = tempDir.resolve("a").resolve("b").resolve("c");
            assertTrue(GeneralUtils.createDir(nested.toString()));
            assertTrue(Files.isDirectory(nested));
        }

        @Test
        @DisplayName("createDir returns true when directory already exists")
        void createExisting(@TempDir Path tempDir) {
            assertTrue(GeneralUtils.createDir(tempDir.toString()));
        }

        @Test
        @DisplayName("deleteDirectory removes a populated tree without touching siblings")
        void deletePopulatedTree(@TempDir Path tempDir) throws IOException {
            Path sibling = tempDir.resolve("sibling");
            Files.createDirectories(sibling);
            Files.writeString(sibling.resolve("keep.txt"), "data");

            Path root = tempDir.resolve("root");
            Files.createDirectories(root.resolve("nested"));
            Files.writeString(root.resolve("a.txt"), "x");
            Files.writeString(root.resolve("nested").resolve("b.txt"), "y");

            GeneralUtils.deleteDirectory(root);

            assertFalse(Files.exists(root));
            assertTrue(Files.exists(sibling.resolve("keep.txt")));
        }
    }

    @Nested
    @DisplayName("multipart conversion")
    class MultipartTests {

        @Test
        @DisplayName("convertMultipartFileToFile writes content to a temp file")
        void convertWritesContent() throws IOException {
            byte[] content = "hello world".getBytes(StandardCharsets.UTF_8);
            MultipartFile mf =
                    new MockMultipartFile("file", "input.bin", "application/octet-stream", content);

            File out = GeneralUtils.convertMultipartFileToFile(mf);
            try {
                assertTrue(out.exists());
                assertArrayEquals(content, Files.readAllBytes(out.toPath()));
            } finally {
                Files.deleteIfExists(out.toPath());
            }
        }

        @Test
        @DisplayName("convertMultipartFileToFile handles empty input")
        void convertEmpty() throws IOException {
            MultipartFile mf =
                    new MockMultipartFile(
                            "file", "empty.bin", "application/octet-stream", new byte[0]);

            File out = GeneralUtils.convertMultipartFileToFile(mf);
            try {
                assertTrue(out.exists());
                assertEquals(0, out.length());
            } finally {
                Files.deleteIfExists(out.toPath());
            }
        }

        @Test
        @DisplayName("multipartToFile writes content to a .pdf temp file")
        void multipartToFileWritesContent() throws IOException {
            byte[] content = "%PDF-1.7 minimal".getBytes(StandardCharsets.UTF_8);
            MultipartFile mf = new MockMultipartFile("file", "doc.pdf", "application/pdf", content);

            File out = GeneralUtils.multipartToFile(mf);
            try {
                assertTrue(out.exists());
                assertTrue(out.getName().endsWith(".pdf"));
                assertArrayEquals(content, Files.readAllBytes(out.toPath()));
            } finally {
                Files.deleteIfExists(out.toPath());
            }
        }
    }

    @Nested
    @DisplayName("getResourcesFromLocationPattern")
    class ResourcePatternTests {

        @Test
        @DisplayName("file: pattern resolves matching files in a directory")
        void filePatternResolves(@TempDir Path tempDir) throws Exception {
            Files.writeString(tempDir.resolve("one.txt"), "1");
            Files.writeString(tempDir.resolve("two.txt"), "2");

            String pattern = "file:" + tempDir.toString().replace("\\", "/") + "/*";
            Resource[] resources =
                    GeneralUtils.getResourcesFromLocationPattern(
                            pattern, new DefaultResourceLoader());

            assertNotNull(resources);
            assertEquals(2, resources.length);
        }

        @Test
        @DisplayName("classpath pattern with no matches returns an empty array")
        void classpathNoMatches() throws Exception {
            Resource[] resources =
                    GeneralUtils.getResourcesFromLocationPattern(
                            "classpath*:this/path/does/not/exist/**/*.nope",
                            new DefaultResourceLoader());

            assertNotNull(resources);
            assertEquals(0, resources.length);
        }
    }

    @Nested
    @DisplayName("updateSettingsTransactional early-return guards")
    class SettingsGuardTests {

        @Test
        @DisplayName("null map returns without throwing")
        void nullMapNoOp() {
            assertDoesNotThrow(() -> GeneralUtils.updateSettingsTransactional(null));
        }

        @Test
        @DisplayName("empty map returns without throwing")
        void emptyMapNoOp() {
            assertDoesNotThrow(() -> GeneralUtils.updateSettingsTransactional(Map.of()));
        }
    }

    @Nested
    @DisplayName("environment-dependent helpers")
    class EnvironmentHelperTests {

        @Test
        @DisplayName("generateMachineFingerprint returns a non-blank, deterministic value")
        void fingerprintStable() {
            String first = GeneralUtils.generateMachineFingerprint();
            assertNotNull(first);
            assertFalse(first.isBlank());
            // Deterministic within the same JVM/host
            assertEquals(first, GeneralUtils.generateMachineFingerprint());
        }

        @Test
        @DisplayName("getLocalNetworkIp returns null or a dotted IPv4 string")
        void localIpFormat() {
            String ip = GeneralUtils.getLocalNetworkIp();
            if (ip != null) {
                assertTrue(ip.matches("\\d{1,3}(\\.\\d{1,3}){3}"), "unexpected IP form: " + ip);
            }
        }
    }
}
