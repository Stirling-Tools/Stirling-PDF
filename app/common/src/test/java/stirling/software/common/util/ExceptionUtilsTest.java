package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

/**
 * Unit tests for {@link ExceptionUtils}. Assumptions: - PdfErrorUtils.isCorruptedPdfError is a
 * static method that returns true for certain exception types. We will mock it in tests for
 * handlePdfException and logException.
 */
class ExceptionUtilsTest {

    @Nested
    @DisplayName("PDF corruption exception creation")
    class PdfCorruptionTests {

        @Test
        @DisplayName("should create PdfCorruptedException without context")
        void testCreatePdfCorruptedExceptionWithoutContext() {
            Exception cause = new Exception("root");
            IOException ex = ExceptionUtils.createPdfCorruptedException(cause);

            assertEquals(
                    "PDF file appears to be corrupted or damaged. Please try using the 'Repair PDF'"
                            + " feature first to fix the file before proceeding with this operation.",
                    ex.getMessage());
            assertSame(cause, ex.getCause());
        }

        @Test
        @DisplayName("should create PdfCorruptedException with context")
        void testCreatePdfCorruptedExceptionWithContext() {
            Exception cause = new Exception("root");
            IOException ex = ExceptionUtils.createPdfCorruptedException("during merge", cause);

            assertTrue(
                    ex.getMessage()
                            .startsWith("Error during merge: PDF file appears to be corrupted"));
            assertSame(cause, ex.getCause());
        }

        @Test
        @DisplayName("should create MultiplePdfCorruptedException")
        void testCreateMultiplePdfCorruptedException() {
            Exception cause = new Exception("root");
            IOException ex = ExceptionUtils.createMultiplePdfCorruptedException(cause);

            assertTrue(ex.getMessage().startsWith("One or more PDF files appear to be corrupted"));
            assertSame(cause, ex.getCause());
        }
    }

    @Nested
    @DisplayName("PDF encryption and password exception creation")
    class PdfSecurityTests {

        @Test
        void testCreatePdfEncryptionException() {
            Exception cause = new Exception("root");
            IOException ex = ExceptionUtils.createPdfEncryptionException(cause);
            assertTrue(ex.getMessage().contains("corrupted encryption data"));
            assertSame(cause, ex.getCause());
        }

        @Test
        void testCreatePdfPasswordException() {
            Exception cause = new Exception("root");
            IOException ex = ExceptionUtils.createPdfPasswordException(cause);
            assertTrue(ex.getMessage().contains("passworded"));
            assertSame(cause, ex.getCause());
        }
    }

    @Nested
    @DisplayName("File processing exception creation")
    class FileProcessingTests {

        @Test
        void testCreateFileProcessingException() {
            Exception cause = new Exception("boom");
            IOException ex = ExceptionUtils.createFileProcessingException("merge", cause);
            assertTrue(ex.getMessage().contains("while processing the file during merge"));
            assertSame(cause, ex.getCause());
        }
    }

    @Nested
    @DisplayName("Generic exception creation")
    class GenericCreationTests {

        @Test
        void testCreateIOException() {
            IOException ex =
                    ExceptionUtils.createIOException(
                            "key", "Default message: {0}", new Exception("cause"), "X");
            assertEquals("Default message: X", ex.getMessage());
        }

        @Test
        void testCreateRuntimeException() {
            RuntimeException ex =
                    ExceptionUtils.createRuntimeException(
                            "key", "Default message: {0}", new Exception("cause"), "Y");
            assertEquals("Default message: Y", ex.getMessage());
        }

        @Test
        void testCreateIllegalArgumentException() {
            IllegalArgumentException ex =
                    ExceptionUtils.createIllegalArgumentException("key", "Format {0}", "Z");
            assertEquals("Format Z", ex.getMessage());
        }
    }

    @Nested
    @DisplayName("Predefined validation exceptions")
    class PredefinedValidationTests {

        @Test
        void testCreateHtmlFileRequiredException() {
            IllegalArgumentException ex = ExceptionUtils.createHtmlFileRequiredException();
            assertTrue(ex.getMessage().contains("HTML or ZIP"));
        }

