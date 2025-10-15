package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.util.CbrUtils;

class CbrUtilsTest {

    @Test
    void testIsCbrFile_ValidCbrFile() {
        MockMultipartFile cbrFile =
                new MockMultipartFile(
                        "file",
                        "test.cbr",
                        "application/x-rar-compressed",
                        "test content".getBytes());

        assertTrue(CbrUtils.isCbrFile(cbrFile));
    }

    @Test
    void testIsCbrFile_ValidRarFile() {
        MockMultipartFile rarFile =
                new MockMultipartFile(
                        "file",
                        "test.rar",
                        "application/x-rar-compressed",
                        "test content".getBytes());

        assertTrue(CbrUtils.isCbrFile(rarFile));
    }

    @Test
    void testIsCbrFile_InvalidFile() {
        MockMultipartFile textFile =
                new MockMultipartFile("file", "test.txt", "text/plain", "test content".getBytes());

        assertFalse(CbrUtils.isCbrFile(textFile));
    }

    @Test
    void testIsCbrFile_NoFilename() {
        MockMultipartFile noNameFile =
                new MockMultipartFile(
                        "file", null, "application/x-rar-compressed", "test content".getBytes());

        assertFalse(CbrUtils.isCbrFile(noNameFile));
    }

    @Test
    void testIsCbrFile_PdfFile() {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "file", "document.pdf", "application/pdf", "pdf content".getBytes());

        assertFalse(CbrUtils.isCbrFile(pdfFile));
    }

    @Test
    void testIsCbrFile_JpegFile() {
        MockMultipartFile jpegFile =
                new MockMultipartFile("file", "image.jpg", "image/jpeg", "jpeg content".getBytes());

        assertFalse(CbrUtils.isCbrFile(jpegFile));
    }

    @Test
    void testIsCbrFile_ZipFile() {
        MockMultipartFile zipFile =
                new MockMultipartFile(
                        "file", "archive.zip", "application/zip", "zip content".getBytes());

        assertFalse(CbrUtils.isCbrFile(zipFile));
    }

    @Test
    void testIsCbrFile_MixedCaseExtension() {
        MockMultipartFile cbrFile =
                new MockMultipartFile(
                        "file",
                        "test.CBR",
                        "application/x-rar-compressed",
                        "test content".getBytes());

        assertTrue(CbrUtils.isCbrFile(cbrFile));
    }
}
