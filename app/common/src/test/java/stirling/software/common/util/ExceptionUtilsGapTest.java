package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mockStatic;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import stirling.software.common.util.ExceptionUtils.BaseAppException;
import stirling.software.common.util.ExceptionUtils.CbrFormatException;
import stirling.software.common.util.ExceptionUtils.CbzFormatException;
import stirling.software.common.util.ExceptionUtils.EmlFormatException;
import stirling.software.common.util.ExceptionUtils.ErrorCode;
import stirling.software.common.util.ExceptionUtils.FfmpegRequiredException;
import stirling.software.common.util.ExceptionUtils.GhostscriptException;
import stirling.software.common.util.ExceptionUtils.OutOfMemoryDpiException;
import stirling.software.common.util.ExceptionUtils.PdfCorruptedException;

/**
 * Additional gap-filling unit tests for {@link ExceptionUtils}, covering areas not exercised by
 * {@code ExceptionUtilsTest}: CBR/CBZ/EML factories, error-code hint/action lookups, rendering
 * dimension validation, OOM rendering wrappers, Ghostscript output analysis, and wrapException.
 *
 * <p>The {@code messages} ResourceBundle is not on the common module test classpath, so {@link
 * ExceptionUtils} falls back to the default messages baked into {@link ErrorCode}. Assertions here
 * rely only on those default messages and on deterministic structural behavior.
 */
class ExceptionUtilsGapTest {

    @Nested
    @DisplayName("ErrorCode enum metadata")
    class ErrorCodeMetadataTests {

        @Test
        @DisplayName("each error code exposes code, message key and default message")
        void allErrorCodesHaveMetadata() {
            for (ErrorCode code : ErrorCode.values()) {
                assertNotNull(code.getCode(), "code for " + code);
                assertTrue(code.getCode().startsWith("E"), "code prefix for " + code);
                assertNotNull(code.getMessageKey(), "messageKey for " + code);
                assertNotNull(code.getDefaultMessage(), "defaultMessage for " + code);
                assertFalse(code.getDefaultMessage().isEmpty(), "defaultMessage empty for " + code);
            }
        }

        @Test
        @DisplayName("known error codes map to expected identifiers")
        void knownErrorCodeIdentifiers() {
            assertEquals("E001", ErrorCode.PDF_CORRUPTED.getCode());
            assertEquals("E081", ErrorCode.OUT_OF_MEMORY_DPI.getCode());
            assertEquals("error.pdfCorrupted", ErrorCode.PDF_CORRUPTED.getMessageKey());
        }
    }

    @Nested
    @DisplayName("Hints and action lookups via resource bundle")
    class HintAndActionTests {

        @Test
        @DisplayName("getHintsForErrorCode returns empty list for null code")
        void hintsNullCode() {
            assertEquals(List.of(), ExceptionUtils.getHintsForErrorCode(null));
        }

        @Test
        @DisplayName("getHintsForErrorCode returns empty list when no hints exist in bundle")
        void hintsMissingFromBundle() {
            // Fallback empty bundle has no hint keys, so the result is an empty list.
            List<String> hints = ExceptionUtils.getHintsForErrorCode("E001");
            assertNotNull(hints);
            assertTrue(hints.isEmpty());
        }

        @Test
        @DisplayName("getActionRequiredForErrorCode returns null for null code")
        void actionNullCode() {
            assertNull(ExceptionUtils.getActionRequiredForErrorCode(null));
        }

        @Test
        @DisplayName("getActionRequiredForErrorCode returns null when key absent from bundle")
        void actionMissingFromBundle() {
            assertNull(ExceptionUtils.getActionRequiredForErrorCode("E001"));
        }
    }

    @Nested
    @DisplayName("CBR format exception factories")
    class CbrFactoryTests {

        @Test
        @DisplayName("invalid format uses provided message when non-null")
        void cbrInvalidFormatWithMessage() {
            CbrFormatException ex =
                    ExceptionUtils.createCbrInvalidFormatException("custom cbr msg");
            assertEquals("custom cbr msg", ex.getMessage());
            assertEquals(ErrorCode.CBR_INVALID_FORMAT.getCode(), ex.getErrorCode());
        }

        @Test
        @DisplayName("invalid format falls back to default message when null")
        void cbrInvalidFormatNullMessage() {
            CbrFormatException ex = ExceptionUtils.createCbrInvalidFormatException(null);
            assertTrue(ex.getMessage().contains("CBR/RAR archive"));
            assertEquals("E010", ex.getErrorCode());
        }