        @Test
        void testCreatePdfFileRequiredException() {
            IllegalArgumentException ex = ExceptionUtils.createPdfFileRequiredException();
            assertTrue(ex.getMessage().contains("PDF"));
        }

        @Test
        void testCreateInvalidPageSizeException() {
            IllegalArgumentException ex = ExceptionUtils.createInvalidPageSizeException("A5");
            assertTrue(ex.getMessage().contains("page size"));
        }
    }

    @Nested
    @DisplayName("OCR and system requirement exceptions")
    class OcrAndSystemTests {

        @Test
        void testCreateOcrLanguageRequiredException() {
            IOException ex = ExceptionUtils.createOcrLanguageRequiredException();
            assertTrue(ex.getMessage().contains("OCR language"));
        }

        @Test
        void testCreateOcrInvalidLanguagesException() {
            IOException ex = ExceptionUtils.createOcrInvalidLanguagesException();
            assertTrue(ex.getMessage().contains("none of the selected languages"));
        }

        @Test
        void testCreateOcrToolsUnavailableException() {
            IOException ex = ExceptionUtils.createOcrToolsUnavailableException();
            assertTrue(ex.getMessage().contains("OCR tools"));
        }

        @Test
        void testCreatePythonRequiredForWebpException() {
            IOException ex = ExceptionUtils.createPythonRequiredForWebpException();
            assertTrue(ex.getMessage().contains("Python"));
            assertTrue(ex.getMessage().contains("WebP conversion"));
        }
    }

    @Nested
    @DisplayName("File operation and compression exceptions")
    class FileAndCompressionTests {

        @Test
        void testCreateFileNotFoundException() {
            IOException ex = ExceptionUtils.createFileNotFoundException("123");
            assertTrue(ex.getMessage().contains("123"));
        }

        @Test
        void testCreatePdfaConversionFailedException() {
            RuntimeException ex = ExceptionUtils.createPdfaConversionFailedException();
            assertTrue(ex.getMessage().contains("PDF/A conversion failed"));
        }

        @Test
        void testCreateInvalidComparatorException() {
            IllegalArgumentException ex = ExceptionUtils.createInvalidComparatorException();
            assertTrue(ex.getMessage().contains("comparator"));
        }

        @Test
        void testCreateMd5AlgorithmException() {
            RuntimeException ex = ExceptionUtils.createMd5AlgorithmException(new Exception("x"));
            assertTrue(ex.getMessage().contains("MD5"));
        }

        @Test
        void testCreateCompressionOptionsException() {
            IllegalArgumentException ex = ExceptionUtils.createCompressionOptionsException();
            assertTrue(ex.getMessage().contains("compression"));
        }

        @Test
        void testCreateGhostscriptCompressionExceptionNoCause() {
            IOException ex = ExceptionUtils.createGhostscriptCompressionException();
            assertTrue(ex.getMessage().contains("Ghostscript"));
        }

        @Test
        void testCreateGhostscriptCompressionExceptionWithCause() {
            IOException ex =
                    ExceptionUtils.createGhostscriptCompressionException(new Exception("cause"));
            assertTrue(ex.getMessage().contains("Ghostscript"));
        }

        @Test
        void testCreateQpdfCompressionException() {
            IOException ex = ExceptionUtils.createQpdfCompressionException(new Exception("cause"));
            assertTrue(ex.getMessage().contains("QPDF"));
        }
    }

    @Nested
    @DisplayName("PDF exception handling")
    class PdfExceptionHandlingTests {

