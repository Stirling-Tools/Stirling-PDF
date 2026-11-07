package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import stirling.software.common.configuration.InstallationPathConfig;

/**
 * Branch-coverage gap tests for {@link GeneralUtils}. Targets size parsing/formatting, page-list
 * and range handling, version comparison, URL validation, script/pipeline extraction validation,
 * and the ebook optimization success and failure paths not exercised by the existing
 * GeneralUtils*Test files.
 */
class GeneralUtilsMoreTest {

    @Nested
    @DisplayName("convertSizeToBytes with explicit default unit")
    class ConvertSizeWithDefaultUnitTests {

        @Test
        @DisplayName("invalid default unit throws IllegalArgumentException")
        void invalidDefaultUnitThrows() {
            assertThatThrownBy(() -> GeneralUtils.convertSizeToBytes("100", "ZB"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Invalid default unit");
        }

        @ParameterizedTest(name = "value \"5\" with default unit {0} -> {1} bytes")
        @CsvSource({"B, 5", "KB, 5120", "MB, 5242880", "GB, 5368709120", "TB, 5497558138880"})
        @DisplayName("numeric value uses the supplied default unit")
        void numericValueUsesDefaultUnit(String unit, long expected) {
            assertEquals(expected, GeneralUtils.convertSizeToBytes("5", unit));
        }

        @Test
        @DisplayName("lowercase default unit is normalized")
        void lowercaseDefaultUnit() {
            assertEquals(5L * 1024 * 1024, GeneralUtils.convertSizeToBytes("5", "mb"));
        }

        @Test
        @DisplayName("explicit suffix overrides default unit")
        void explicitSuffixOverridesDefault() {
            // "2KB" should parse as KB even though default unit is GB.
            assertEquals(2048L, GeneralUtils.convertSizeToBytes("2KB", "GB"));
        }

        @Test
        @DisplayName("null default unit falls back to MB")
        void nullDefaultUnitFallsBackToMb() {
            assertEquals(3L * 1024 * 1024, GeneralUtils.convertSizeToBytes("3", null));
        }
    }

    @Nested
    @DisplayName("convertSizeToBytes suffix and edge parsing")
    class ConvertSizeSuffixTests {

        @Test
        @DisplayName("comma decimal separator and embedded spaces are handled")
        void commaAndSpaces() {
            // "2,5 GB" -> "2.5GB" after normalization.
            assertEquals(2684354560L, GeneralUtils.convertSizeToBytes("2,5 GB"));
        }

        @Test
        @DisplayName("bare B suffix parses as bytes")
        void bareBytes() {
            assertEquals(42L, GeneralUtils.convertSizeToBytes("42B"));
        }

        @Test
        @DisplayName("non-numeric body returns null")
        void nonNumericReturnsNull() {
            assertNull(GeneralUtils.convertSizeToBytes("abcMB"));
        }

        @Test
        @DisplayName("negative value returns null")
        void negativeReturnsNull() {
            assertNull(GeneralUtils.convertSizeToBytes("-1KB"));
        }

        @Test
        @DisplayName("zero is a valid size")
        void zeroIsValid() {
            assertEquals(0L, GeneralUtils.convertSizeToBytes("0MB"));
        }
    }

    @Nested
    @DisplayName("formatBytes boundaries")
    class FormatBytesTests {

        @Test
        @DisplayName("negative bytes report invalid size")
        void negativeInvalid() {
            assertEquals("Invalid size", GeneralUtils.formatBytes(-1));
        }

        @Test
        @DisplayName("terabyte range uses TB suffix")
        void terabyteRange() {
            long oneTb = 1024L * 1024L * 1024L * 1024L;
            assertEquals("1.00 TB", GeneralUtils.formatBytes(oneTb));
        }

        @Test
        @DisplayName("upper KB boundary just below a megabyte")
        void kbBoundary() {
            assertThat(GeneralUtils.formatBytes(1024L * 1024L - 1)).endsWith("KB");
        }
    }

    @Nested
    @DisplayName("parsePageList String overload")
    class ParsePageListStringTests {

        @Test
        @DisplayName("null pages defaults to first page")
        void nullDefaultsToFirst() {
            // Cast disambiguates the String vs String[] overloads for a null literal.
            assertEquals(List.of(1), GeneralUtils.parsePageList((String) null, 5, true));
        }

        @Test
        @DisplayName("comma-separated list expands across tokens")
        void commaSeparated() {
            assertEquals(List.of(1, 3, 5), GeneralUtils.parsePageList("1,3,5", 5, true));
        }

        @Test
        @DisplayName("'all' keyword via String overload returns every page")
        void allKeyword() {
            assertEquals(List.of(1, 2, 3), GeneralUtils.parsePageList("all", 3, true));
        }

        @Test
        @DisplayName("two-argument overload defaults to zero-based output")
        void twoArgOverloadZeroBased() {
            assertEquals(List.of(0, 1, 2), GeneralUtils.parsePageList(new String[] {"1-3"}, 5));
        }

        @Test
        @DisplayName("large in-range request stays within the max-size guard")
        void largeRequestWithinGuard() {
            // Pages are clamped to [1, total], so a wide range never trips the maxSize guard.
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"1-500"}, 500, true);
            assertEquals(500, result.size());
        }
    }

