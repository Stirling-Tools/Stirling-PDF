package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

/**
 * Gap-filling tests for {@link CbrUtils#convertCbrToPdf}. junrar cannot parse synthetic RAR data,
 * so these exercise the archive-open failure branches (corrupt header / invalid format) by feeding
 * non-RAR bytes through a real {@link CustomPDFDocumentFactory} and {@link TempFileManager}. No
 * external tool is launched.
 */
class CbrUtilsMoreTest {

    private TempFileManager tempFileManager;
    private CustomPDFDocumentFactory factory;

    @TempDir Path tempDir;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("test-cbr-");
        tempFileManager = new TempFileManager(new TempFileRegistry(), props);
        factory = new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
    }

    private static MultipartFile cbr(String filename, byte[] bytes) {
        return new MockMultipartFile("file", filename, "application/x-cbr", bytes);
    }

    @Nested
    @DisplayName("convertCbrToPdf - invalid archives")
    class InvalidArchiveTests {

        @Test
        @DisplayName("non-RAR bytes in a .cbr file are rejected as an invalid archive")
        void nonRarContentCbr() {
            byte[] junk = "this is not a rar archive at all".getBytes(StandardCharsets.UTF_8);
            assertThatThrownBy(
                            () ->
                                    CbrUtils.convertCbrToPdf(
                                            cbr("comic.cbr", junk), factory, tempFileManager))
                    .isInstanceOf(Exception.class);
        }

        @Test
        @DisplayName("non-RAR bytes in a .rar file are rejected as an invalid archive")
        void nonRarContentRar() {
            byte[] junk = new byte[] {0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07};
            assertThatThrownBy(
                            () ->
                                    CbrUtils.convertCbrToPdf(
                                            cbr("archive.rar", junk), factory, tempFileManager))
                    .isInstanceOf(Exception.class);
        }

        @Test
        @DisplayName("bytes carrying the RAR signature but no valid body are rejected")
        void rarSignatureOnly() {
            // "Rar!\x1A\x07\x00" is the classic RAR4 signature; body is missing/garbage.
            byte[] data = {0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55};
            assertThatThrownBy(
                            () ->
                                    CbrUtils.convertCbrToPdf(
                                            cbr("comic.cbr", data), factory, tempFileManager))
                    .isInstanceOf(Exception.class);
        }
    }

    @Nested
    @DisplayName("convertCbrToPdf - validation overload")
    class ValidationTests {

        @Test
        @DisplayName("the 3-arg overload delegates and still validates the extension")
        void threeArgOverloadValidatesExtension() {
            MultipartFile wrong = cbr("document.pdf", "x".getBytes(StandardCharsets.UTF_8));
            assertThatThrownBy(() -> CbrUtils.convertCbrToPdf(wrong, factory, tempFileManager))
                    .isInstanceOf(Exception.class);
        }

        @Test
        @DisplayName("an empty .cbr file is rejected before archive parsing")
        void emptyFile() {
            MultipartFile empty = cbr("comic.cbr", new byte[0]);
            assertThatThrownBy(() -> CbrUtils.convertCbrToPdf(empty, factory, tempFileManager))
                    .isInstanceOf(Exception.class);
        }
    }

    @Nested
    @DisplayName("isCbrFile additional branches")
    class IsCbrFileTests {

        @Test
        @DisplayName("a .zip file is not a CBR")
        void zipIsNotCbr() {
            MultipartFile file = mock(MultipartFile.class);
            org.mockito.Mockito.when(file.getOriginalFilename()).thenReturn("bundle.zip");
            assertThat(CbrUtils.isCbrFile(file)).isFalse();
        }
    }
}