        @Test
        @DisplayName("encrypted CBR reuses invalid-format code")
        void cbrEncrypted() {
            CbrFormatException ex = ExceptionUtils.createCbrEncryptedException();
            assertEquals(ErrorCode.CBR_INVALID_FORMAT.getCode(), ex.getErrorCode());
        }

        @Test
        @DisplayName("no images and corrupted images both map to CBR_NO_IMAGES")
        void cbrNoImages() {
            CbrFormatException noImages = ExceptionUtils.createCbrNoImagesException();
            CbrFormatException corrupted = ExceptionUtils.createCbrCorruptedImagesException();
            assertEquals(ErrorCode.CBR_NO_IMAGES.getCode(), noImages.getErrorCode());
            assertEquals(ErrorCode.CBR_NO_IMAGES.getCode(), corrupted.getErrorCode());
            assertTrue(noImages.getMessage().contains("No valid images"));
        }

        @Test
        @DisplayName("not-a-CBR file uses CBR_NOT_CBR code")
        void notCbr() {
            CbrFormatException ex = ExceptionUtils.createNotCbrFileException();
            assertEquals(ErrorCode.CBR_NOT_CBR.getCode(), ex.getErrorCode());
            assertTrue(ex.getMessage().contains("CBR or RAR"));
        }

        @Test
        @DisplayName(
                "CbrFormatException is an IllegalArgumentException via BaseValidationException")
        void cbrIsIllegalArgument() {
            CbrFormatException ex = ExceptionUtils.createNotCbrFileException();
            assertInstanceOf(IllegalArgumentException.class, ex);
        }
    }

    @Nested
    @DisplayName("CBZ format exception factories")
    class CbzFactoryTests {

        @Test
        @DisplayName("invalid format wraps cause and uses CBZ_INVALID_FORMAT code")
        void cbzInvalidFormat() {
            Exception cause = new Exception("zip boom");
            CbzFormatException ex = ExceptionUtils.createCbzInvalidFormatException(cause);
            assertSame(cause, ex.getCause());
            assertEquals(ErrorCode.CBZ_INVALID_FORMAT.getCode(), ex.getErrorCode());
            assertTrue(ex.getMessage().contains("CBZ/ZIP archive"));
        }

        @Test
        @DisplayName("empty CBZ reuses invalid-format code")
        void cbzEmpty() {
            CbzFormatException ex = ExceptionUtils.createCbzEmptyException();
            assertEquals(ErrorCode.CBZ_INVALID_FORMAT.getCode(), ex.getErrorCode());
        }

        @Test
        @DisplayName("no images and corrupted images both map to CBZ_NO_IMAGES")
        void cbzNoImages() {
            CbzFormatException noImages = ExceptionUtils.createCbzNoImagesException();
            CbzFormatException corrupted = ExceptionUtils.createCbzCorruptedImagesException();
            assertEquals(ErrorCode.CBZ_NO_IMAGES.getCode(), noImages.getErrorCode());
            assertEquals(ErrorCode.CBZ_NO_IMAGES.getCode(), corrupted.getErrorCode());
        }

        @Test
        @DisplayName("not-a-CBZ file uses CBZ_NOT_CBZ code")
        void notCbz() {
            CbzFormatException ex = ExceptionUtils.createNotCbzFileException();
            assertEquals(ErrorCode.CBZ_NOT_CBZ.getCode(), ex.getErrorCode());
            assertTrue(ex.getMessage().contains("CBZ or ZIP"));
        }
    }

    @Nested
    @DisplayName("EML format exception factories")
    class EmlFactoryTests {

        @Test
        @DisplayName("empty EML uses EML_EMPTY code")
        void emlEmpty() {
            EmlFormatException ex = ExceptionUtils.createEmlEmptyException();
            assertEquals(ErrorCode.EML_EMPTY.getCode(), ex.getErrorCode());
            assertTrue(ex.getMessage().contains("EML file is empty"));
        }

        @Test
        @DisplayName("invalid EML uses EML_INVALID_FORMAT code")
        void emlInvalid() {
            EmlFormatException ex = ExceptionUtils.createEmlInvalidFormatException();
            assertEquals(ErrorCode.EML_INVALID_FORMAT.getCode(), ex.getErrorCode());
            assertTrue(ex.getMessage().contains("Invalid EML"));
        }
    }

    @Nested
    @DisplayName("Image, OCR and processing factories")
    class ImageOcrProcessingTests {

