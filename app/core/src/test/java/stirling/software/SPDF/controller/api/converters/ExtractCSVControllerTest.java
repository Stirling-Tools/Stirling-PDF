package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedConstruction;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.pdf.FlexibleCSVWriter;
import stirling.software.common.service.CustomPDFDocumentFactory;

import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.Table;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;

@ExtendWith(MockitoExtension.class)
class ExtractCSVControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @InjectMocks private ExtractCSVController controller;

    @Test
    void pdfToCsv_noTables_returnsNoContent() throws Exception {
        PDFWithPageNums request = createRequest();
        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(request)).thenReturn(document);
        doReturn(List.of(1)).when(request).getPageNumbersList(document, true);

        Page page = mock(Page.class);

        try (MockedConstruction<ObjectExtractor> extractorConstruction =
                        mockConstruction(
                                ObjectExtractor.class,
                                (mock, context) -> when(mock.extract(anyInt())).thenReturn(page));
                MockedConstruction<SpreadsheetExtractionAlgorithm> seaConstruction =
                        mockConstruction(
                                SpreadsheetExtractionAlgorithm.class,
                                (mock, context) ->
                                        when(mock.extract(page))
                                                .thenReturn(Collections.emptyList()))) {
            ResponseEntity<?> response = controller.pdfToCsv(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
            assertThat(response.getBody()).isNull();
        }
    }

    @Test
    void pdfToCsv_singleTable_returnsCsv() throws Exception {
        PDFWithPageNums request = createRequest();
        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(request)).thenReturn(document);
        doReturn(List.of(1)).when(request).getPageNumbersList(document, true);

        Page page = mock(Page.class);
        Table table = mock(Table.class);

        try (MockedConstruction<ObjectExtractor> extractorConstruction =
                        mockConstruction(
                                ObjectExtractor.class,
                                (mock, context) -> when(mock.extract(anyInt())).thenReturn(page));
                MockedConstruction<SpreadsheetExtractionAlgorithm> seaConstruction =
                        mockConstruction(
                                SpreadsheetExtractionAlgorithm.class,
                                (mock, context) ->
                                        when(mock.extract(page)).thenReturn(List.of(table)));
                MockedConstruction<FlexibleCSVWriter> writerConstruction =
                        mockConstruction(
                                FlexibleCSVWriter.class,
                                (mock, context) ->
                                        doAnswer(
                                                        invocation -> {
                                                            StringWriter writer =
                                                                    invocation.getArgument(
                                                                            0, StringWriter.class);
                                                            writer.write("value1");
                                                            return null;
                                                        })
                                                .when(mock)
                                                .write(
                                                        ArgumentMatchers.any(StringWriter.class),
                                                        anyList()))) {
            ResponseEntity<?> response = controller.pdfToCsv(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.parseMediaType("text/csv"));
            assertThat(response.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("sample_extracted.csv");
            assertThat(response.getBody()).isEqualTo("value1");
        }
    }

    @Test
    void pdfToCsv_multipleTables_returnsZip() throws Exception {
        PDFWithPageNums request = createRequest();
        PDDocument document = mock(PDDocument.class);
        when(pdfDocumentFactory.load(request)).thenReturn(document);
        doReturn(List.of(1)).when(request).getPageNumbersList(document, true);

        Page page = mock(Page.class);
        Table table1 = mock(Table.class);
        Table table2 = mock(Table.class);

        AtomicInteger writerCounter = new AtomicInteger();

        try (MockedConstruction<ObjectExtractor> extractorConstruction =
                        mockConstruction(
                                ObjectExtractor.class,
                                (mock, context) -> when(mock.extract(anyInt())).thenReturn(page));
                MockedConstruction<SpreadsheetExtractionAlgorithm> seaConstruction =
                        mockConstruction(
                                SpreadsheetExtractionAlgorithm.class,
                                (mock, context) ->
                                        when(mock.extract(page))
                                                .thenReturn(List.of(table1, table2)));
                MockedConstruction<FlexibleCSVWriter> writerConstruction =
                        mockConstruction(
                                FlexibleCSVWriter.class,
                                (mock, context) ->
                                        doAnswer(
                                                        invocation -> {
                                                            StringWriter writer =
                                                                    invocation.getArgument(
                                                                            0, StringWriter.class);
                                                            int index =
                                                                    writerCounter.incrementAndGet();
                                                            writer.write("table" + index);
                                                            return null;
                                                        })
                                                .when(mock)
                                                .write(
                                                        ArgumentMatchers.any(StringWriter.class),
                                                        anyList()))) {
            ResponseEntity<?> response = controller.pdfToCsv(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.parseMediaType("application/zip"));
            assertThat(response.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("sample_extracted.zip");
            assertThat(response.getBody()).isInstanceOf(byte[].class);

            byte[] zipBytes = (byte[]) response.getBody();
            Map<String, String> entries = extractZipEntries(zipBytes);

            assertThat(entries)
                    .containsEntry("sample_p1_t1.csv", "table1")
                    .containsEntry("sample_p1_t2.csv", "table2");
        }
    }

    private PDFWithPageNums createRequest() {
        PDFWithPageNums request = spy(new PDFWithPageNums());
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "sample.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1});
        request.setFileInput(file);
        return request;
    }

    private Map<String, String> extractZipEntries(byte[] zipBytes) throws Exception {
        Map<String, String> entries = new LinkedHashMap<>();
        try (ZipInputStream zipInputStream =
                new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            byte[] buffer = new byte[1024];
            while ((entry = zipInputStream.getNextEntry()) != null) {
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                int read;
                while ((read = zipInputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, read);
                }
                entries.put(entry.getName(), outputStream.toString(StandardCharsets.UTF_8));
                zipInputStream.closeEntry();
            }
        }
        return entries;
    }
}
