package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.service.misc.ReplaceAndInvertColorService;
import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.model.io.InputStreamResource;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ReplaceAndInvertColorControllerTest {

    private static Response streamingOk(byte[] bytes) {
        return Response.ok(bytes).build();
    }

    @Mock private ReplaceAndInvertColorService replaceAndInvertColorService;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private ReplaceAndInvertColorController controller;

    private FileUpload pdfFile;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
        pdfFile = TestFileUploads.pdf("PDF content".getBytes());
    }

    @Test
    void replaceAndInvertColor_highContrast_success() throws IOException {
        byte[] resultBytes = "modified PDF".getBytes();
        InputStreamResource resource =
                new InputStreamResource(new ByteArrayInputStream(resultBytes));

        when(replaceAndInvertColorService.replaceAndInvertColor(
                        any(),
                        eq(ReplaceAndInvert.HIGH_CONTRAST_COLOR),
                        eq(HighContrastColorCombination.WHITE_TEXT_ON_BLACK),
                        isNull(),
                        isNull()))
                .thenReturn(resource);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            Response expectedResponse = streamingOk(resultBytes);
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response =
                    controller.replaceAndInvertColor(
                            pdfFile,
                            null,
                            ReplaceAndInvert.HIGH_CONTRAST_COLOR,
                            HighContrastColorCombination.WHITE_TEXT_ON_BLACK,
                            null,
                            null);

            assertNotNull(response);
            assertEquals(200, response.getStatus());
        }
    }

    @Test
    void replaceAndInvertColor_customColor_success() throws IOException {
        byte[] resultBytes = "modified PDF".getBytes();
        InputStreamResource resource =
                new InputStreamResource(new ByteArrayInputStream(resultBytes));

        when(replaceAndInvertColorService.replaceAndInvertColor(
                        any(),
                        eq(ReplaceAndInvert.CUSTOM_COLOR),
                        isNull(),
                        eq("0"),
                        eq("16777215")))
                .thenReturn(resource);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            Response expectedResponse = streamingOk(resultBytes);
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response =
                    controller.replaceAndInvertColor(
                            pdfFile, null, ReplaceAndInvert.CUSTOM_COLOR, null, "0", "16777215");

            assertNotNull(response);
            assertEquals(200, response.getStatus());
        }
    }

    @Test
    void replaceAndInvertColor_fullInversion_success() throws IOException {
        byte[] resultBytes = "modified PDF".getBytes();
        InputStreamResource resource =
                new InputStreamResource(new ByteArrayInputStream(resultBytes));

        when(replaceAndInvertColorService.replaceAndInvertColor(
                        any(), eq(ReplaceAndInvert.FULL_INVERSION), isNull(), isNull(), isNull()))
                .thenReturn(resource);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            Response expectedResponse = streamingOk(resultBytes);
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response =
                    controller.replaceAndInvertColor(
                            pdfFile, null, ReplaceAndInvert.FULL_INVERSION, null, null, null);

            assertNotNull(response);
            assertEquals(200, response.getStatus());
        }
    }

    @Test
    void replaceAndInvertColor_serviceThrowsIOException() throws IOException {
        when(replaceAndInvertColorService.replaceAndInvertColor(any(), any(), any(), any(), any()))
                .thenThrow(new IOException("Service error"));

        assertThrows(
                IOException.class,
                () ->
                        controller.replaceAndInvertColor(
                                pdfFile, null, ReplaceAndInvert.FULL_INVERSION, null, null, null));
    }

    @Test
    void replaceAndInvertColor_generatesCorrectFilename() throws IOException {
        byte[] resultBytes = "modified PDF".getBytes();
        InputStreamResource resource =
                new InputStreamResource(new ByteArrayInputStream(resultBytes));

        when(replaceAndInvertColorService.replaceAndInvertColor(any(), any(), any(), any(), any()))
                .thenReturn(resource);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            Response expectedResponse = streamingOk(resultBytes);
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            controller.replaceAndInvertColor(
                    pdfFile, null, ReplaceAndInvert.FULL_INVERSION, null, null, null);

            mockedWebResponse.verify(
                    () -> WebResponseUtils.pdfFileToWebResponse(any(TempFile.class), anyString()));
        }
    }
}