        @Test
        void testHandlePdfExceptionWhenCorrupted() {
            IOException original = new IOException("corrupted pdf");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(original)).thenReturn(true);
                IOException result = ExceptionUtils.handlePdfException(original);
                assertNotSame(original, result);
                assertTrue(result.getMessage().contains("corrupted"));
            }
        }

        @Test
        void testHandlePdfExceptionWhenEncryptionError() {
            IOException original = new IOException("BadPaddingException");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(original)).thenReturn(false);
                IOException result = ExceptionUtils.handlePdfException(original);
                assertTrue(result.getMessage().contains("corrupted encryption data"));
            }
        }

        @Test
        void testHandlePdfExceptionWhenPasswordError() {
            IOException original = new IOException("password is incorrect");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(original)).thenReturn(false);
                IOException result = ExceptionUtils.handlePdfException(original);
                assertTrue(result.getMessage().contains("passworded"));
            }
        }

        @Test
        void testHandlePdfExceptionWhenNoSpecialError() {
            IOException original = new IOException("something else");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(original)).thenReturn(false);
                IOException result = ExceptionUtils.handlePdfException(original);
                assertSame(original, result);
            }
        }
    }

    @Nested
    @DisplayName("Encryption and password detection")
    class ErrorDetectionTests {

        @Test
        void testIsEncryptionErrorTrue() {
            assertTrue(ExceptionUtils.isEncryptionError(new IOException("BadPaddingException")));
            assertTrue(
                    ExceptionUtils.isEncryptionError(
                            new IOException("Given final block not properly padded")));
            assertTrue(
                    ExceptionUtils.isEncryptionError(
                            new IOException("AES initialization vector not fully read")));
            assertTrue(ExceptionUtils.isEncryptionError(new IOException("Failed to decrypt")));
        }

        @Test
        void testIsEncryptionErrorFalse() {
            assertFalse(ExceptionUtils.isEncryptionError(new IOException("other message")));
            assertFalse(ExceptionUtils.isEncryptionError(new IOException((String) null)));
        }

        @Test
        void testIsPasswordErrorTrue() {
            assertTrue(ExceptionUtils.isPasswordError(new IOException("password is incorrect")));
            assertTrue(ExceptionUtils.isPasswordError(new IOException("Password is not provided")));
            assertTrue(
                    ExceptionUtils.isPasswordError(
                            new IOException("PDF contains an encryption dictionary")));
        }

        @Test
        void testIsPasswordErrorFalse() {
            assertFalse(ExceptionUtils.isPasswordError(new IOException("something else")));
            assertFalse(ExceptionUtils.isPasswordError(new IOException((String) null)));
        }
    }

    @Nested
    @DisplayName("Logging behavior")
    class LoggingTests {

        @Test
        void testLogExceptionWhenCorruptedPdf() {
            Exception e = new IOException("corrupted");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(e)).thenReturn(true);
                // We can't assert log output here without a custom appender, but this ensures no
                // exception is thrown
                ExceptionUtils.logException("merge", e);
            }
        }

        @Test
        void testLogExceptionWhenEncryptionError() {
            IOException e = new IOException("BadPaddingException");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(e)).thenReturn(false);
                ExceptionUtils.logException("merge", e);
            }
        }

        @Test
        void testLogExceptionWhenPasswordError() {
            IOException e = new IOException("password is incorrect");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(e)).thenReturn(false);
                ExceptionUtils.logException("merge", e);
            }
        }

        @Test
        void testLogExceptionUnexpectedError() {
            Exception e = new RuntimeException("unexpected");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(e)).thenReturn(false);
                ExceptionUtils.logException("merge", e);
            }
        }
    }

    @Nested
    @DisplayName("Invalid and null argument exceptions")
    class ArgumentValidationTests {

        @Test
        void testCreateInvalidArgumentExceptionSingle() {
            IllegalArgumentException ex = ExceptionUtils.createInvalidArgumentException("arg");
            assertTrue(ex.getMessage().contains("arg"));
        }

        @Test
        void testCreateInvalidArgumentExceptionWithValue() {
            IllegalArgumentException ex =
                    ExceptionUtils.createInvalidArgumentException("arg", "val");
            assertTrue(ex.getMessage().contains("val"));
        }

        @Test
        void testCreateNullArgumentException() {
            IllegalArgumentException ex = ExceptionUtils.createNullArgumentException("arg");
            assertTrue(ex.getMessage().contains("arg"));
        }
    }
}