    @Nested
    @DisplayName("range and single-page handling")
    class RangeHandlingTests {

        @Test
        @DisplayName("open-ended range extends to the last page")
        void openEndedRange() {
            assertEquals(
                    List.of(3, 4, 5), GeneralUtils.parsePageList(new String[] {"3-"}, 5, true));
        }

        @Test
        @DisplayName("invalid range bounds are skipped, valid tokens remain")
        void invalidRangeSkipped() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"x-y", "2"}, 5, true);
            assertEquals(List.of(2), result);
        }

        @Test
        @DisplayName("out-of-range single page is dropped")
        void outOfRangeSinglePage() {
            assertTrue(GeneralUtils.parsePageList(new String[] {"99"}, 5, true).isEmpty());
        }

        @Test
        @DisplayName("non-numeric single page is dropped")
        void nonNumericSinglePage() {
            assertTrue(GeneralUtils.parsePageList(new String[] {"abc"}, 5, true).isEmpty());
        }

        @Test
        @DisplayName("range partially outside the document keeps in-bounds pages")
        void rangePartlyOutOfBounds() {
            assertEquals(List.of(4, 5), GeneralUtils.parsePageList(new String[] {"4-99"}, 5, true));
        }

        @ParameterizedTest(name = "\"{0}\" is dropped")
        @ValueSource(strings = {"-", "--"})
        @DisplayName("range without any bounds is dropped")
        void rangeWithoutBoundsDropped(String token) {
            assertTrue(GeneralUtils.parsePageList(new String[] {token}, 5, true).isEmpty());
        }
    }

    @Nested
    @DisplayName("tokens containing n that are not n-functions")
    class NonFunctionTokenTests {

        @ParameterizedTest(name = "\"{0}\" is dropped")
        @ValueSource(strings = {"no", "and", "none", "xn", "2n+x", "n+", "n*", "n("})
        @DisplayName("token is dropped like any other non-numeric token")
        void droppedLikeOtherInvalidTokens(String token) {
            assertTrue(GeneralUtils.parsePageList(new String[] {token}, 5, true).isEmpty());
        }

        @Test
        @DisplayName("valid tokens around it are still returned")
        void validTokensKept() {
            assertEquals(List.of(1, 3), GeneralUtils.parsePageList("1,no,3", 5, true));
        }

        @Test
        @DisplayName("a real n-function past the evaluation limit still throws")
        void nFunctionLimitStillEnforced() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> GeneralUtils.parsePageList("2n", 10001, true));
        }

        @Test
        @DisplayName("a malformed n-token is dropped even past the evaluation limit")
        void malformedNTokenPastLimitIsDropped() {
            assertEquals(List.of(1, 3), GeneralUtils.parsePageList("1,n+,3", 10001, true));
        }
    }

    @Nested
    @DisplayName("isVersionHigher")
    class VersionTests {

        @ParameterizedTest(name = "{0} > {1} == {2}")
        @CsvSource({
            "2.0.0, 1.9.9, true",
            "1.0.0, 1.0.0, false",
            "1.0, 1.0.1, false",
            "1.0.1, 1.0, true",
            "1.2, 1.10, false"
        })
        @DisplayName("compares version components numerically")
        void comparesComponents(String a, String b, boolean expected) {
            assertEquals(expected, GeneralUtils.isVersionHigher(a, b));
        }

        @Test
        @DisplayName("null arguments yield false")
        void nullArgs() {
            assertFalse(GeneralUtils.isVersionHigher(null, "1.0"));
            assertFalse(GeneralUtils.isVersionHigher("1.0", null));
        }

        @Test
        @DisplayName("non-numeric component throws NumberFormatException")
        void nonNumericComponentThrows() {
            assertThrows(
                    NumberFormatException.class, () -> GeneralUtils.isVersionHigher("1.x", "1.0"));
        }
    }

    @Nested
    @DisplayName("isValidURL")
    class ValidUrlTests {

        @ParameterizedTest
        @ValueSource(strings = {"https://example.com", "http://example.com/path?q=1"})
        @DisplayName("well-formed external URLs are valid")
        void validUrls(String url) {
            assertTrue(GeneralUtils.isValidURL(url));
        }

        @ParameterizedTest
        @ValueSource(strings = {"htp:/bad", "not a url", "://missing-scheme"})
        @DisplayName("malformed URLs are rejected")
        void invalidUrls(String url) {
            assertFalse(GeneralUtils.isValidURL(url));
        }
    }

    @Nested
    @DisplayName("isValidUUID")
    class UuidTests {

        @Test
        @DisplayName("null is not a valid UUID")
        void nullUuid() {
            assertFalse(GeneralUtils.isValidUUID(null));
        }

        @Test
        @DisplayName("well-formed UUID is accepted")
        void validUuid() {
            assertTrue(GeneralUtils.isValidUUID("123e4567-e89b-12d3-a456-426614174000"));
        }

        @Test
        @DisplayName("garbage string is rejected")
        void garbageUuid() {
            assertFalse(GeneralUtils.isValidUUID("xyz"));
        }
    }

    @Nested
    @DisplayName("createDir failure path")
    class CreateDirFailureTests {

        @Test
        @DisplayName("returns false when directory creation throws IOException")
        void createDirIoFailure(@TempDir Path tempDir) throws IOException {
            // A regular file at the target path makes createDirectories fail.
            Path asFile = tempDir.resolve("not-a-dir");
            Files.writeString(asFile, "blocker");
            Path child = asFile.resolve("child");
            assertFalse(GeneralUtils.createDir(child.toString()));
        }
    }

    @Nested
    @DisplayName("extractScript validation")
    class ExtractScriptTests {

        @Test
        @DisplayName("null or blank name is rejected")
        void nullOrBlank() {
            assertThrows(IllegalArgumentException.class, () -> GeneralUtils.extractScript(null));
            assertThrows(IllegalArgumentException.class, () -> GeneralUtils.extractScript("  "));
        }

        @ParameterizedTest
        @ValueSource(strings = {"../evil.py", "dir/script.py"})
        @DisplayName("path-traversal characters are rejected")
        void pathTraversalRejected(String name) {
            assertThrows(IllegalArgumentException.class, () -> GeneralUtils.extractScript(name));
        }

        @Test
        @DisplayName("name outside the allow-list is rejected")
        void notInAllowList() {
            assertThatThrownBy(() -> GeneralUtils.extractScript("random.py"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("png_to_webp.py");
        }
    }

    @Nested
    @DisplayName("extractPipeline invalid configuration")
    class ExtractPipelineTests {

        @Test
        @DisplayName("missing classpath resource surfaces as IOException")
        void missingResource(@TempDir Path tempDir) {
            // Point the pipeline path at a temp dir; default pipeline JSONs are absent from
            // the common module test classpath, so extraction fails with an IOException.
            try (MockedStatic<InstallationPathConfig> mocked =
                    Mockito.mockStatic(InstallationPathConfig.class)) {
                mocked.when(InstallationPathConfig::getPipelinePath).thenReturn(tempDir.toString());
                assertThrows(IOException.class, GeneralUtils::extractPipeline);
            }
        }
    }

    @Nested
    @DisplayName("optimizePdfForEbook")
    class OptimizeForEbookTests {

        @Test
        @DisplayName("optimizes a readable PDF in process without rasterizing its text")
        void optimizesReadablePdf() throws Exception {
            byte[] input = textPdf("ebook");

            try (MockedStatic<ProcessExecutor> processExecutor =
                    Mockito.mockStatic(ProcessExecutor.class)) {
                byte[] optimized = GeneralUtils.optimizePdfForEbook(input);

                assertThat(optimized).isNotEmpty();
                assertThat(optimized.length).isLessThanOrEqualTo(input.length);
                try (PDDocument document = Loader.loadPDF(optimized)) {
                    assertEquals(1, document.getNumberOfPages());
                    assertThat(new PDFTextStripper().getText(document)).contains("ebook");
                }
                processExecutor.verifyNoInteractions();
            }
        }

        @Test
        @DisplayName("invalid PDF bytes surface as IOException")
        void invalidPdfBytes() {
            assertThatThrownBy(() -> GeneralUtils.optimizePdfForEbook(new byte[] {1, 2, 3}))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("JPDFium");
        }

        @Test
        @DisplayName("null and empty input surface as IOException")
        void nullAndEmptyInput() {
            assertThatThrownBy(() -> GeneralUtils.optimizePdfForEbook(null))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("empty PDF");
            assertThatThrownBy(() -> GeneralUtils.optimizePdfForEbook(new byte[0]))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("empty PDF");
        }

        private static byte[] textPdf(String text) throws IOException {
            try (PDDocument document = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    content.newLineAtOffset(72, 720);
                    content.showText(text);
                    content.endText();
                }
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                document.save(output);
                return output.toByteArray();
            }
        }
    }

    @Nested
    @DisplayName("selectBestSiteLocalIp edge cases")
    class SelectBestIpTests {

        @Test
        @DisplayName("empty interface list returns null")
        void emptyList() {
            assertNull(GeneralUtils.selectBestSiteLocalIp(List.of()));
        }

        @Test
        @DisplayName("non-private routable-style site-local IP still scores and is selected")
        void otherRangeStillSelected() {
            GeneralUtils.NetworkInterfaceInfo other =
                    new GeneralUtils.NetworkInterfaceInfo(
                            "eth0",
                            "Realtek PCIe GbE Family Controller",
                            2,
                            true,
                            false,
                            false,
                            false,
                            true,
                            List.of("172.16.5.5"));
            assertEquals("172.16.5.5", GeneralUtils.selectBestSiteLocalIp(List.of(other)));
        }
    }
}
