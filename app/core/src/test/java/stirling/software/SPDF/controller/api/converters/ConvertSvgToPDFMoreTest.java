package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.converters.SvgToPdfRequest;
import stirling.software.SPDF.utils.SvgToPdf;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.SvgSanitizer;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Gap coverage for {@link ConvertSvgToPDF}: the multi-file zip path and the empty-output failure
 * branches not covered by ConvertSvgToPDFTest.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ConvertSvgToPDF zip and failure branches")
class ConvertSvgToPDFMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private SvgSanitizer svgSanitizer;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private ConvertSvgToPDF controller;

    @BeforeEach
    void setUp() throws Exception {
        // Real backing files so the zip/pdf streams can actually be written.
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("svg", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    private static MockMultipartFile svg(String name, String content) {
        return new MockMultipartFile("fileInput", name, "image/svg+xml", content.getBytes());
    }

    private static List<String> zipNames(Resource resource) throws Exception {
        List<String> names = new ArrayList<>();
        try (ZipInputStream zis =
                new ZipInputStream(new ByteArrayInputStream(resource.getContentAsByteArray()))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                names.add(e.getName());
                zis.closeEntry();
            }
        }
        return names;
    }

    @Test
    @DisplayName("multiple SVGs in separate mode are returned as a zip")
    void multipleSeparateZipsOutput() throws Exception {
        byte[] sanitized1 = "<svg>a</svg>".getBytes();
        byte[] sanitized2 = "<svg>b</svg>".getBytes();
        byte[] pdf1 = "pdf1".getBytes();
        byte[] pdf2 = "pdf2".getBytes();

        SvgToPdfRequest request = new SvgToPdfRequest();
        request.setFileInput(
                new MockMultipartFile[] {
                    svg("a.svg", "<svg>1</svg>"), svg("b.svg", "<svg>2</svg>")
                });
        request.setCombineIntoSinglePdf(false);

        when(svgSanitizer.sanitize("<svg>1</svg>".getBytes())).thenReturn(sanitized1);
        when(svgSanitizer.sanitize("<svg>2</svg>".getBytes())).thenReturn(sanitized2);
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdf1)).thenReturn(pdf1);
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdf2)).thenReturn(pdf2);

        try (MockedStatic<SvgToPdf> svg = Mockito.mockStatic(SvgToPdf.class)) {
            svg.when(() -> SvgToPdf.convert(sanitized1)).thenReturn(pdf1);
            svg.when(() -> SvgToPdf.convert(sanitized2)).thenReturn(pdf2);

            ResponseEntity<Resource> response = controller.convertSvgToPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            List<String> names = zipNames(response.getBody());
            assertEquals(2, names.size());
        }
    }

    @Nested
    @DisplayName("empty-output failures")
    class EmptyOutputs {

        @Test
        @DisplayName("combined mode returns 500 when the combined PDF is empty")
        void combinedEmptyOutput() throws Exception {
            byte[] sanitized = "<svg>s</svg>".getBytes();
            SvgToPdfRequest request = new SvgToPdfRequest();
            request.setFileInput(new MockMultipartFile[] {svg("a.svg", "<svg>1</svg>")});
            request.setCombineIntoSinglePdf(true);

            when(svgSanitizer.sanitize("<svg>1</svg>".getBytes())).thenReturn(sanitized);

            try (MockedStatic<SvgToPdf> svg = Mockito.mockStatic(SvgToPdf.class)) {
                svg.when(() -> SvgToPdf.combineIntoPdf(any())).thenReturn(new byte[0]);

                ResponseEntity<Resource> response = controller.convertSvgToPdf(request);

                assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            }
        }

        @Test
        @DisplayName("separate mode returns 500 when no file converts successfully")
        void separateAllEmpty() throws Exception {
            byte[] sanitized = "<svg>s</svg>".getBytes();
            SvgToPdfRequest request = new SvgToPdfRequest();
            request.setFileInput(new MockMultipartFile[] {svg("a.svg", "<svg>1</svg>")});
            request.setCombineIntoSinglePdf(false);

            when(svgSanitizer.sanitize("<svg>1</svg>".getBytes())).thenReturn(sanitized);

            try (MockedStatic<SvgToPdf> svg = Mockito.mockStatic(SvgToPdf.class)) {
                // Empty conversion output -> the file is skipped -> no successful conversions.
                svg.when(() -> SvgToPdf.convert(sanitized)).thenReturn(new byte[0]);

                ResponseEntity<Resource> response = controller.convertSvgToPdf(request);

                assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            }
        }

        @Test
        @DisplayName("combined mode returns 500 when conversion throws IOException")
        void combinedConversionThrows() throws Exception {
            byte[] sanitized = "<svg>s</svg>".getBytes();
            SvgToPdfRequest request = new SvgToPdfRequest();
            request.setFileInput(new MockMultipartFile[] {svg("a.svg", "<svg>1</svg>")});
            request.setCombineIntoSinglePdf(true);

            when(svgSanitizer.sanitize("<svg>1</svg>".getBytes())).thenReturn(sanitized);

            try (MockedStatic<SvgToPdf> svg = Mockito.mockStatic(SvgToPdf.class)) {
                svg.when(() -> SvgToPdf.combineIntoPdf(any()))
                        .thenThrow(new IOException("convert failure"));

                ResponseEntity<Resource> response = controller.convertSvgToPdf(request);

                assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            }
        }
    }

    @Test
    @DisplayName("a single converted SVG uses the pdf-file response path")
    void singleConvertedUsesPdfResponse() throws Exception {
        byte[] sanitized = "<svg>s</svg>".getBytes();
        byte[] pdf = "pdf".getBytes();
        SvgToPdfRequest request = new SvgToPdfRequest();
        request.setFileInput(new MockMultipartFile[] {svg("only.svg", "<svg>1</svg>")});
        request.setCombineIntoSinglePdf(false);

        when(svgSanitizer.sanitize("<svg>1</svg>".getBytes())).thenReturn(sanitized);
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdf)).thenReturn(pdf);

        ResponseEntity<Resource> stub =
                ResponseEntity.ok(new org.springframework.core.io.ByteArrayResource(pdf));
        try (MockedStatic<SvgToPdf> svg = Mockito.mockStatic(SvgToPdf.class);
                MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
            svg.when(() -> SvgToPdf.convert(sanitized)).thenReturn(pdf);
            wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(TempFile.class), anyString()))
                    .thenReturn(stub);

            ResponseEntity<Resource> response = controller.convertSvgToPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }
}
