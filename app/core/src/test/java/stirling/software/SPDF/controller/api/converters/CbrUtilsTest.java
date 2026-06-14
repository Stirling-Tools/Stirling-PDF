package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.multipart.ByteArrayMultipartFile;
import stirling.software.common.util.CbrUtils;

class CbrUtilsTest {

    @Test
    void testIsCbrFile_ValidCbrFile() {
        ByteArrayMultipartFile cbrFile =
                new ByteArrayMultipartFile(
                        "file",
                        "test.cbr",
                        "application/x-rar-compressed",
                        "test content".getBytes());

        assertTrue(CbrUtils.isCbrFile(cbrFile));
    }

    @Test
    void testIsCbrFile_ValidRarFile() {
        ByteArrayMultipartFile rarFile =
                new ByteArrayMultipartFile(
                        "file",
                        "test.rar",
                        "application/x-rar-compressed",
                        "test content".getBytes());

        assertTrue(CbrUtils.isCbrFile(rarFile));
    }

    @Test
    void testIsCbrFile_InvalidFile() {
        ByteArrayMultipartFile textFile =
                new ByteArrayMultipartFile(
                        "file", "test.txt", "text/plain", "test content".getBytes());

        assertFalse(CbrUtils.isCbrFile(textFile));
    }

    @Test
    void testIsCbrFile_NoFilename() {
        ByteArrayMultipartFile noNameFile =
                new ByteArrayMultipartFile(
                        "file", null, "application/x-rar-compressed", "test content".getBytes());

        assertFalse(CbrUtils.isCbrFile(noNameFile));
    }

    @Test
    void testIsCbrFile_PdfFile() {
        ByteArrayMultipartFile pdfFile =
                new ByteArrayMultipartFile(
                        "file", "document.pdf", "application/pdf", "pdf content".getBytes());

        assertFalse(CbrUtils.isCbrFile(pdfFile));
    }

    @Test
    void testIsCbrFile_JpegFile() {
        ByteArrayMultipartFile jpegFile =
                new ByteArrayMultipartFile(
                        "file", "image.jpg", "image/jpeg", "jpeg content".getBytes());

        assertFalse(CbrUtils.isCbrFile(jpegFile));
    }

    @Test
    void testIsCbrFile_ZipFile() {
        ByteArrayMultipartFile zipFile =
                new ByteArrayMultipartFile(
                        "file", "archive.zip", "application/zip", "zip content".getBytes());

        assertFalse(CbrUtils.isCbrFile(zipFile));
    }

    @Test
    void testIsCbrFile_MixedCaseExtension() {
        ByteArrayMultipartFile cbrFile =
                new ByteArrayMultipartFile(
                        "file",
                        "test.CBR",
                        "application/x-rar-compressed",
                        "test content".getBytes());

        assertTrue(CbrUtils.isCbrFile(cbrFile));
    }
}