        @Test
        @DisplayName("image read exception embeds filename and has no cause")
        void imageRead() {
            IOException ex = ExceptionUtils.createImageReadException("photo.png");
            assertTrue(ex.getMessage().contains("photo.png"));
            assertNull(ex.getCause());
        }

        @Test
        @DisplayName("image read exception rejects null filename")
        void imageReadNullFilename() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createImageReadException(null));
        }

        @Test
        @DisplayName("ocr invalid render type uses default message")
        void ocrInvalidRenderType() {
            IOException ex = ExceptionUtils.createOcrInvalidRenderTypeException();
            assertTrue(ex.getMessage().contains("hocr"));
        }

        @Test
        @DisplayName("ocr processing failed includes return code")
        void ocrProcessingFailed() {
            IOException ex = ExceptionUtils.createOcrProcessingFailedException(7);
            assertTrue(ex.getMessage().contains("7"));
        }

        @Test
        @DisplayName("processing interrupted wraps the InterruptedException cause")
        void processingInterrupted() {
            InterruptedException cause = new InterruptedException("stop");
            IOException ex =
                    ExceptionUtils.createProcessingInterruptedException("compression", cause);
            assertSame(cause, ex.getCause());
            assertTrue(ex.getMessage().contains("compression"));
        }

        @Test
        @DisplayName("processing interrupted rejects null arguments")
        void processingInterruptedNullArgs() {
            assertThrows(
                    IllegalArgumentException.class,
                    () ->
                            ExceptionUtils.createProcessingInterruptedException(
                                    null, new InterruptedException()));
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createProcessingInterruptedException("x", null));
        }

        @Test
        @DisplayName("ghostscript conversion exception embeds output type")
        void ghostscriptConversion() {
            IOException ex = ExceptionUtils.createGhostscriptConversionException("png");
            assertNotNull(ex.getMessage());
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createGhostscriptConversionException(null));
        }
    }

    @Nested
    @DisplayName("Validation factories: page size, file, ffmpeg")
    class ValidationFactoryTests {

        @Test
        @DisplayName("invalid page size rejects null size")
        void invalidPageSizeNull() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createInvalidPageSizeException(null));
        }

        @Test
        @DisplayName("file null-or-empty uses FILE_NULL_OR_EMPTY default message")
        void fileNullOrEmpty() {
            IllegalArgumentException ex = ExceptionUtils.createFileNullOrEmptyException();
            assertTrue(ex.getMessage().contains("null or empty"));
        }

        @Test
        @DisplayName("file no-name uses FILE_NO_NAME default message")
        void fileNoName() {
            IllegalArgumentException ex = ExceptionUtils.createFileNoNameException();
            assertTrue(ex.getMessage().contains("must have a name"));
        }

        @Test
        @DisplayName("pdf no-pages uses PDF_NO_PAGES default message")
        void pdfNoPages() {
            IllegalArgumentException ex = ExceptionUtils.createPdfNoPages();
            assertTrue(ex.getMessage().contains("no pages"));
        }

        @Test
        @DisplayName("ffmpeg required exception exposes FFMPEG_REQUIRED code and null cause")
        void ffmpegRequired() {
            FfmpegRequiredException ex = ExceptionUtils.createFfmpegRequiredException();
            assertEquals(ErrorCode.FFMPEG_REQUIRED.getCode(), ex.getErrorCode());
            assertNull(ex.getCause());
            assertTrue(ex.getMessage().contains("FFmpeg"));
        }
    }

    @Nested
    @DisplayName("ErrorCode-based argument and IO factories")
    class ErrorCodeArgFactoryTests {

        @Test
        @DisplayName("createIllegalArgumentException(ErrorCode, args) formats default message")
        void illegalArgumentFromErrorCode() {
            IllegalArgumentException ex =
                    ExceptionUtils.createIllegalArgumentException(
                            ErrorCode.INVALID_PAGE_SIZE, "B7");
            assertTrue(ex.getMessage().contains("B7"));
        }

        @Test
        @DisplayName("createIllegalArgumentException rejects null ErrorCode")
        void illegalArgumentFromNullErrorCode() {
            ErrorCode nullCode = null;
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createIllegalArgumentException(nullCode));
        }

        @Test
        @DisplayName("createFileProcessingException rejects null operation and cause")
        void fileProcessingNullArgs() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createFileProcessingException(null, new Exception()));
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createFileProcessingException("op", null));
        }

        @Test
        @DisplayName("createInvalidArgumentException rejects null name or value")
        void invalidArgumentNullArgs() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createInvalidArgumentException(null, "v"));
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createInvalidArgumentException("n", null));
        }

        @Test
        @DisplayName("createNullArgumentException rejects null argument name")
        void nullArgumentNullName() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createNullArgumentException(null));
        }

        @Test
        @DisplayName("createIOException without cause leaves cause null")
        void ioExceptionWithoutCause() {
            IOException ex = ExceptionUtils.createIOException("key", "msg {0}", null, "A");
            assertEquals("msg A", ex.getMessage());
            assertNull(ex.getCause());
        }

        @Test
        @DisplayName("createRuntimeException without cause leaves cause null")
        void runtimeExceptionWithoutCause() {
            RuntimeException ex =
                    ExceptionUtils.createRuntimeException("key", "msg {0}", null, "B");
            assertEquals("msg B", ex.getMessage());
            assertNull(ex.getCause());
        }
    }

    @Nested
    @DisplayName("createPdfCorruptedException null-cause handling")
    class PdfCorruptedCauseTests {

        @Test
        @DisplayName("rejects null cause")
        void nullCause() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createPdfCorruptedException("ctx", null));
        }

        @Test
        @DisplayName("empty context behaves like no context")
        void emptyContext() {
            PdfCorruptedException ex =
                    ExceptionUtils.createPdfCorruptedException("", new Exception("x"));
            assertTrue(ex.getMessage().contains("PDF file appears to be corrupted"));
            assertEquals(ErrorCode.PDF_CORRUPTED.getCode(), ex.getErrorCode());
        }
    }

    @Nested
    @DisplayName("validateRenderingDimensions")
    class ValidateRenderingDimensionsTests {

        @Test
        @DisplayName("null page is a no-op")
        void nullPage() {
            // Should simply return without throwing.
            org.junit.jupiter.api.Assertions.assertDoesNotThrow(
                    () -> ExceptionUtils.validateRenderingDimensions(null, 1, 300));
        }

        @Test
        @DisplayName("normal letter-size page at 150 DPI passes validation")
        void normalPagePasses() {
            PDPage page = new PDPage(PDRectangle.LETTER);
            org.junit.jupiter.api.Assertions.assertDoesNotThrow(
                    () -> ExceptionUtils.validateRenderingDimensions(page, 1, 150));
        }

        @Test
        @DisplayName("page with zero DPI yields zero pixels and passes")
        void zeroDpiPasses() {
            PDPage page = new PDPage(PDRectangle.A4);
            org.junit.jupiter.api.Assertions.assertDoesNotThrow(
                    () -> ExceptionUtils.validateRenderingDimensions(page, 2, 0));
        }
    }

    @Nested
    @DisplayName("handleOomRendering wrappers")
    class HandleOomRenderingTests {

        @Test
        @DisplayName("returns operation result on success (with page number)")
        void successWithPage() throws IOException {
            String result = ExceptionUtils.handleOomRendering(3, 300, () -> "ok");
            assertEquals("ok", result);
        }

        @Test
        @DisplayName("returns operation result on success (no page number)")
        void successNoPage() throws IOException {
            String result = ExceptionUtils.handleOomRendering(300, () -> "fine");
            assertEquals("fine", result);
        }

        @Test
        @DisplayName("propagates IOException from the operation unchanged")
        void propagatesIoException() {
            IOException boom = new IOException("io boom");
            IOException thrown =
                    assertThrows(
                            IOException.class,
                            () ->
                                    ExceptionUtils.handleOomRendering(
                                            1,
                                            300,
                                            () -> {
                                                throw boom;
                                            }));
            assertSame(boom, thrown);
        }

        @Test
        @DisplayName("converts OutOfMemoryError to OutOfMemoryDpiException (with page)")
        void oomToDpiExceptionWithPage() {
            OutOfMemoryDpiException thrown =
                    assertThrows(
                            OutOfMemoryDpiException.class,
                            () ->
                                    ExceptionUtils.handleOomRendering(
                                            5,
                                            300,
                                            () -> {
                                                throw new OutOfMemoryError("heap");
                                            }));
            assertEquals(ErrorCode.OUT_OF_MEMORY_DPI.getCode(), thrown.getErrorCode());
            assertInstanceOf(OutOfMemoryError.class, thrown.getCause());
        }

        @Test
        @DisplayName("converts NegativeArraySizeException to OutOfMemoryDpiException (no page)")
        void negativeArraySizeToDpiExceptionNoPage() {
            OutOfMemoryDpiException thrown =
                    assertThrows(
                            OutOfMemoryDpiException.class,
                            () ->
                                    ExceptionUtils.handleOomRendering(
                                            300,
                                            () -> {
                                                throw new NegativeArraySizeException("-1");
                                            }));
            assertEquals(ErrorCode.OUT_OF_MEMORY_DPI.getCode(), thrown.getErrorCode());
            assertInstanceOf(NegativeArraySizeException.class, thrown.getCause());
        }
    }

    @Nested
    @DisplayName("createOutOfMemoryDpiException overloads")
    class OutOfMemoryDpiFactoryTests {

        @Test
        @DisplayName("page + dpi + Throwable wraps cause and sets code")
        void pageDpiThrowable() {
            Throwable cause = new IllegalStateException("too big");
            OutOfMemoryDpiException ex =
                    ExceptionUtils.createOutOfMemoryDpiException(4, 600, cause);
            assertSame(cause, ex.getCause());
            assertEquals(ErrorCode.OUT_OF_MEMORY_DPI.getCode(), ex.getErrorCode());
        }

        @Test
        @DisplayName("page + dpi + OutOfMemoryError overload wraps the error")
        void pageDpiOomError() {
            OutOfMemoryError cause = new OutOfMemoryError("oom");
            OutOfMemoryDpiException ex =
                    ExceptionUtils.createOutOfMemoryDpiException(2, 300, cause);
            assertSame(cause, ex.getCause());
        }

        @Test
        @DisplayName("dpi + Throwable overload wraps cause")
        void dpiThrowable() {
            Throwable cause = new RuntimeException("x");
            OutOfMemoryDpiException ex = ExceptionUtils.createOutOfMemoryDpiException(300, cause);
            assertSame(cause, ex.getCause());
            assertEquals(ErrorCode.OUT_OF_MEMORY_DPI.getCode(), ex.getErrorCode());
        }

        @Test
        @DisplayName("dpi + OutOfMemoryError overload wraps the error")
        void dpiOomError() {
            OutOfMemoryError cause = new OutOfMemoryError("oom");
            OutOfMemoryDpiException ex = ExceptionUtils.createOutOfMemoryDpiException(300, cause);
            assertSame(cause, ex.getCause());
        }

        @Test
        @DisplayName("rejects null cause")
        void nullCause() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createOutOfMemoryDpiException(1, 300, (Throwable) null));
        }
    }

    @Nested
    @DisplayName("Ghostscript output analysis")
    class GhostscriptAnalysisTests {

        @Test
        @DisplayName("null/blank output produces generic compression exception")
        void blankOutput() {
            GhostscriptException ex = ExceptionUtils.createGhostscriptCompressionException("   ");
            assertEquals(ErrorCode.GHOSTSCRIPT_COMPRESSION.getCode(), ex.getErrorCode());
        }

        @Test
        @DisplayName("recognized page drawing error yields page-drawing error code")
        void pageDrawingError() {
            String output = "Page 3\nERROR: page drawing error encountered while processing";
            GhostscriptException ex = ExceptionUtils.createGhostscriptCompressionException(output);
            assertEquals(ErrorCode.GHOSTSCRIPT_PAGE_DRAWING.getCode(), ex.getErrorCode());
        }

        @Test
        @DisplayName("non-page-drawing output falls back to compression error code")
        void unrecognizedOutput() {
            String output = "Some random ghostscript chatter that is not an error marker";
            GhostscriptException ex = ExceptionUtils.createGhostscriptCompressionException(output);
            assertEquals(ErrorCode.GHOSTSCRIPT_COMPRESSION.getCode(), ex.getErrorCode());
        }

        @Test
        @DisplayName("detectGhostscriptCriticalError returns exception only for critical output")
        void detectCritical() {
            GhostscriptException critical =
                    ExceptionUtils.detectGhostscriptCriticalError(
                            "Page 1\ncould not draw this page");
            assertNotNull(critical);
            assertEquals(ErrorCode.GHOSTSCRIPT_PAGE_DRAWING.getCode(), critical.getErrorCode());
        }

        @Test
        @DisplayName("detectGhostscriptCriticalError returns null for non-critical output")
        void detectNonCritical() {
            assertNull(ExceptionUtils.detectGhostscriptCriticalError("just informational output"));
            assertNull(ExceptionUtils.detectGhostscriptCriticalError(null));
        }

        @Test
        @DisplayName("compression exception derived from cause message")
        void compressionFromCauseMessage() {
            GhostscriptException ex =
                    ExceptionUtils.createGhostscriptCompressionException(
                            new Exception("Page 2\npage drawing error"));
            assertEquals(ErrorCode.GHOSTSCRIPT_PAGE_DRAWING.getCode(), ex.getErrorCode());
        }

        @Test
        @DisplayName("createGhostscriptCompressionException rejects null cause overload")
        void compressionNullCause() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.createGhostscriptCompressionException((Exception) null));
        }

        @Test
        @DisplayName("multiple affected pages are summarized in the message")
        void multiplePages() {
            String output = "Page 1\npage drawing error\nPage 2\ncould not draw this page";
            GhostscriptException ex = ExceptionUtils.createGhostscriptCompressionException(output);
            assertEquals(ErrorCode.GHOSTSCRIPT_PAGE_DRAWING.getCode(), ex.getErrorCode());
            assertNotNull(ex.getMessage());
        }
    }

    @Nested
    @DisplayName("wrapException")
    class WrapExceptionTests {

        @Test
        @DisplayName("RuntimeException is returned unchanged")
        void runtimePassthrough() {
            RuntimeException original = new IllegalStateException("boom");
            RuntimeException wrapped = ExceptionUtils.wrapException(original, "merge");
            assertSame(original, wrapped);
        }

        @Test
        @DisplayName("BaseAppException (IOException subtype) is wrapped in a RuntimeException")
        void baseAppExceptionWrapped() {
            // A corrupted-pdf IOException triggers handlePdfException -> PdfCorruptedException.
            IOException corrupted = new IOException("Invalid PDF");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(corrupted)).thenReturn(true);
                RuntimeException wrapped = ExceptionUtils.wrapException(corrupted, "merge");
                assertInstanceOf(BaseAppException.class, wrapped.getCause());
            }
        }

        @Test
        @DisplayName("plain IOException is wrapped via file-processing exception")
        void plainIoExceptionWrapped() {
            IOException io = new IOException("disk full");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(io)).thenReturn(false);
                RuntimeException wrapped = ExceptionUtils.wrapException(io, "split");
                assertInstanceOf(IOException.class, wrapped.getCause());
                assertFalse(wrapped.getCause() instanceof BaseAppException);
            }
        }

        @Test
        @DisplayName("checked non-IO exception is wrapped with operation context")
        void checkedExceptionWrapped() {
            Exception checked = new Exception("oops");
            RuntimeException wrapped = ExceptionUtils.wrapException(checked, "convert");
            assertSame(checked, wrapped.getCause());
            assertTrue(wrapped.getMessage().contains("convert"));
            assertTrue(wrapped.getMessage().contains("oops"));
        }

        @Test
        @DisplayName("rejects null exception or operation")
        void wrapNullArgs() {
            assertThrows(
                    IllegalArgumentException.class, () -> ExceptionUtils.wrapException(null, "op"));
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.wrapException(new Exception(), null));
        }
    }

    @Nested
    @DisplayName("logException return value and handlePdfException null guard")
    class LogAndHandleTests {

        @Test
        @DisplayName("logException returns the same exception instance for fluent throw")
        void logExceptionReturnsSame() {
            Exception e = new RuntimeException("unexpected");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(e)).thenReturn(false);
                Exception returned = ExceptionUtils.logException("op", e);
                assertSame(e, returned);
            }
        }

        @Test
        @DisplayName("logException rejects null operation or exception")
        void logExceptionNullArgs() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ExceptionUtils.logException(null, new Exception()));
            assertThrows(
                    IllegalArgumentException.class, () -> ExceptionUtils.logException("op", null));
        }

        @Test
        @DisplayName("handlePdfException rejects null exception")
        void handlePdfNull() {
            assertThrows(
                    IllegalArgumentException.class, () -> ExceptionUtils.handlePdfException(null));
        }

        @Test
        @DisplayName("handlePdfException with context wraps corrupted PDF and includes context")
        void handlePdfWithContext() {
            IOException original = new IOException("damaged");
            try (MockedStatic<PdfErrorUtils> mock = mockStatic(PdfErrorUtils.class)) {
                mock.when(() -> PdfErrorUtils.isCorruptedPdfError(original)).thenReturn(true);
                IOException result = ExceptionUtils.handlePdfException(original, "during merge");
                assertInstanceOf(PdfCorruptedException.class, result);
                assertTrue(result.getMessage().contains("during merge"));
            }
        }
    }
}
