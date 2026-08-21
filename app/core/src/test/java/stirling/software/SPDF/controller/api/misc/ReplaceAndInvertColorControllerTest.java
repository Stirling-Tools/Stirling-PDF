package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.ReplaceAndInvertColorRequest;
import stirling.software.SPDF.service.misc.ReplaceAndInvertColorService;
import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ReplaceAndInvertColorControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Mock private ReplaceAndInvertColorService replaceAndInvertColorService;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private ReplaceAndInvertColorController controller;

    private MockMultipartFile pdfFile;
    private ReplaceAndInvertColorRequest request;

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
        pdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "test.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "PDF content".getBytes());
        request = new ReplaceAndInvertColorRequest();
        request.setFileInput(pdfFile);
    }

    @Test
    void replaceAndInvertColor_highContrast_success() throws IOException {
        request.setReplaceAndInvertOption(ReplaceAndInvert.HIGH_CONTRAST_COLOR);
        request.setHighContrastColorCombination(HighContrastColorCombination.WHITE_TEXT_ON_BLACK);

        byte[] resultBytes = "modified PDF".getBytes();
        InputStreamResource resource =
                new InputStreamResource(new ByteArrayInputStream(resultBytes));

        when(replaceAndInvertColorService.replaceAndInvertColor(
                        eq(pdfFile),
                        eq(ReplaceAndInvert.HIGH_CONTRAST_COLOR),
                        eq(HighContrastColorCombination.WHITE_TEXT_ON_BLACK),
                        isNull(),
                        isNull()))
                .thenReturn(resource);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<Resource> expectedResponse = streamingOk(resultBytes);
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            ResponseEntity<Resource> response = controller.replaceAndInvertColor(request);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void replaceAndInvertColor_customColor_success() throws IOException {
        request.setReplaceAndInvertOption(ReplaceAndInvert.CUSTOM_COLOR);
        request.setBackGroundColor("0");
        request.setTextColor("16777215");

        byte[] resultBytes = "modified PDF".getBytes();
        InputStreamResource resource =
                new InputStreamResource(new ByteArrayInputStream(resultBytes));

        when(replaceAndInvertColorService.replaceAndInvertColor(
                        eq(pdfFile),
                        eq(ReplaceAndInvert.CUSTOM_COLOR),
                        isNull(),
                        eq("0"),
                        eq("16777215")))
                .thenReturn(resource);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<Resource> expectedResponse = streamingOk(resultBytes);
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            ResponseEntity<Resource> response = controller.replaceAndInvertColor(request);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void replaceAndInvertColor_fullInversion_success() throws IOException {
        request.setReplaceAndInvertOption(ReplaceAndInvert.FULL_INVERSION);

        byte[] resultBytes = "modified PDF".getBytes();
        InputStreamResource resource =
                new InputStreamResource(new ByteArrayInputStream(resultBytes));

        when(replaceAndInvertColorService.replaceAndInvertColor(
                        eq(pdfFile),
                        eq(ReplaceAndInvert.FULL_INVERSION),
                        isNull(),
                        isNull(),
                        isNull()))
                .thenReturn(resource);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<Resource> expectedResponse = streamingOk(resultBytes);
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            ResponseEntity<Resource> response = controller.replaceAndInvertColor(request);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void replaceAndInvertColor_serviceThrowsIOException() throws IOException {
        request.setReplaceAndInvertOption(ReplaceAndInvert.FULL_INVERSION);

        when(replaceAndInvertColorService.replaceAndInvertColor(any(), any(), any(), any(), any()))
                .thenThrow(new IOException("Service error"));

        assertThrows(IOException.class, () -> controller.replaceAndInvertColor(request));
    }

    @Test
    void replaceAndInvertColor_generatesCorrectFilename() throws IOException {
        request.setReplaceAndInvertOption(ReplaceAndInvert.FULL_INVERSION);

        byte[] resultBytes = "modified PDF".getBytes();
        InputStreamResource resource =
                new InputStreamResource(new ByteArrayInputStream(resultBytes));

        when(replaceAndInvertColorService.replaceAndInvertColor(any(), any(), any(), any(), any()))
                .thenReturn(resource);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<Resource> expectedResponse = streamingOk(resultBytes);
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            controller.replaceAndInvertColor(request);

            mockedWebResponse.verify(
                    () -> WebResponseUtils.pdfFileToWebResponse(any(TempFile.class), anyString()));
        }
    }
}
