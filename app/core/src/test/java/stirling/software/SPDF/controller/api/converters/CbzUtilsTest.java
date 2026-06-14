package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.multipart.ByteArrayMultipartFile;
import stirling.software.common.util.CbzUtils;

class CbzUtilsTest {

    @Test
    void testIsCbzFile_ValidCbzFile() {
        ByteArrayMultipartFile cbzFile =
                new ByteArrayMultipartFile(
                        "file", "test.cbz", "application/zip", "test content".getBytes());

        assertTrue(CbzUtils.isCbzFile(cbzFile));
    }

    @Test
    void testIsCbzFile_ValidZipFile() {
        ByteArrayMultipartFile zipFile =
                new ByteArrayMultipartFile(
                        "file", "test.zip", "application/zip", "test content".getBytes());

        assertTrue(CbzUtils.isCbzFile(zipFile));
    }

    @Test
    void testIsCbzFile_InvalidFile() {
        ByteArrayMultipartFile textFile =
                new ByteArrayMultipartFile(
                        "file", "test.txt", "text/plain", "test content".getBytes());

        assertFalse(CbzUtils.isCbzFile(textFile));
    }

    @Test
    void testIsCbzFile_NoFilename() {
        ByteArrayMultipartFile noNameFile =
                new ByteArrayMultipartFile(
                        "file", null, "application/zip", "test content".getBytes());

        assertFalse(CbzUtils.isCbzFile(noNameFile));
    }

    @Test
    void testIsCbzFile_PdfFile() {
        ByteArrayMultipartFile pdfFile =
                new ByteArrayMultipartFile(
                        "file", "document.pdf", "application/pdf", "pdf content".getBytes());

        assertFalse(CbzUtils.isCbzFile(pdfFile));
    }

    @Test
    void testIsCbzFile_JpegFile() {
        ByteArrayMultipartFile jpegFile =
                new ByteArrayMultipartFile(
                        "file", "image.jpg", "image/jpeg", "jpeg content".getBytes());

        assertFalse(CbzUtils.isCbzFile(jpegFile));
    }

    @Test
    void testIsCbzFile_RarFile() {
        ByteArrayMultipartFile rarFile =
                new ByteArrayMultipartFile(
                        "file",
                        "archive.rar",
                        "application/x-rar-compressed",
                        "rar content".getBytes());

        assertFalse(CbzUtils.isCbzFile(rarFile));
    }

    @Test
    void testIsCbzFile_MixedCaseExtension() {
        ByteArrayMultipartFile cbzFile =
                new ByteArrayMultipartFile(
                        "file", "test.CBZ", "application/zip", "test content".getBytes());

        assertTrue(CbzUtils.isCbzFile(cbzFile));
    }
}
