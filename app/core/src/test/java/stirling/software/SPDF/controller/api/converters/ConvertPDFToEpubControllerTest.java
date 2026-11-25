package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.OutputFormat;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.TargetDevice;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.officeconvert.EbookOptions;
import stirling.software.officeconvert.OfficeConvert;

@ExtendWith(MockitoExtension.class)
class ConvertPDFToEpubControllerTest {

    @Mock private OfficeConversionService officeConversionService;

    @InjectMocks private ConvertPDFToEpubController controller;

    private final ResponseEntity<Resource> converted =
            ResponseEntity.ok(new ByteArrayResource(new byte[0]));

    @BeforeEach
    void setUp() {
        Mockito.lenient()
                .when(officeConversionService.settings())
                .thenReturn(OfficeConvert.Settings.defaults());
    }

    private static ConvertPdfToEpubRequest request(String name) {
        ConvertPdfToEpubRequest request = new ConvertPdfToEpubRequest();
        request.setFileInput(
                new MockMultipartFile("fileInput", name, "application/pdf", "%PDF".getBytes()));
        return request;
    }

    private OfficeConvert.Settings captureSettings(String format, MediaType type) throws Exception {
        ArgumentCaptor<OfficeConvert.Settings> settings =
                ArgumentCaptor.forClass(OfficeConvert.Settings.class);
        Mockito.verify(officeConversionService)
                .convert(any(MultipartFile.class), eq(format), eq(type), settings.capture());
        return settings.getValue();
    }

    @Test
    void convertPdfToEpub_defaultsToTabletEpubWithChapters() throws Exception {
        when(officeConversionService.convert(any(MultipartFile.class), any(), any(), any()))
                .thenReturn(converted);

        assertSame(converted, controller.convertPdfToEpub(request("book.pdf")));

        EbookOptions ebook =
                captureSettings("epub", MediaType.valueOf("application/epub+zip")).ebook();
        assertEquals(EbookOptions.Device.TABLET, ebook.device());
        assertEquals(true, ebook.chapters());
    }

    @Test
    void convertPdfToAzw3_usesKindleProfileWithoutChapters() throws Exception {
        when(officeConversionService.convert(any(MultipartFile.class), any(), any(), any()))
                .thenReturn(converted);
        ConvertPdfToEpubRequest request = request("book.pdf");
        request.setOutputFormat(OutputFormat.AZW3);
        request.setTargetDevice(TargetDevice.KINDLE_EINK_TEXT);
        request.setDetectChapters(false);

        controller.convertPdfToEpub(request);

        EbookOptions ebook =
                captureSettings("azw3", MediaType.valueOf("application/vnd.amazon.ebook")).ebook();
        assertEquals(EbookOptions.Device.KINDLE, ebook.device());
        assertEquals(false, ebook.chapters());
    }

    @Test
    void convertPdfToEpub_rejectsNonPdfInput() {
        assertThrows(
                IllegalArgumentException.class,
                () -> controller.convertPdfToEpub(request("book.docx")));
        Mockito.verifyNoInteractions(officeConversionService);
    }
}
